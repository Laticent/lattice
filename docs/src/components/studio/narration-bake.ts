// Baking a deck's narration into the file it ships in — the PRODUCER side of "a shared
// deck has no voice" (#1393, engineering/decisions/2026-08-04-shared-deck-narration-audio.md).
//
// THE CONTRACT IS ALL-OR-NOTHING. A deck that ships with audio ships with ALL of its audio.
// The cache is consulted first and is usually most of the answer — every sentence the author
// rehearsed is already on the device under a content-complete key (#1352) — and whatever is
// missing is synthesized here, in the voice the author chose in the export panel, before the
// file is written. If any sentence is still missing when that finishes, the export REFUSES
// and names them. It does not ship a deck that speaks four sentences and then goes quiet.
//
// That reverses the design doc's question 3, which recommended "ship what is there, and say
// what is missing", on the reasoning that partial audio is the same graceful floor the live
// reader has when a synth times out. It is not the same. The live reader's floor is a
// SECOND-long gap in a delivery the author is watching and can re-run. A baked artifact is
// opened once, by someone else, with no way to fix it and no idea anything is wrong — a
// board member hears a presenter stop mid-argument. "42 of 47 sentences have audio" is a
// number the author reads and dismisses; the silence is what their audience gets.
//
// TWO ENTRY POINTS, and the split is the feature. `measureNarration` answers "what would
// this cost?" — how many sentences are already prepared, how many would be billed, roughly
// how much and how long — from the clip store's `meta` index alone, so the panel can quote
// the bill BEFORE the author commits to it. `bakeNarration` then does the real work. They
// resolve narration through the SAME chain, so the number shown is the number charged.
//
// EVERY SYNTHESIZED CLIP IS BANKED as it lands, in the persistent store, under the key
// playback uses. A bake that is cancelled or that fails on sentence 280 is not wasted work:
// the next attempt starts from what the first one paid for, and so does Present.

import { buildTrack, interCueGapMs } from '@/lib/cadenza';
import { acronymSpokenMap, frontMatterCaptions, frontMatterLang, lexiconMap } from '@/lib/resolve-captions';
import { clipSizes, getClip, putClip } from '@/playground/narration-store.js';
import { narrateChart } from '@/playground/read-along-core.generated.js';
import { glossaryEntries, resolveGlossaryMode } from '../../../../lib/core/glossary-auto.mjs';
import { stripFrontMatter } from './front-matter';
import { splitSlides } from './lint';
import { applyChartNarration, resolveNarration } from './narration-resolve';
import { type BakeVoice, bakeClipKeys, slideToSpeech, synthBakeClip } from './read-aloud';
import { getCaption } from './slide-caption';
import { getNote } from './slide-notes';

/** One spoken sentence, as it ships. */
export type BakedCue = {
	/** The caption line, exactly as the live reader shows it. */
	text: string;
	/** Cadenza's estimated duration, ms. The player re-anchors it to each clip's real decoded
	 *  duration on `loadedmetadata`, so this is a starting estimate, not a measurement. */
	estimateMs: number;
	/** The BREATH to hold after this sentence, ms — the boundary pause minus the silence the
	 *  clip already carries in its own tail (`interCueGapMs`). The same formula the live
	 *  reader uses, so a baked delivery is spaced like the rehearsed one. */
	gapMs: number;
	/** The word timeline the exported player's caption crawl highlights against. */
	words: { display: string; startMs: number; endMs: number }[];
	/** A complete `data:` URI. Never null on a bake that RESOLVED — an incomplete set throws
	 *  rather than returning one (see `BakeIncompleteError`). Null only when the caller asked
	 *  for captions with no audio. */
	audio: string | null;
};

export type NarrationBake = {
	/** Index-aligned to the deck's slides. A slide with no narration has an empty row. */
	slides: BakedCue[][];
	/** What the deck was narrated with — recorded so the artifact can say so. */
	voice: BakeVoice | null;
	/** Sentences shipped, and sentences in total. Equal on any bake that returns with audio. */
	covered: number;
	total: number;
	/** The bytes the file grows by — data-URI length, i.e. what actually ships. */
	bytes: number;
	/** How many sentences had to be synthesized (the rest came from the device). */
	synthesized: number;
};

