// LTT — the Lattice Timing Track. Every type in the format, defined once, here.
//
// THIS FILE IS THE SCHEMA'S SOURCE. `tools/build-ltt-schema.js` reads it and writes
// `ltt.schema.json`; `npm run build:check` fails when the two differ (guardrail G1 of
// engineering/decisions/2026-09-24-lattice-timing-track.md). So the file keeps to the subset
// of TypeScript that generator understands, and the generator refuses anything else by name:
// interfaces, type aliases, string and number literals, `string` / `number` / `boolean`,
// `T[]`, fixed tuples, inline object types, and unions of those. A doc comment becomes the
// schema's `description`; three tags narrow a type: `@integer`, `@minimum <n>` and
// `@pattern <regex>`. A fourth, `@closed`, forbids keys the type does not declare. Only the core
// carries it: the packed encoding knows the core field by field, so an undeclared core key would
// not survive packing, while every other object stays open for the layers a reader skips.
//
// The spec that gives these fields their meaning is engineering/ltt.md.

// ── The core: a caption track (moved here from Cadenza; Cadenza re-exports it) ─────────────

/** One word of a caption: what the viewer reads, what the voice says, and when. @closed */
export interface Word {
	/** The glyph group shown in the caption (e.g. "$4.2M"). The highlight unit. */
	display: string;
	/** The spoken expansion timing is computed on (e.g. "four point two million dollars"). */
	spoken: string;
	/** @integer @minimum 0 */
	startMs: number;
	/** @integer @minimum 0 */
	endMs: number;
	/** Index into the source text where `display` begins (best-effort forward scan).
	 *  @integer @minimum 0 */
	charOffset: number;
	/** Emphasis weight, 1 = ordinary. ABSENT for an ordinary word — an unweighted deck therefore
	 *  serializes exactly as it did before emphasis existed, so no golden or manifest moves. */
	weight?: number;
}

/** One caption line: a sentence, in the words it is shown and spoken in. @closed */
export interface Cue {
	/** The caption line as shown (the display words joined). */
	display: string;
	words: Word[];
	/** @integer @minimum 0 */
	startMs: number;
	/** @integer @minimum 0 */
	endMs: number;
	/** @integer @minimum 0 */
	charOffset: number;
	/** True when a PARAGRAPH / topic boundary (a blank line) follows this cue — so the gap before the
	 *  next cue is the deeper `PARAGRAPH_PAUSE_MS` beat, not the sentence pause. The clocked player reads
	 *  this to widen the inter-clip breath (read-aloud.ts). Absent/false for an ordinary sentence break. */
	endsParagraph?: boolean;
	/** The cue's emphasis weight — the MAX over its words, absent when ordinary. This is what buys
	 *  the extra breath AFTER the cue (`interCueGapMs`), and max is the right reducer because a
	 *  sentence is as important as the most important thing in it; averaging would let a long
	 *  sentence dilute its own key phrase into silence. Every consumer computing the inter-cue gap
	 *  MUST read it from here so the estimate and the clocked player stay in step. */
	weight?: number;
}

/** A timed caption track: the cues of one stretch of narration, laid end to end from zero. @closed */
export interface CaptionTrack {
	cues: Cue[];
	/** Total estimated duration (end of the last cue), ms. @integer @minimum 0 */
	durationMs: number;
}

// ── The envelope ────────────────────────────────────────────────────────────────────────────

/** A content hash, written `sha256:` and 64 lowercase hex digits. @pattern ^sha256:[0-9a-f]{64}$ */
export type LttHash = string;

/** Cadenza's reading rate. */
export type LttPace = 'slow' | 'moderate' | 'fast';

/** The deck's `pace:` register (lib/core/resolve-pace.mjs): how long a new slide holds. */
export type LttDeckPace = 'brisk' | 'natural' | 'deliberate';

/** Vetrina's resolved motion tier. */
export type LttMotion = 'full' | 'legible' | 'still';

/** How far to trust a segment's numbers: Cadenza's text-only `estimate`, re-timed to a real clip
 *  (`measured`), or converted from a deck exported before the LTT existed (`legacy`). */
export type LttBasis = 'estimate' | 'measured' | 'legacy';

/** The wait a player honors before a tour stretch starts. Never a time: how long it lasts is
 *  unknown until a run is recorded. `awaitUser` waits for the viewer, `until` for a condition in
 *  the page, `act` for an asynchronous action to finish. */
export type LttAfter = 'awaitUser' | 'until' | 'act';

/** What the file was built from, as a whole. */
export interface LttSource {
	kind: 'deck' | 'tour';
	/** The deck's file name or the tour's id — whatever its producer uses to find it again. */
	id: string;
}

/** The screen a tour was recorded on. */
export interface LttViewport {
	/** @integer @minimum 1 */
	w: number;
	/** @integer @minimum 1 */
	h: number;
}

