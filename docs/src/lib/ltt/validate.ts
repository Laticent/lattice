// validateLtt — every rule of the LTT spec a machine can check, reported as plain sentences.
//
// Same contract as `validateTrack`: returns [] for a valid file, never throws, never mutates.
// It checks more than the JSON Schema can say (the schema has no way to express "cue starts
// are monotonic" or "the word at {cue, word} still reads as the action's `match`"), and less
// than it in one place on purpose: it ignores keys it does not know, because a reader must
// skip a layer it has not heard of (engineering/ltt.md §Layers).

import { validateTrack } from './track.js';
import type { CaptionTrack } from './types.js';

const HASH = /^sha256:[0-9a-f]{64}$/;
const PACES = ['slow', 'moderate', 'fast'];
const DECK_PACES = ['brisk', 'natural', 'deliberate'];
const MOTIONS = ['full', 'legible', 'still'];
const BASES = ['estimate', 'measured'];
const AFTERS = ['awaitUser', 'until', 'act'];
// The core is CLOSED (`@closed` in types.ts): the packed encoding carries these fields by name, so
// any other key would be dropped by a round trip. Every other object stays open for later layers.
const TRACK_KEYS = new Set(['cues', 'durationMs']);
const CUE_KEYS = new Set(['display', 'words', 'startMs', 'endMs', 'charOffset', 'endsParagraph', 'weight']);
const WORD_KEYS = new Set(['display', 'spoken', 'startMs', 'endMs', 'charOffset', 'weight']);