/** The pre-flight: what a bake would cost, with no audio read and nothing synthesized. */
export type NarrationMeasure = {
	/** Sentences the deck speaks in total. */
	total: number;
	/** Already on this device in the chosen voice — free and instant. */
	cached: number;
	/** The bytes those cached clips will contribute to the file. */
	cachedBytes: number;
	/** Sentences that would be SYNTHESIZED, and the characters they bill for. */
	missing: number;
	missingChars: number;
	/** Estimated USD for those characters at the model's published rate, or null when the
	 *  catalog has no price for it. Never a guess — an unpriced model quotes nothing. */
	estCostUsd: number | null;
	/** Rough wall-clock seconds for the synthesis, at the bake's real concurrency. */
	estSeconds: number;
	/** The voice the measurement was taken FOR. */
	voice: BakeVoice;
	/** False when the measurement was taken WITHOUT the DOM speech projection — the counts are
	 *  then a floor rather than a figure, and must not be shown as a size. See `resolveDeck`. */
	complete: boolean;
};

/** The refusal. Carries the sentences that could not be prepared, so the panel can say which
 *  ones rather than "something went wrong". */
export class BakeIncompleteError extends Error {
	readonly failures: { slide: number; text: string; reason: string }[];
	constructor(failures: { slide: number; text: string; reason: string }[]) {
		const n = failures.length;
		super(`${n} sentence${n === 1 ? '' : 's'} could not be prepared, so the deck would go silent partway through. Nothing was exported.`);
		this.name = 'BakeIncompleteError';
		this.failures = failures;
	}
}

/**
 * The exact number of characters a clip of `rawBytes` will occupy in the shipped file, as a
 * `data:` URI: `data:` + the MIME + `;base64,` + base64 (4/3, padded to the next 4-char
 * group). Exported because it is the load-bearing half of a promise — the size the panel
 * names before the write has to be the size the file actually gains, and the only way to
 * keep those two honest is to compute both from one function.
 */
export function shippedBytes(rawBytes: number, mime = 'audio/mpeg'): number {
	return 5 + mime.length + 8 + Math.ceil(Math.max(0, rawBytes) / 3) * 4;
}

/**
 * Constrain a stored clip's MIME type to what a media type can actually contain.
 *
 * The type comes from the `Content-Type` of whatever the voice rung returned, so it is
 * remote input that ends up inside a `<script>` data block in a file other people open.
 * Anything outside this class is dropped for a safe default rather than escaped: no
 * legitimate audio type needs a character this excludes, and the alternative is trusting a
 * response header to be well-behaved in a document we hand to someone else.
 */
export function safeMime(type: string | undefined | null, fallback = 'audio/mpeg'): string {
	const t = String(type ?? '').split(';')[0].trim();
	return /^[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*$/.test(t) ? t : fallback;
}

/** What this module needs from a clip, whichever of `Bytes`' three shapes it arrived as. */
type ClipBytes = { size: number; type?: string; arrayBuffer: () => Promise<ArrayBuffer> };

/**
 * Normalize whatever a rung or the store handed back into `ClipBytes`, or null when there is
 * no audio in it. The union admits a bare `ArrayBuffer` (Suono's decode path takes one), and
 * a bake that assumed a Blob would throw on it inside a worker where the failure reads as
 * "that sentence could not be prepared" — a refusal caused by a type, not by a voice.
 *
 * An ArrayBuffer carries no MIME; `safeMime` supplies the default rather than this inventing
 * one, so there is still exactly one place that decides what an untyped clip ships as.
 */
function asClipBytes(b: unknown): ClipBytes | null {
	if (!b) return null;
	if (b instanceof ArrayBuffer) return b.byteLength ? { size: b.byteLength, arrayBuffer: async () => b.slice(0) } : null;
	const o = b as ClipBytes;
	return typeof o.size === 'number' && o.size > 0 && typeof o.arrayBuffer === 'function' ? o : null;
}

/** Bytes → base64, chunked so a multi-hundred-KB clip can't blow the argument limit on
 *  `String.fromCharCode`. */
function toBase64(bytes: Uint8Array): string {
	let bin = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
	}
	return btoa(bin);
}

