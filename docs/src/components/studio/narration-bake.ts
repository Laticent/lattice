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
// EVERY SYNTHESIZED CLIP IS BANKED as it lands, in the persistent store, under the key THAT
// IDENTITY plays under — which is the workspace's own voice on the common path, and a
// different key when the author picked a different narrator for this one export. A bake that
// is canceled or that fails on sentence 280 is not wasted work either way: the next attempt
// in the same voice starts from what the first one paid for.

import { buildTrack, interCueGapMs } from '@/lib/cadenza';
import { acronymSpokenMap, frontMatterCaptions, frontMatterLang, lexiconMap } from '@/lib/resolve-captions';
import { compressClip } from '@/playground/narration-encode.js';
import { narrationBitrate, narrationCacheEnabled } from '@/playground/narration-prefs.js';
import { clipSizes, getClip, putClip } from '@/playground/narration-store.js';
import { narrateChart } from '@/playground/read-along-core.generated.js';
import { stripFrontMatter } from './front-matter';
import { splitSlides } from './lint';
import { applyChartNarration, resolveNarration } from './narration-resolve';
import { type BakeVoice, bakeClipKeys, slideToSpeech, synthBakeClip } from './read-aloud';
import { getCaption } from './slide-caption';
import { getNote } from './slide-notes';
import { engineForModel } from './tts-voice-catalog';

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
	/** Empty on a complete bake. Non-empty ONLY when the author explicitly overrode the
	 *  refusal — those sentences ship as captions with no sound. */
	failures: { slide: number; text: string; reason: string }[];
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
	/** Every spoken character in the deck — what the CAPTION track costs, since a caption-only
	 *  export ships the text and the word timings and no audio at all. */
	totalChars: number;
	/** What those sentences will ADD to the file, at the chosen engine's measured rate. The
	 *  one figure here that is an estimate rather than a reading — see `estimateSynthBytes`. */
	missingBytes: number;
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
	/** The voice/rung/model/speed this refusal was produced UNDER. The panel offers its
	 *  override only while the current pick still matches: a refusal earned by one moderation
	 *  block in one voice must not authorize an unbounded partial set in another. */
	readonly voice?: BakeVoice;
	/** Set when the run stopped for a systemic reason — a revoked key, no credit, a dead host.
	 *  NOT overridable: the author cannot consent to "everything after sentence N" from a list
	 *  that names one failure and a summary row. Fix the account and re-run. */
	readonly terminal?: string;
	constructor(failures: { slide: number; text: string; reason: string }[], terminal?: string, voice?: BakeVoice) {
		const n = failures.length;
		super(
			terminal
				? `Narration stopped: ${terminal}. Nothing was exported — fix that and re-run; everything already recorded is kept.`
				: `${n} sentence${n === 1 ? '' : 's'} could not be prepared, so the deck would go silent partway through. Nothing was exported.`,
		);
		this.name = 'BakeIncompleteError';
		this.failures = failures;
		this.terminal = terminal;
		this.voice = voice;
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
 * Bytes of audio per CHARACTER of input, per speech engine — measured from this repository's
 * own committed voice samples, which were generated against the live API by
 * `tools/generate-voice-samples.mjs` from one fixed 35-character sentence.
 *
 * WHY THIS IS A TABLE AND NOT A CONSTANT. The rate is a property of the ENGINE, and the
 * engines this catalog lists span 279 B/char (Orpheus) to 1246 B/char (MAI) — a 4.5× spread.
 * Any single number is wrong for most of the roster, and wrong in the direction that matters:
 * the pre-flight's size line is the one figure an author is asked to consent to before a file
 * they will email to a board.
 *
 * The first version of this quote used a flat 16 B/char, which is not the rate of any codec
 * that exists — it implies 1.6 kbps audio. It understated a real deck by roughly thirty times
 * and was labeled "measured" without anything having been measured. The numbers below are
 * regenerated from the sample files by `narration-bake.test.ts`, which fails if the table
 * drifts from what is on disk, so this cannot silently rot again.
 *
 * DELIBERATELY SLIGHTLY HIGH. The samples are 35 characters, so each carries the container's
 * fixed overhead across a short clip; a 100-character deck sentence amortizes that and comes
 * in a little under this rate. Over-quoting means the file arrives smaller than promised,
 * which is the safe direction for a number someone is consenting to.
 *
 * THE ROSTER IS NOW ONE CODEC CLASS, and that is a recent and load-bearing change. Two engines
 * used to return uncompressed audio — Gemini (PCM over the wire) and on-device Kokoro (Float32
 * off the worker) — and both shipped as WAV, at roughly 7.7x the rest of this table. They are
 * compressed at the rung now (docs/src/playground/narration-encode.js), so the spread below is
 * 279–1246 B/char rather than 279–3799, and every number in it is the same kind of number.
 */
export const ENGINE_BYTES_PER_CHAR: Record<string, number> = {
	kokoro: 477,
	grok: 878,
	orpheus: 279,
	'mai-voice-2': 1246,
	voxtral: 496,
	csm: 422,
	'zonos-hybrid': 656,
	'zonos-transformer': 674,
	// Gemini is the one engine whose SPEECH ENDPOINT returns raw PCM rather than mp3 — it 400s
	// on response_format:"mp3". It was 3799 B/char here, an uncompressed outlier 7.7x the rest
	// of the roster, and before that it was missing from this table entirely: `estimateSynthBytes`
	// fell through to DEFAULT_BYTES_PER_CHAR and quoted ~19 MB for a 300-sentence deck that
	// landed at ~145 MB.
	//
	// Both problems are now upstream of this number. The rung encodes that PCM to mp3 before it
	// is cached or baked, and the committed samples this row is measured from are encoded the
	// same way at the same bitrate — so 645 is a reading of the same codec the deck ships, not
	// a second guess about it.
	gemini: 645,
};

/**
 * The rate for a model this catalog has no samples for.
 *
 * The MEDIAN of the measured engines, not the mean — one 1246 B/char outlier should not move
 * the answer for an unknown model. Gemini is now IN that median rather than excluded from it:
 * the exclusion existed because an uncompressed engine at 3799 B/char was a different codec
 * class that would have dragged the default several times too high, and it no longer is one.
 *
 * THE UNCOMPRESSED GAP IS CLOSED, which is worth stating precisely because the previous version
 * of this comment said it could not be. It used to read: "a NEW uncompressed engine that
 * OpenRouter adds and this repo has no samples for will be under-quoted by roughly 7x… there is
 * no way to close it from a table — it needs the response's real byte count, which the
 * pre-flight by definition does not have." That was true of a table and false of the pipeline.
 * The fix was not a better estimate but a bound: `bakeNarration` runs every clip through
 * `compressClip` on its way into the file, so audio that arrives uncompressed cannot ship
 * uncompressed no matter which engine produced it or whether this table has heard of it.
 *
 * The residual risk that remains is smaller and different: an unknown engine returning mp3 at
 * an unusually HIGH bitrate is still quoted at the median and passes through untouched (we do
 * not transcode already-compressed audio — that is generation loss for nothing). The worst case
 * there is roughly 2x, bounded by the roster's own spread, not 7x.
 */
export const DEFAULT_BYTES_PER_CHAR = 645;

/**
 * What `chars` of not-yet-synthesized text will add to the shipped file, in `modelId`'s voice
 * — audio bytes at that engine's measured rate, then base64's 4/3 inflation, since a data URI
 * is what actually ships.
 *
 * This is the ONE figure in the pre-flight that cannot be exact, because nothing has been
 * synthesized yet. It lives here, beside `shippedBytes`, rather than in the panel that
 * displays it: the promise is that the size named before the write is the size the file
 * gains, and the only way to keep those honest is to compute both from one module.
 */
export function estimateSynthBytes(chars: number, modelId?: string | null): number {
	if (!(chars > 0)) return 0;
	const engine = engineForModel(modelId || '');
	const rate = (engine && ENGINE_BYTES_PER_CHAR[engine]) || DEFAULT_BYTES_PER_CHAR;
	// Through `shippedBytes`, not a second copy of its 4/3 arithmetic: the size named before
	// the write and the size the file gains must come from ONE function, or they drift.
	return shippedBytes(chars * rate);
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
	// STRICT LENGTH EQUALITY, and it is deliberately NOT reconciled — because Present isn't.
	//
	// `glossary: auto` makes the renderer append a slide the SOURCE does not contain, so a
	// projection taken from the render runs one entry long, and this guard stands the whole
	// projection down. It is tempting to trim that trailing entry and keep the richer
	// component-aware text. Doing it here would be actively harmful: Present applies the SAME
	// equality guard (`PresentOverlay.tsx`, `texts.length === target.length`) and therefore
	// narrates such a deck through the markdown flatten — which means every clip on the
	// author's device is keyed on the FLATTEN. A bake that resolved the projection instead
	// would match none of them, re-synthesize a fully rehearsed deck end to end, and ship
	// narration the author never heard.
	//
	// So the rule is: the bake resolves narration EXACTLY as Present does, including where
	// Present gives something up. Teaching both to trim is a coherent improvement and a
	// separate change — it moves Present, and it invalidates every clip already stored.
	//
	// This cost a real defect. An earlier build had the panel trim and the exporter not, so the
	// two halves of the same export resolved different sentences: the quote read "fully
	// prepared, nothing is billed" and the bake then billed the whole deck.
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
/**
 * Failures that will not get better by asking again — a revoked key, an exhausted balance, a
 * model that rejects this text. Retrying one of these costs 3 s of backoff and two more
 * billed attempts to arrive at the same answer, and on a 300-sentence deck that is five
 * minutes of spinning before a refusal the first sentence already knew about.
 *
 * Matched on the message because that is what the rung returns (`OpenRouter TTS error 401:
 * …`), and matched loosely on purpose: a false positive costs one retry, a false negative
 * costs the whole deck's worth of them.
 */
const TERMINAL_SYNTH_ERROR = /\b(401|402|403|404)\b|unauthor|invalid api key|insufficient|quota|credit|not connected|billing/i;
/** The per-request ceiling. Longer than playback's 20 s: nobody is waiting on this sentence
 *  to be spoken in a room, and a timeout here costs a whole retry. */
const BAKE_TIMEOUT_MS = 45000;
/**
 * Rough seconds per sentence for the pre-flight's time line — an ESTIMATE, not a measurement,
 * and the word matters here.
 *
 * The byte table eight lines up exists because a single constant labeled "measured" was wrong
 * across a roster that spans 4.5x. This number is one constant across the same roster, and it
 * is NOT measured: it is a round figure from watching the default hosted-Kokoro model, with no
 * term for retry backoff or a 429. A slower engine on a bad link will overrun it, so the panel
 * rounds it and says "about".
 *
 * It is left as an estimate rather than promoted to a table because the two numbers are not
 * equally load-bearing: the size line is what an author consents to before emailing a file to
 * a board, while the time line only sets expectations for a run they can cancel. If that stops
 * being true — if anything gates on the duration — this needs the same treatment the bytes got.
 */
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
	const totalChars = perSlide.reduce((n, row) => n + row.reduce((m, t) => m + t.length, 0), 0);
	const base: NarrationMeasure = { total, cached: 0, cachedBytes: 0, missing: 0, missingChars: 0, totalChars, missingBytes: 0, estCostUsd: null, estSeconds: 0, voice, complete };
	if (!total) return base;

	const keys = await bakeClipKeys(perSlide, voice);
	const sizes = narrationCacheEnabled() ? await clipSizes(keys.flat()) : new Map<string, number>();

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
	return { ...base, cached, cachedBytes, missing, missingChars, missingBytes: estimateSynthBytes(missingChars, voice.model), estCostUsd, estSeconds };
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
	opts: { voice: BakeVoice; audio: boolean; allowPartial?: boolean; signal?: AbortSignal; onProgress?: (p: BakeProgress) => void },
): Promise<NarrationBake> {
	const { voice, audio, allowPartial, signal, onProgress } = opts;
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
		return { slides, voice: audio ? voice : null, covered: 0, total, bytes: 0, synthesized: 0, failures: [] };
	}

	const keys = await bakeClipKeys(perSlide, voice);
	// Flatten to one work list. A deck's sentences are wildly uneven per slide, so scheduling
	// per slide would leave workers idle behind a one-sentence title while a ten-sentence
	// argument waits its turn.
	const jobs: { i: number; j: number; text: string; key: string; twins: { i: number; j: number }[] }[] = [];
	// One job per DISTINCT sentence. A deck that repeats a line — the same one-sentence caption
	// on three adjacent slides, a refrain — used to hand three workers three identical keys,
	// all of which missed the in-memory cache simultaneously and all of which were billed.
	// (`synthFor` has no in-flight dedup, unlike the live reader's `synthOne`.) The repeats
	// ride along as `twins` and are filled from the one clip that is actually fetched.
	const byKey = new Map<string, number>();
	for (let i = 0; i < perSlide.length; i++) {
		for (let j = 0; j < perSlide[i].length; j++) {
			const key = keys[i]?.[j] ?? '';
			const at = key ? byKey.get(key) : undefined;
			if (at !== undefined) {
				jobs[at].twins.push({ i, j });
				continue;
			}
			if (key) byKey.set(key, jobs.length);
			jobs.push({ i, j, text: perSlide[i][j], key, twins: [] });
		}
	}

	const failures: { slide: number; text: string; reason: string }[] = [];
	/** Set by the first worker to hit an error that retrying cannot fix; stops the whole run. */
	let terminal = '';
	let done = 0;
	let synthesized = 0;
	let bytes = 0;
	const report = (phase: BakeProgress['phase']) => onProgress?.({ done, total, synthesized, phase });
	report('reading');

	/** Attach a clip's bytes to its cue — and to every repeat of the same sentence — as a
	 *  `data:` URI, counting what each occurrence costs the file. */
	const attach = async (job: { i: number; j: number; twins: { i: number; j: number }[] }, blob: ClipBytes) => {
		// LAST LINE OF DEFENSE on size. Both of today's uncompressed engines now compress at the
		// rung, before their bytes are ever stored, so on the common path this is a MIME check
		// that finds nothing to do. It earns its place on the two paths that bypass that: a clip
		// cached BEFORE this shipped (still WAV on the author's device, and re-synthesizing it to
		// save bytes would re-bill audio they already own), and any future engine returning a
		// format nobody has compressed yet — the gap `DEFAULT_BYTES_PER_CHAR` names, where an
		// unknown uncompressed engine is under-quoted ~7x. Compressing HERE bounds the shipped
		// file by the codec regardless of what the rung handed back, so that gap can no longer
		// reach the artifact.
		const shipped = (await compressClip(blob, narrationBitrate())) ?? blob;
		const uri = `data:${safeMime(shipped.type)};base64,${toBase64(new Uint8Array(await shipped.arrayBuffer()))}`;
		for (const at of [{ i: job.i, j: job.j }, ...job.twins]) {
			slides[at.i][at.j].audio = uri;
			bytes += uri.length;
		}
	};
	/** How many CUES a job covers — the unit `done` and the refusal count in, since the author
	 *  thinks in sentences on slides, not in distinct strings. */
	const cues = (job: { twins: unknown[] }) => 1 + job.twins.length;

	// One controller for the whole run, chained to the caller's. A worker that dies must stop
	// its SIBLINGS, not merely itself: the first version let an exception in one worker reject
	// `Promise.all` while the other two kept synthesizing — the export failed at sentence 3 and
	// then billed the author for all 300, with no artifact, no progress and no cancel button
	// (the busy state had already cleared).
	const run = new AbortController();
	const stop = () => run.abort();
	if (signal) {
		if (signal.aborted) run.abort();
		else signal.addEventListener('abort', stop, { once: true });
	}
	const aborted = () => run.signal.aborted;
	let cursor = 0;
	const worker = async () => {
		for (;;) {
			if (aborted()) return;
			const idx = cursor++;
			if (idx >= jobs.length) return;
			const job = jobs[idx];
			// 1. The device first. A hit is free, instant, and the common case for a rehearsed deck.
			let hit: ClipBytes | null = null;
			try {
				hit = job.key && narrationCacheEnabled() ? asClipBytes(await getClip(job.key)) : null;
			} catch {
				// An unreadable store is a cache miss, not a failure — synthesis below covers it.
				// The read is the ONLY thing this catch covers: an `attach` failure used to fall
				// inside it too, so a clip the device genuinely held was silently re-synthesized
				// and re-billed. That is now a failure with a reason, not a hidden second charge.
			}
			if (hit) {
				await attach(job, hit);
				done += cues(job);
				report('reading');
				continue;
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
					// Bank it — unless the author turned "keep narration on this device" off. That
					// switch is a promise ("narration is no longer kept between sessions"), and the
					// live reader honors it on every write (voice-model.js). An export that wrote
					// anyway would be the one path that quietly broke it.
					try {
						if (narrationCacheEnabled()) await putClip(res.key || job.key, got as unknown as Blob);
					} catch {
						// A full or unavailable store costs the NEXT export a re-synth; it must not
						// cost THIS one the clip we are holding.
					}
					await attach(job, got);
					synthesized += cues(job);
					done += cues(job);
					report('synthesizing');
					reason = '';
					break;
				}
				reason = res.error || 'no audio returned';
				// Nothing is coming. Stop this sentence AND the run — every other sentence is
				// about to fail the same way, for the same reason, at the same cost.
				if (TERMINAL_SYNTH_ERROR.test(reason)) {
					terminal = reason;
					stop();
					break;
				}
			}
			if (reason) for (const at of [{ i: job.i, j: job.j }, ...job.twins]) failures.push({ slide: at.i + 1, text: job.text, reason });
		}
	};

	// `allSettled`, not `all`: a worker that throws must not leave its siblings running while the
	// caller has already given up. Each one's rejection becomes a failure with a reason, so the
	// refusal names it like any other, and `stop()` takes the rest down with it.
	const outcomes = await Promise.allSettled(Array.from({ length: Math.min(BAKE_CONCURRENCY, jobs.length) }, () => worker().catch((e) => { stop(); throw e; })));
	signal?.removeEventListener('abort', stop);
	for (const o of outcomes) {
		if (o.status === 'rejected' && !signal?.aborted) failures.push({ slide: 0, text: '', reason: (o.reason as Error)?.message || 'the bake failed partway through' });
	}
	// A terminal error stops the run early, so the sentences nobody reached have no failure of
	// their own. Say so once, plainly, rather than listing 300 identical rows or — worse —
	// reporting a short list that makes a dead key look like three unlucky sentences.
	if (terminal) {
		const unreached = total - done - failures.length;
		if (unreached > 0) failures.push({ slide: 0, text: `${unreached} more sentence${unreached === 1 ? '' : 's'} were not attempted`, reason: terminal });
	}

	// The CALLER's signal, not the run's. `stop()` also aborts the run controller — for a
	// worker that threw, or a terminal voice error — and reporting either of those as
	// "canceled" would tell the author they pressed a button they never pressed.
	if (signal?.aborted) throw new DOMException('Bake canceled', 'AbortError');
	// The refusal — the DEFAULT, not a wall. Everything synthesized above is already banked, so
	// a second attempt after fixing the cause (reconnect, top up credit) pays only for what is
	// still missing.
	//
	// `allowPartial` is the author's override, offered by the panel only AFTER a refusal has
	// named the sentences. It exists because "complete or nothing" is the right default and the
	// wrong only option: a sentence a model deterministically refuses (a moderation block, a
	// spoken form it 400s on) would otherwise make narration permanently unreachable for that
	// deck, with no way past it. The floor it falls back to is real and verified — the exported
	// player shows the caption, holds the beat and moves on (tools/verify-narrated-player.mjs
	// drives exactly this state) — and it is the same state a clip that fails to DECODE on the
	// recipient's browser lands in, which no producer-side refusal can prevent anyway. What
	// makes it acceptable here and not as a default is that the author is standing right there,
	// has been shown which sentences and why, and chose.
	//
	// A TERMINAL failure is NOT overridable, and that boundary is the whole point of the
	// override. `allowPartial` is justified by a sentence a model deterministically refuses —
	// one specific line, refused every time, blocking a deck forever. A revoked key, an
	// exhausted balance or a dead host is a different animal: it stops the run wherever it
	// happens to be, so the "partial" set it authorizes is not a handful of moderation blocks
	// but everything after sentence N. Observed: a 402 on sentence 3 of 8 shipped SIX silent
	// sentences behind a button captioned "ship them captioned and silent", and on a 300-slide
	// deck it would ship a deck that speaks twice and then stops. The author cannot consent to
	// that from the refusal list, because the list names one real failure and one summary row.
	// The cure for a terminal error is to fix the account, and the refusal says so.
	if (failures.length && (terminal || !allowPartial)) throw new BakeIncompleteError(failures, terminal || undefined, voice);

	report('assembling');
	// `done` — the cues that actually HAVE audio — not `total - failures.length`. A terminal
	// error pushes ONE summary row standing for N unreached sentences, so subtracting rows
	// counted six silent sentences as covered: the field documented as "sentences shipped"
	// reported the inverse of the truth on the one path where it mattered.
	return { slides, voice, covered: done, total, bytes, synthesized, failures };
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