function checkClosed(obj: Rec, allowed: Set<string>, where: string, out: string[]): void {
	for (const k of Object.keys(obj)) {
		if (!allowed.has(k)) out.push(`${where} has "${k}", which the core does not define — the core is closed; a new field is a new version of the spec`);
	}
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
// SAFE integers: past 2^53 the packed encoding's relative times stop adding back exactly.
const isMs = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
/** A deck-authored string quoted in a report, cut short so one hostile 40k-character word cannot
 *  turn a list of problems into megabytes. */
const q = (v: unknown): string => {
	if (typeof v === 'string') return JSON.stringify(v.length > 40 ? `${v.slice(0, 40)}…` : v);
	// Never throw while describing a value: a BigInt will not stringify, and a null-prototype
	// object will not convert to a string. Neither comes out of JSON.parse, but the contract is
	// "never throws" for any input.
	try {
		return String(JSON.stringify(v) ?? v).slice(0, 60);
	} catch {
		return `a ${typeof v}`;
	}
};
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/** The word an action names, as Vetrina compares it: case-folded, with the punctuation a
 *  segmenter leaves attached stripped from both ends. The same rule as Vetrina's
 *  `normalizeCueWord` (vetrina/narrate.ts), which cannot import this until step 4 opens its gate. */
export function normalizeMatch(s: string): string {
	// A linear scan from each end, not `/[^\p{L}\p{N}]+$/u`: that regex restarts at every position of
	// a long punctuation run, which made a 121 KB file block `validateLtt` for 20 seconds.
	const chars = Array.from(String(s).toLowerCase());
	let a = 0;
	let b = chars.length;
	while (a < b && !LETTER_OR_DIGIT.test(chars[a])) a++;
	while (b > a && !LETTER_OR_DIGIT.test(chars[b - 1])) b--;
	return chars.slice(a, b).join('');
}

function checkHash(v: unknown, where: string, out: string[]): void {
	if (!isStr(v) || !HASH.test(v)) out.push(`${where} is not a content hash (want "sha256:" and 64 lowercase hex digits)`);
}

function checkEnum(v: unknown, allowed: readonly string[], where: string, out: string[]): void {
	if (!isStr(v) || !allowed.includes(v)) out.push(`${where} is ${q(v)}; want one of ${allowed.join(', ')}`);
}

/** The core, beyond `validateTrack`'s timeline invariants: the fields every reader relies on, all
 *  present and typed, every time an integer, and `durationMs` where the spec says it is.
 *
 *  Then the TIMELINE, but only once the structure is sound: comparing times on a cue that is null
 *  or has no word list is how this used to throw. The timeline rules are what make a slide's
 *  length formula (`holdMs + durationMs + tailMs`) true of every file that validates: each word
 *  sits inside its cue, words run forward, and a cue ends before the next one starts. */
function checkCore(track: unknown, where: string, out: string[]): void {
	const before = out.length;
	if (!isRec(track) || !Array.isArray(track.cues)) {
		out.push(`${where}.track has no cues array`);
		return;
	}
	checkClosed(track, TRACK_KEYS, `${where}.track`, out);
	if (!track.cues.length) out.push(`${where}.track has no cues — a narrated segment says something`);
	if (!isMs(track.durationMs)) out.push(`${where}.track.durationMs is not a whole, non-negative number of ms`);
	Array.from(track.cues as unknown[]).forEach((cue: unknown, i: number) => {
		const at = `${where}.track.cues[${i}]`;
		if (!isRec(cue)) {
			out.push(`${at} is not an object`);
			return;
		}
		checkClosed(cue, CUE_KEYS, at, out);
		if (!isStr(cue.display)) out.push(`${at}.display is not a string`);
		for (const k of ['startMs', 'endMs', 'charOffset']) if (!isMs(cue[k])) out.push(`${at}.${k} is not a whole, non-negative number`);
		if ('endsParagraph' in cue && typeof cue.endsParagraph !== 'boolean') out.push(`${at}.endsParagraph is not a boolean`);
		if ('weight' in cue && !Number.isFinite(cue.weight)) out.push(`${at}.weight is not a finite number`);
		if (!Array.isArray(cue.words) || !cue.words.length) {
			out.push(`${at} has no words`);
			return;
		}
		Array.from(cue.words as unknown[]).forEach((w: unknown, j: number) => {
			const wat = `${at}.words[${j}]`;
			if (!isRec(w)) {
				out.push(`${wat} is not an object`);
				return;
			}
			checkClosed(w, WORD_KEYS, wat, out);
			if (!isStr(w.display)) out.push(`${wat}.display is not a string`);
			if (!isStr(w.spoken)) out.push(`${wat}.spoken is not a string — the core requires the spoken form`);
			for (const k of ['startMs', 'endMs', 'charOffset']) if (!isMs(w[k])) out.push(`${wat}.${k} is not a whole, non-negative number`);
			if ('weight' in w && !Number.isFinite(w.weight)) out.push(`${wat}.weight is not a finite number`);
		});
	});
	if (out.length > before) return; // structure is broken — the timeline below would read garbage
	const cues = track.cues as Array<{ startMs: number; endMs: number; words: Array<{ display: string; startMs: number; endMs: number }> }>;
	cues.forEach((cue, i) => {
		const at = `${where}.track.cues[${i}]`;
		let prev = cue.startMs;
		cue.words.forEach((w, j) => {
			if (w.startMs < cue.startMs || w.endMs > cue.endMs) {
				out.push(`${at}.words[${j}] (${q(w.display)}) runs ${w.startMs}–${w.endMs}, outside its cue's ${cue.startMs}–${cue.endMs}`);
			}
			if (w.startMs < prev) out.push(`${at}.words[${j}] (${q(w.display)}) starts at ${w.startMs}, before the word ahead of it at ${prev}`);
			prev = w.startMs;
		});
		const next = cues[i + 1];
		if (next && cue.endMs > next.startMs) out.push(`${at} ends at ${cue.endMs}, after cue ${i + 1} starts at ${next.startMs} — cues do not overlap`);
	});
	const end = cues[cues.length - 1].endMs;
	if (track.durationMs !== end) {
		out.push(`${where}.track.durationMs is ${track.durationMs}, but the last cue ends at ${end} — durationMs is the end of the last cue`);
	}
	for (const p of validateTrack(track as unknown as CaptionTrack)) out.push(`${where}.track: ${p}`);
}

function checkAudio(audio: unknown, track: unknown, where: string, out: string[]): void {
	if (!isRec(audio)) {
		out.push(`${where}.audio is not an object`);
		return;
	}
	if (!isRec(audio.voice) || !isStr(audio.voice.model) || !isStr(audio.voice.voice) || !Number.isFinite(audio.voice.speed) || (audio.voice.speed as number) < 0) {
		out.push(`${where}.audio.voice needs model, voice and a non-negative speed`);
	}
	if (!Array.isArray(audio.clips)) {
		out.push(`${where}.audio.clips is not an array`);
		return;
	}
	// One clip per CUE, in cue order, at most one each (engineering/ltt.md §Layers). A player
	// advances on each clip's end, so a clip naming a cue the track does not have would speak a
	// sentence no caption shows.
	const cueCount = isRec(track) && Array.isArray(track.cues) ? track.cues.length : 0;
	let last = -1;
	Array.from(audio.clips as unknown[]).forEach((c: unknown, i: number) => {
		const at = `${where}.audio.clips[${i}]`;
		if (!isRec(c)) {
			out.push(`${at} is not an object`);
			return;
		}
		if (!isMs(c.cue) || c.cue >= cueCount) out.push(`${at}.cue is ${q(c.cue)}, which this track does not have (${cueCount} cues)`);
		else if (c.cue <= last) out.push(`${at}.cue is ${c.cue}, not after the clip ahead of it at cue ${last} — clips run in cue order, one per cue at most`);
		else last = c.cue;
		if (!isStr(c.src) || !c.src) out.push(`${at}.src is empty`);
		checkHash(c.clip, `${at}.clip`, out);
		if ('measuredMs' in c && !isMs(c.measuredMs)) out.push(`${at}.measuredMs is not a whole, non-negative number`);
		if ('leadMs' in c && !(Number.isFinite(c.leadMs) && (c.leadMs as number) >= 0)) out.push(`${at}.leadMs is not a non-negative number`);
	});
}

function checkActions(actions: unknown, track: unknown, where: string, out: string[]): void {
	if (!Array.isArray(actions)) {
		out.push(`${where}.actions is not an array`);
		return;
	}
	const cues = isRec(track) && Array.isArray(track.cues) ? track.cues : [];
	Array.from(actions).forEach((a: unknown, i: number) => {
		const at = `${where}.actions[${i}]`;
		if (!isRec(a)) {
			out.push(`${at} is not an object`);
			return;
		}
		if (!isStr(a.verb) || !a.verb) out.push(`${at}.verb is empty`);
		if ('target' in a && !isStr(a.target)) out.push(`${at}.target is not a string`);
		if ('arrive' in a && a.arrive !== 'on-word') out.push(`${at}.arrive is ${q(a.arrive)}; want "on-word"`);
		if (!isStr(a.match)) {
			out.push(`${at}.match is not a string`);
			return;
		}
		const cue = isMs(a.cue) ? cues[a.cue] : undefined;
		const word = isRec(cue) && Array.isArray(cue.words) && isMs(a.word) ? cue.words[a.word] : undefined;
		if (!isRec(word) || !isStr(word.display)) {
			out.push(`${at} points at cue ${q(a.cue)} word ${q(a.word)}, which this track does not have`);
		} else if (normalizeMatch(word.display) !== a.match) {
			out.push(
				`${at} names ${q(a.match)}, but cue ${a.cue} word ${a.word} is now ${q(word.display)} — the narration moved under the action. Re-anchor it to the word the author named.`,
			);
		}
	});
}

/**
 * Check an LTT in its canonical encoding against every rule of the spec a machine can check.
 * Returns [] when the file is valid.
 */
export function validateLtt(ltt: unknown): string[] {
	// The contract is "never throws", and the checks below read whatever they are handed. A value no
	// JSON parser produces — a getter that throws, a revoked Proxy — can still reach them from a
	// caller holding a live object, so the last line of defense turns a throw into a report.
	try {
		return check(ltt);
	} catch (e) {
		return [`the validator could not read this file: ${e instanceof Error ? e.message : q(e)}`];
	}
}

function check(ltt: unknown): string[] {
	const out: string[] = [];
	if (!isRec(ltt)) return ['an LTT is a JSON object'];
	if (ltt.format !== 'ltt') out.push(`format is ${q(ltt.format)}; want "ltt"`);
	if ('encoding' in ltt) out.push(`this file is in the ${q(ltt.encoding)} encoding — unpack it before validating`);
	if (ltt.version !== '1.0') out.push(`version is ${q(ltt.version)}; this reader knows "1.0"`);

	const source = ltt.source;
	const kind = isRec(source) ? source.kind : undefined;
	if (!isRec(source)) out.push('source is missing');
	else {
		checkEnum(source.kind, ['deck', 'tour'], 'source.kind', out);
		if (!isStr(source.id) || !source.id) out.push('source.id is empty');
	}

	const inputs = ltt.inputs;
	if (!isRec(inputs)) out.push('inputs is missing');
	else {
		checkHash(inputs.engine, 'inputs.engine', out);
		checkEnum(inputs.pace, PACES, 'inputs.pace', out);
		if ('deckPace' in inputs) checkEnum(inputs.deckPace, DECK_PACES, 'inputs.deckPace', out);
		if ('lang' in inputs && !isStr(inputs.lang)) out.push('inputs.lang is not a string');
		if ('lexicon' in inputs) checkHash(inputs.lexicon, 'inputs.lexicon', out);
		if ('acronyms' in inputs) checkHash(inputs.acronyms, 'inputs.acronyms', out);
		if ('motion' in inputs) checkEnum(inputs.motion, MOTIONS, 'inputs.motion', out);
		if ('stagePace' in inputs && !(Number.isFinite(inputs.stagePace) && (inputs.stagePace as number) >= 0)) out.push('inputs.stagePace is not a non-negative number');
		if ('viewport' in inputs) {
			const v = inputs.viewport;
			if (!isRec(v) || !Number.isSafeInteger(v.w) || !Number.isSafeInteger(v.h) || (v.w as number) < 1 || (v.h as number) < 1) out.push('inputs.viewport needs whole-pixel w and h');
		}
		if (kind === 'deck') {
			for (const k of ['viewport', 'motion', 'stagePace']) if (k in inputs) out.push(`inputs.${k} is a tour input; a deck does not carry it`);
		}
		if (kind === 'tour' && 'deckPace' in inputs) out.push('inputs.deckPace is a deck input; a tour does not carry it');
	}

	if (typeof ltt.seekable !== 'boolean') out.push('seekable is not a boolean');
	if (!Array.isArray(ltt.segments)) {
		out.push('segments is not an array');
		return out;
	}

	const ids = new Set<string>();
	let lastSlide = 0;
	let lastBeat = Number.NEGATIVE_INFINITY;
	Array.from(ltt.segments as unknown[]).forEach((seg: unknown, i: number) => {
		const where = `segments[${i}]`;
		if (!isRec(seg)) {
			out.push(`${where} is not an object`);
			return;
		}
		if (!isStr(seg.id) || !seg.id) out.push(`${where}.id is empty`);
		else if (ids.has(seg.id)) out.push(`${where}.id "${seg.id}" repeats — segment ids are unique in a file`);
		else ids.add(seg.id);

		const k = seg.kind;
		if (k !== 'slide' && k !== 'hold' && k !== 'stretch') {
			out.push(`${where}.kind is ${q(k)}; want slide, hold or stretch`);
			return;
		}
		if (kind === 'deck' && k === 'stretch') out.push(`${where} is a stretch, which only a tour has`);
		if (kind === 'tour' && k !== 'stretch') out.push(`${where} is a ${k}, which only a deck has`);

		if (k === 'stretch') {
			const beats = isRec(seg.at) ? seg.at.beats : undefined;
			if (!Array.isArray(beats) || beats.length !== 2 || !beats.every((b) => Number.isSafeInteger(b) && b >= 0) || beats[0] > beats[1]) {
				out.push(`${where}.at.beats is not a [first, last] pair of beat indices`);
			} else {
				if (beats[0] < lastBeat) out.push(`${where} starts at beat ${beats[0]}, before the previous stretch ended at beat ${lastBeat}`);
				lastBeat = beats[1];
			}
			if ('holdMs' in seg) out.push(`${where}.holdMs is a deck field; a stretch waits on \`after\``);
			if ('after' in seg) checkEnum(seg.after, AFTERS, `${where}.after`, out);
			if ('waitedMs' in seg) {
				if (!isMs(seg.waitedMs)) out.push(`${where}.waitedMs is not a whole, non-negative number`);
				if (!('after' in seg)) out.push(`${where}.waitedMs records a wait, but the stretch names none in \`after\``);
			} else if ('after' in seg && ltt.seekable === true) {
				out.push(`${where} waits on "${String(seg.after)}" with no recorded waitedMs, so the file cannot be seekable`);
			}
		} else {
			const slide = isRec(seg.at) ? seg.at.slide : undefined;
			// Every slide gets a segment, narrated or not, because every slide after the first waits
			// one hold on arrival: a missing slide would be a missing hold in the deck's timeline.
			if (!Number.isSafeInteger(slide) || (slide as number) < 1) out.push(`${where}.at.slide is not a 1-based slide number`);
			else {
				if (slide !== lastSlide + 1) out.push(`${where} is slide ${slide}, but slide ${lastSlide + 1} comes next — deck segments run in slide order, one per slide, with no gaps`);
				lastSlide = slide as number;
			}
			if (!isMs(seg.holdMs)) out.push(`${where}.holdMs is not a whole, non-negative number of ms`);
			else if (i === 0 && seg.holdMs !== 0) out.push(`${where} is the first segment, whose hold is 0 — Play speaks the first slide at once`);
			for (const f of ['after', 'waitedMs']) if (f in seg) out.push(`${where}.${f} is a tour field`);
		}

		if (k === 'hold') {
			for (const f of ['hash', 'basis', 'track', 'tailMs', 'audio', 'actions']) {
				if (f in seg) out.push(`${where}.${f} does not belong on a hold, which has no narration`);
			}
			return;
		}
		if (k === 'slide' && !isMs(seg.tailMs)) out.push(`${where}.tailMs is not a whole, non-negative number of ms — the breath after the slide's last cue`);
		if (k === 'stretch' && 'tailMs' in seg) out.push(`${where}.tailMs is a deck field`);
		checkHash(seg.hash, `${where}.hash`, out);
		checkEnum(seg.basis, BASES, `${where}.basis`, out);
		checkCore(seg.track, where, out);
		if ('audio' in seg) checkAudio(seg.audio, seg.track, where, out);
		if ('actions' in seg) checkActions(seg.actions, seg.track, where, out);
	});

	if (kind === 'deck' && ltt.seekable !== true) out.push('a deck is always seekable — every segment is a hold plus a track of known length');
	return out;
}