/**
 * Resolve the deck's per-slide narration and split it into the spoken sentences the clip
 * store is keyed by — the SAME chain and the SAME split Present used when it synthesized
 * them (`narration-resolve.ts`, and `cue.words[].spoken` rather than a plainer sentence
 * split). Anything else here misses every cache lookup silently, which on this path does not
 * merely under-report: it re-bills a deck that was already prepared.
 *
 * `projected` is the component-aware DOM projection from the caller's render.
 */
function resolveDeck(source: string, projected?: readonly string[]) {
	const slides = splitSlides(stripFrontMatter(source));
	const fmCaptions = frontMatterCaptions(source);
	const acronyms = acronymSpokenMap(source);
	const lexicon = lexiconMap(source);
	const lang = frontMatterLang(source) ?? undefined;
	const aligned = projected && projected.length === slides.length ? applyChartNarration(slides, projected) : null;
	const texts = slides.map((md, i) =>
		resolveNarration({
			caption: getInlineCaption(md),
			fmCaption: fmCaptions.get(i + 1),
			note: getSlideNote(md),
			chart: aligned ? null : narrateChartSafe(md), // already substituted into `aligned`
			projected: aligned ? (aligned[i] ?? '') : null,
			// The SAME last rung Present supplies under the same condition, and it has to be here
			// for the same reason the ladder is shared at all. When the projection does not line
			// up, Present does not go quiet — it narrates the markdown flatten, and every clip on
			// the device is keyed on THAT text. A bake that resolved to '' instead would report a
			// deck with nothing to say while the author could hear it playing.
			fallback: aligned ? null : slideToSpeech(md),
		}),
	);
	// One cue per sentence, and the cue's SPOKEN join is the cache key's text — the identity
	// `warmNarration` and `play()` both use. Acronyms / lexicon / lang must match theirs or
	// the spoken form differs and every key misses.
	const tracks = texts.map((t) => (t ? buildTrack(t, { acronyms, lang, lexicon }) : null));
	const perSlide = tracks.map((track) => (track ? track.cues.map((c) => c.words.map((w) => w.spoken).join(' ')) : []));
	// "A projection was SUPPLIED", not "was used". A misaligned one is stood down, but the
	// fallback rung above then reproduces exactly what Present does with the same input — so
	// the count is honest either way. What is NOT honest is a measurement taken with no
	// projection at all, because then we cannot know which of the two Present resolved through.
	return { slides, tracks, perSlide, projectionUsed: Array.isArray(projected) };
}

// The three per-slide readers Present resolves through, each wrapped so one malformed slide
// can never take the whole bake down.
function getInlineCaption(md: string): string | null {
	try {
		return getCaption(md);
	} catch {
		return null;
	}
}
function getSlideNote(md: string): string | null {
	try {
		return getNote(md);
	} catch {
		return null;
	}
}
function narrateChartSafe(md: string): string | null {
	try {
		return narrateChart(md);
	} catch {
		return null;
	}
}

/**
 * How many slides the RENDER appends that the SOURCE does not contain.
 *
 * `glossary: auto` makes the docs renderer append one slide (`appendAutoGlossary`), so the
 * rendered section list runs one longer than `splitSlides` of the same source. Left
 * unreconciled that one-slide skew stood the whole projection down — which, before the
 * fallback rung existed, locked every `glossary: auto` deck out of narration with a message
 * blaming the deck, and left the chart-parity substitution inert on the same decks.
 *
 * The append is deterministic and TRAILING, which is what makes reconciling it safe: authored
 * slide `i` is still rendered section `i` for every `i` the author wrote, so audio keyed by
 * authored index still binds correctly and the appended slide simply carries none.
 */
