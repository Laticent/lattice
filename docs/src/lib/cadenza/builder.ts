// Cadenza — the fluent CONFIG front door. Configure once (pace, acronyms, lang, rate, lexicon),
// emit many: `.toTrack()` / `.toReader()` / `.toVtt()` / `.toSrt()`. Today those four calls each
// take an overlapping slice of the same options; this collects them once and returns `this` per
// verb, so a call-site stops rebuilding the options bag for every output.
//
// Each terminal is EXACTLY the matching pure call over the collected `(text, BuildOptions)` —
// `buildTrack` / `makeReader` / `toVtt` / `toSrt` — guarded by a parity test, so the builder adds no
// behavior. Crucially it is a CONFIG builder, NOT a cue/word assembler: you never hand-build the
// timeline, so Cadenza's core invariant holds — timing is computed on the SPOKEN form while the
// caption renders DISPLAY glyphs, and the two cannot desync through this surface. Cadenza stays "not
// a decider of what to say": the narration text is the authoring surface. See the design ADR:
// engineering/decisions/2026-07-07-cadenza-caption-timeline.md

import type { Pace } from './cadence';
import { type CalibrationState, rateScale as rateScaleFor } from './calibrate';
import type { AcronymRegistry } from './normalize';
import { makeReader, type Reader, type ReaderOptions } from './reader';
import type { LexiconMap } from './symbols';
import { type BuildOptions, buildTrack, type CaptionTrack } from './track';
import { toSrt, toVtt } from './vtt';

export interface Narration {
	/** Reading pace (default `moderate`). */
	pace(p: Pace): this;
	/** The deck's author acronym registry (term → spoken expansion; author wins). */
	acronyms(reg: AcronymRegistry): this;
	/** The deck's language tag (a non-English deck bypasses the English lexicon + number expansion). */
	lang(tag: string): this;
	/** Raw per-voice pace multiplier scaling the syllable estimate (default 1). */
	rate(scale: number): this;
	/** Derive the pace multiplier from a measured `CalibrationState` — === `rateScale(state)`. */
	calibration(state: CalibrationState | null | undefined): this;
	/** The deck's read-aloud lexicon (token → spoken form, beating the built-in symbol commons). */
	lexicon(map: LexiconMap): this;

	// ── terminals — each is exactly the matching pure call over the collected (text, options) ──
	/** The estimate-baseline timeline. === `buildTrack(text, options)`. */
	toTrack(): CaptionTrack;
	/** A read-along driver over a freshly built track. === `makeReader({track, ...handlers})`. */
	toReader(handlers?: Omit<ReaderOptions, 'track'>): Reader;
	/** WebVTT for the built track. === `toVtt(buildTrack(text, options))`. */
	toVtt(): string;
	/** SRT for the built track. === `toSrt(buildTrack(text, options))`. */
	toSrt(): string;
}

/** Open a fluent narration over `text`. Chain config verbs then emit — e.g.
 *  `narration('Revenue grew to $4.2M.').pace('moderate').lexicon(map).toVtt()`. Every terminal is
 *  the plain Cadenza function applied to the collected options, so the builder is a proven
 *  pass-through (guarded by builder.test.ts) and never lets you desync display/spoken/timing. */
export function narration(text: string): Narration {
	const opts: BuildOptions = {};

	const b: Narration = {
		pace(p) {
			opts.pace = p;
			return b;
		},
		acronyms(reg) {
			opts.acronyms = reg;
			return b;
		},
		lang(tag) {
			opts.lang = tag;
			return b;
		},
		rate(scale) {
			opts.rateScale = scale;
			return b;
		},
		calibration(state) {
			opts.rateScale = rateScaleFor(state);
			return b;
		},
		lexicon(map) {
			opts.lexicon = map;
			return b;
		},
		toTrack() {
			return buildTrack(text, opts);
		},
		toReader(handlers) {
			return makeReader({ track: buildTrack(text, opts), ...handlers });
		},
		toVtt() {
			return toVtt(buildTrack(text, opts));
		},
		toSrt() {
			return toSrt(buildTrack(text, opts));
		},
	};
	return b;
}
