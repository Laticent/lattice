// The /libraries/ltt/ demo's model: a three-slide deck's narration, written as an LTT file by the
// same steps Lattice's export takes (lib/core/ltt-deck.mjs `deckLtt`), then read back with the
// real library. Cadenza estimates each slide's timing; @laticent/ltt holds it, checks it, packs it
// and answers "what is on screen at this moment". Kept here, out of the page, so a unit test
// (ltt-demo.test.ts) pins what the page shows.

import { buildTrack, ENGINE_HASH, interCueGapMs, PACE_PRESETS, type PaceName } from './cadenza/index';
import { type CaptionTrack, type Ltt, type LttSegment, pack, positionAt, segmentHashInput, timeline, validateLtt } from './ltt/index';

export const SAMPLE_SLIDES = [
	'Revenue grew 18% to $4.2M this quarter. Most of it came from renewals.',
	'Churn fell for the third quarter running. The new onboarding is why.',
	'We ask for two more hires in support. Both pay for themselves by March.',
];

export const DECK_PACES: readonly PaceName[] = ['brisk', 'natural', 'deliberate'];

async function sha256Hex(text: string): Promise<string> {
	const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// The format holds whole milliseconds; Cadenza's estimate is fractional (ltt-deck.mjs `wholeMs`).
function wholeMs(track: CaptionTrack): CaptionTrack {
	const r = Math.round;
	return {
		durationMs: r(track.durationMs),
		cues: track.cues.map((c) => ({
			...c,
			startMs: r(c.startMs),
			endMs: r(c.endMs),
			words: c.words.map((w) => ({ ...w, startMs: r(w.startMs), endMs: r(w.endMs) })),
		})),
	};
}

/** One LTT file for the deck: a slide segment per narrated slide, a hold for a silent one. */
export async function buildDeck(slides: readonly string[], deckPace: PaceName = 'natural'): Promise<Ltt> {
	const beats = PACE_PRESETS[deckPace];
	const inputs = { engine: ENGINE_HASH, pace: 'moderate' as const, deckPace };
	const segments: LttSegment[] = [];
	for (let i = 0; i < slides.length; i++) {
		const text = slides[i].trim();
		const id = `d${i + 1}`;
		const at = { slide: i + 1 };
		const holdMs = i === 0 ? 0 : beats.slide;
		const track = wholeMs(buildTrack(text, { pace: 'moderate' }));
		if (!track.cues.length) {
			segments.push({ id, kind: 'hold', at, holdMs });
			continue;
		}
		const last = track.cues[track.cues.length - 1];
		const display = last.words[last.words.length - 1]?.display ?? '';
		const tailMs = Math.round(Math.max(beats.leave, interCueGapMs(display, !!last.endsParagraph, 1)));
		const hash = `sha256:${await sha256Hex(segmentHashInput(text, inputs))}`;
		segments.push({ id, kind: 'slide', at, hash, basis: 'estimate', holdMs, track, tailMs });
	}
	return { format: 'ltt', version: '1.0', source: { kind: 'deck', id: 'board.md' }, inputs, seekable: true, segments };
}

/** Ways to break a valid file, each the kind of mistake a hand-edit or a buggy producer makes. */
export const BREAKS: { id: string; label: string; apply: (ltt: Ltt) => void }[] = [
	{ id: 'version', label: 'A version this reader does not know', apply: (l) => { l.version = '2.0'; } },
	{
		id: 'word',
		label: 'A word that ends before it starts',
		apply: (l) => {
			const seg = l.segments.find((s) => s.kind === 'slide');
			if (seg && seg.kind === 'slide') seg.track.cues[0].words[1].endMs = seg.track.cues[0].words[1].startMs - 40;
		},
	},
	{ id: 'hash', label: 'A hash that is not SHA-256', apply: (l) => { const s = l.segments.find((x) => x.kind === 'slide'); if (s && s.kind === 'slide') s.hash = 'md5:9e107d9d372bb6826bd81d3542a419d6'; } },
	{ id: 'slide', label: 'Slide number 0', apply: (l) => { l.segments[0].at = { slide: 0 }; } },
];

/** The validator's sentences for `ltt` with one break applied (or none), on a copy. */
export function validateWith(ltt: Ltt, breakId: string | null): string[] {
	const copy = structuredClone(ltt);
	BREAKS.find((b) => b.id === breakId)?.apply(copy);
	return validateLtt(copy);
}

/** Sizes of the two encodings, in UTF-8 bytes of compact JSON. */
export function sizes(ltt: Ltt): { canonical: number; packed: number } {
	const n = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
	return { canonical: n(ltt), packed: n(pack(ltt)) };
}

/** What is on screen `ms` into the file: the slide, its phase, and the word to light. */
export interface Moment {
	slide: number;
	phase: string;
	cueIndex: number;
	wordIndex: number;
	localMs: number;
}

export function momentAt(ltt: Ltt, ms: number): Moment {
	const line = timeline(ltt);
	const t = Math.max(0, Math.min(ms, line.durationMs));
	let i = line.segments.findIndex((e) => t < e.startMs + e.lengthMs);
	if (i < 0) i = line.segments.length - 1;
	const local = t - line.segments[i].startMs;
	const p = positionAt(ltt.segments[i], local);
	const atEnd = t >= line.durationMs;
	return { slide: i + 1, phase: atEnd ? 'end' : p.phase, cueIndex: p.cueIndex, wordIndex: p.wordIndex, localMs: local };
}

/** `m:ss.t` */
export function clock(ms: number): string {
	const s = Math.max(0, ms) / 1000;
	return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}