export function appendedSlideCount(source: string): number {
	try {
		return resolveGlossaryMode(source) === 'auto' && glossaryEntries(source).length ? 1 : 0;
	} catch {
		return 0;
	}
}

/** Drop the trailing projection entries for render-appended slides, so what is left is
 *  index-aligned to the slides the author actually wrote. */
export function trimAppendedSlides(source: string, projected: readonly string[]): string[] {
	const extra = appendedSlideCount(source);
	return extra && projected.length > extra ? projected.slice(0, projected.length - extra) : [...projected];
}

/** How many synthesis requests are in flight at once. Three, matching the prefetch cap the
 *  live reader already runs OpenRouter at (`WARM_CONCURRENCY`) — a bake is the same traffic
 *  against the same rate limits, and going wider trades a modest wall-clock win for 429s
 *  that then cost a backoff each. */
const BAKE_CONCURRENCY = 3;
/** Attempts per sentence before the export refuses. Three, with exponential backoff — enough
 *  to ride out a rate-limit burst, few enough that a genuinely broken voice fails in seconds
 *  rather than minutes. */
const BAKE_ATTEMPTS = 3;
const BAKE_BACKOFF_MS = [600, 2400];
/** The per-request ceiling. Longer than playback's 20 s: nobody is waiting on this sentence
 *  to be spoken in a room, and a timeout here costs a whole retry. */
const BAKE_TIMEOUT_MS = 45000;
/** Rough seconds per sentence, for the pre-flight's time estimate. Measured against the
 *  default hosted-Kokoro model on a typical sentence; a coarse figure the panel rounds. */
const SECONDS_PER_SENTENCE = 1.6;

/**
 * The pre-flight — what baking this deck in `voice` would cost, without synthesizing
 * anything or reading a single byte of audio.
 *
 * `projected` is REQUIRED for an honest answer, and the parameter is not optional in
 * practice even though the signature allows it. An earlier version deliberately skipped the
 * projection to keep the panel cheap to open, on the reasoning that it would "move a
 * sentence or two either way on a chart-heavy deck." That was wrong by an order of
 * magnitude. The projection is not a chart detail — it is the rung that carries every slide
 * with no inline caption, no front-matter caption, no note and no recognized chart, which is
 * most slides in most decks. Without it those slides contribute ZERO sentences, and the
 * author would be quoted a fraction of the bill they were about to be charged.
 *
 * `complete` is false when the caller could not supply a projection. The counts are then a
 * FLOOR, not a figure, and the caller must not present them as a price.
 */
export async function measureNarration(source: string, projected: readonly string[] | undefined, voice: BakeVoice, priceMPerChar?: number | null): Promise<NarrationMeasure> {
	const { perSlide, projectionUsed: complete } = resolveDeck(source, projected);
	const total = perSlide.reduce((n, s) => n + s.length, 0);
	const base: NarrationMeasure = { total, cached: 0, cachedBytes: 0, missing: 0, missingChars: 0, estCostUsd: null, estSeconds: 0, voice, complete };
	if (!total) return base;

	const keys = await bakeClipKeys(perSlide, voice);
	const sizes = await clipSizes(keys.flat());

	let cached = 0;
	let cachedBytes = 0;
	let missing = 0;
	let missingChars = 0;
	for (let i = 0; i < perSlide.length; i++) {
		for (let j = 0; j < perSlide[i].length; j++) {
			// A ZERO-size row is a clip that exists in the index and has no audio. The bake gates
			// on `blob?.size` and would re-synthesize it, so counting it as cached here would
			// quote a bill the bake then exceeds.
			const size = keys[i]?.[j] ? sizes.get(keys[i][j]) : 0;
			if (size) {
				cached++;
				// Assumes `audio/mpeg`, the type every OpenRouter speech model but one returns. A
				// different type moves the total by a handful of characters against megabytes.
				cachedBytes += shippedBytes(size);
			} else {
				missing++;
				missingChars += perSlide[i][j].length;
			}
		}
	}
	// TTS models are billed per input CHARACTER, published per-million (voice-model.js's
	// orPricePerM). An unpriced model quotes nothing rather than zero — "free" and "we don't
	// know" are different answers and only one of them is safe to show next to a Bake button.
	const estCostUsd = typeof priceMPerChar === 'number' && Number.isFinite(priceMPerChar) ? (missingChars / 1e6) * priceMPerChar : null;
	const estSeconds = Math.ceil((missing * SECONDS_PER_SENTENCE) / BAKE_CONCURRENCY);
	return { ...base, cached, cachedBytes, missing, missingChars, estCostUsd, estSeconds };
}