/** Every input that changes timing, file-wide. A segment's `hash` covers all of them. */
export interface LttInputs {
	/** Content hash of the timing engine's build — NOT its package version, which has never moved. */
	engine: LttHash;
	pace: LttPace;
	/** Decks only. */
	deckPace?: LttDeckPace;
	/** The deck's language tag (Marp `lang:`). */
	lang?: string;
	/** Hash of the deck's `lexicon:` map. */
	lexicon?: LttHash;
	/** Hash of the deck's acronym registry. */
	acronyms?: LttHash;
	/** Tours only: the screen a recorded run's timing depended on. */
	viewport?: LttViewport;
	/** Tours only: the motion tier a recorded run played at. */
	motion?: LttMotion;
	/** Tours only: the stage's `pace` multiplier a recorded run played at. @minimum 0 */
	stagePace?: number;
}

// ── The optional layers ─────────────────────────────────────────────────────────────────────

/** What spoke a clip. */
export interface LttVoice {
	/** TTS model slug (e.g. "hexgrad/kokoro-82m"). */
	model: string;
	/** Voice id, model-specific (e.g. "af_heart"). */
	voice: string;
	/** Pace multiplier passed to the voice (1 = natural). @minimum 0 */
	speed: number;
}

/** AUDIO layer (Suono). A reader that does not know it plays silently on the estimate. */
export interface LttAudio {
	/** The clip: a path relative to the file, or a `data:` URI. */
	src: string;
	/** Content hash of the clip bytes. */
	clip: LttHash;
	voice: LttVoice;
	/** The clip's decoded length. @integer @minimum 0 */
	measuredMs: number;
	/** Encoder-inserted leading silence. @minimum 0 */
	leadMs?: number;
}

/** ACTIONS layer (Vetrina). An action is anchored to a WORD, never to a time. */
export interface LttAction {
	/** Index of the cue in this segment's track. @integer @minimum 0 */
	cue: number;
	/** Index of the word in that cue. @integer @minimum 0 */
	word: number;
	/** The word the author named, normalized (case-folded, edge punctuation stripped). `validateLtt`
	 *  fails when the word at `{cue, word}` no longer normalizes to it. */
	match: string;
	/** What the cursor does (`click`, `type`, …) — Vetrina's verb. */
	verb: string;
	/** The CSS selector the verb acts on. */
	target?: string;
	/** When the cursor arrives: `on-word` lands it on the word. */
	arrive?: 'on-word';
}

// ── Segments ────────────────────────────────────────────────────────────────────────────────

/** A narrated deck slide: its arrival hold, then its track. */
export interface LttSlideSegment {
	id: string;
	kind: 'slide';
	at: LttSlideAt;
	/** Hash of this slide's narration text plus the file's `inputs`. */
	hash: LttHash;
	basis: LttBasis;
	/** The hold on arrival. 0 on the first slide. @integer @minimum 0 */
	holdMs: number;
	track: CaptionTrack;
	audio?: LttAudio;
	actions?: LttAction[];
}

/** A deck slide with no narration: its arrival hold and nothing else. */
export interface LttHoldSegment {
	id: string;
	kind: 'hold';
	at: LttSlideAt;
	/** @integer @minimum 0 */
	holdMs: number;
}

/** In a tour, the run between two waits. */
export interface LttStretchSegment {
	id: string;
	kind: 'stretch';
	at: LttBeatsAt;
	/** The wait before this stretch. Absent: it follows the previous segment at once. */
	after?: LttAfter;
	/** How long the `after` wait took in a recorded run. Required on every waited stretch of a
	 *  seekable file, because a seekable file must know every segment's length.
	 *  @integer @minimum 0 */
	waitedMs?: number;
	/** Hash of this stretch's narration text, the storyboard steps it spans, and the file's `inputs`. */
	hash: LttHash;
	basis: LttBasis;
	track: CaptionTrack;
	audio?: LttAudio;
	actions?: LttAction[];
}

/** Where a deck segment sits: its 1-based slide number. */
export interface LttSlideAt {
	/** @integer @minimum 1 */
	slide: number;
}

/** Where a tour stretch sits: the first and last storyboard beat it spans. */
export interface LttBeatsAt {
	beats: [number, number];
}

export type LttSegment = LttSlideSegment | LttHoldSegment | LttStretchSegment;

// ── The file ────────────────────────────────────────────────────────────────────────────────

/** A Lattice Timing Track, in its canonical encoding (`*.ltt.json`). */
export interface Ltt {
	format: 'ltt';
	version: '1.0';
	source: LttSource;
	inputs: LttInputs;
	/** True when every segment's length is known, so the segments lay end to end on one timeline. */
	seekable: boolean;
	segments: LttSegment[];
}