/** Progress, as the panel shows it: cached hits are instant, synthesis is what takes time. */
export type BakeProgress = { done: number; total: number; synthesized: number; phase: 'reading' | 'synthesizing' | 'assembling' };

/**
 * Bake the deck's narration: read what the device has, synthesize what it doesn't, and
 * return a COMPLETE set — or throw `BakeIncompleteError` and ship nothing.
 *
 * `audio: false` bakes the caption track alone: the same cues, the same word timings, the
 * same beats, with no clips and no synthesis. The exported player crawls those on its own
 * wall clock, so a captions-only deck is a working read-along rather than a degraded
 * narration — and it costs nothing and adds kilobytes instead of megabytes.
 */
export async function bakeNarration(
	source: string,
	projected: readonly string[] | undefined,
	opts: { voice: BakeVoice; audio: boolean; signal?: AbortSignal; onProgress?: (p: BakeProgress) => void },
): Promise<NarrationBake> {
	const { voice, audio, signal, onProgress } = opts;
	const { tracks, perSlide } = resolveDeck(source, projected);
	const total = perSlide.reduce((n, s) => n + s.length, 0);

	// The cue skeleton — text, estimate, breath, word timings. Identical whether or not audio
	// ships, because it is the same delivery either way; only the clips differ.
	const slides: BakedCue[][] = perSlide.map((sentences, i) => {
		const track = tracks[i];
		return sentences.map((_s, j) => {
			const cue = track?.cues[j];
			const words = (cue?.words ?? []).map((w) => ({ display: w.display, startMs: Math.round(w.startMs), endMs: Math.round(w.endMs) }));
			// The breath after this sentence. Keyed off the cue's last DISPLAY word, not the
			// spoken join: `toSpoken` softens a trailing `:`/`;` to `,`, so the two terminators
			// disagree by 40–105 ms, and the live reader keys off the display word.
			const lastDisplay = words[words.length - 1]?.display ?? '';
			return {
				text: cue?.display ?? '',
				estimateMs: cue ? Math.max(0, Math.round(cue.endMs - cue.startMs)) : 0,
				gapMs: cue ? Math.max(0, Math.round(interCueGapMs(lastDisplay, !!cue.endsParagraph))) : 0,
				words,
				audio: null as string | null,
			};
		});
	});

	if (!audio || !total) {
		onProgress?.({ done: total, total, synthesized: 0, phase: 'assembling' });
		return { slides, voice: audio ? voice : null, covered: 0, total, bytes: 0, synthesized: 0 };
	}

	const keys = await bakeClipKeys(perSlide, voice);
	// Flatten to one work list. A deck's sentences are wildly uneven per slide, so scheduling
	// per slide would leave workers idle behind a one-sentence title while a ten-sentence
	// argument waits its turn.
	const jobs: { i: number; j: number; text: string; key: string }[] = [];
	for (let i = 0; i < perSlide.length; i++) {
		for (let j = 0; j < perSlide[i].length; j++) jobs.push({ i, j, text: perSlide[i][j], key: keys[i]?.[j] ?? '' });
	}

	const failures: { slide: number; text: string; reason: string }[] = [];
	let done = 0;
	let synthesized = 0;
	let bytes = 0;
	const report = (phase: BakeProgress['phase']) => onProgress?.({ done, total, synthesized, phase });
	report('reading');

	/** Attach a clip's bytes to its cue as a `data:` URI, and count what it costs. */
	const attach = async (job: { i: number; j: number }, blob: ClipBytes) => {
		const uri = `data:${safeMime(blob.type)};base64,${toBase64(new Uint8Array(await blob.arrayBuffer()))}`;
		slides[job.i][job.j].audio = uri;
		bytes += uri.length;
	};

	const aborted = () => !!signal?.aborted;
	let cursor = 0;
	const worker = async () => {
		for (;;) {
			if (aborted()) return;
			const idx = cursor++;
			if (idx >= jobs.length) return;
			const job = jobs[idx];
			// 1. The device first. A hit is free, instant, and the common case for a rehearsed deck.
			try {
				const hit = job.key ? asClipBytes(await getClip(job.key)) : null;
				if (hit) {
					await attach(job, hit);
					done++;
					report('reading');
					continue;
				}
			} catch {
				// An unreadable store is a cache miss, not a failure — synthesis below covers it.
			}
			// 2. Synthesize, with backoff. The clip is BANKED on success before anything else, so
			//    a later cancellation or failure never throws away audio that was already paid for.
			let reason = 'no audio returned';
			for (let attempt = 0; attempt < BAKE_ATTEMPTS && !aborted(); attempt++) {
				if (attempt) await sleep(BAKE_BACKOFF_MS[Math.min(attempt - 1, BAKE_BACKOFF_MS.length - 1)], signal);
				if (aborted()) return;
				const res = await synthBakeClip(job.text, voice, signal, BAKE_TIMEOUT_MS);
				const got = res.ok ? asClipBytes(res.bytes) : null;
				if (got) {
					try {
						await putClip(res.key || job.key, got as unknown as Blob);
					} catch {
						// A full or unavailable store costs the NEXT export a re-synth; it must not
						// cost THIS one the clip we are holding.
					}
					await attach(job, got);
					synthesized++;
					done++;
					report('synthesizing');
					reason = '';
					break;
				}
				reason = res.error || 'no audio returned';
			}
			if (reason) failures.push({ slide: job.i + 1, text: job.text, reason });
		}
	};

	await Promise.all(Array.from({ length: Math.min(BAKE_CONCURRENCY, jobs.length) }, worker));

	if (aborted()) throw new DOMException('Bake cancelled', 'AbortError');
	// The refusal. Everything synthesized above is already banked, so a second attempt after
	// fixing the cause (reconnect, top up credit) pays only for what is still missing.
	if (failures.length) throw new BakeIncompleteError(failures);

	report('assembling');
	return { slides, voice, covered: total, total, bytes, synthesized };
}

/** An abortable pause. Resolves early on abort so the worker's own guard decides what to do,
 *  rather than leaving a rejected promise nobody is waiting on. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((res) => {
		if (signal?.aborted) return res();
		const t = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort);
			res();
		}, ms);
		function onAbort() {
			clearTimeout(t);
			res();
		}
		signal?.addEventListener('abort', onAbort, { once: true });
	});
}

/** A size for a human, matching the units the rest of the Studio's data surfaces use. */
export function formatBytes(n: number): string {
	if (n <= 0) return '0 MB';
	const mb = n / (1024 * 1024);
	if (mb < 0.1) return `${Math.max(1, Math.round(n / 1024))} KB`;
	return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** A price for a human. Sub-cent bills are the common case on the default model, and
 *  rounding them to "$0.00" reads as free — which is the one thing a cost line must not say
 *  when it isn't. */
export function formatUsd(n: number): string {
	if (!(n > 0)) return '$0.00';
	if (n < 0.01) return '<$0.01';
	return `$${n.toFixed(2)}`;
}

/** A duration for a human, for the pre-flight's "about how long" line. */
export function formatDuration(seconds: number): string {
	const s = Math.max(0, Math.round(seconds));
	if (s < 60) return `${Math.max(1, s)}s`;
	const m = Math.round(s / 60);
	return m < 60 ? `${m} min` : `${Math.round(m / 6) / 10} h`;
}
