// Vetrina — PACING: every duration the theater spends, in one place, each number
// carrying the finding it comes from.
//
// WHY THIS FILE EXISTS. The durations used to be five literals scattered across
// stage.ts, storyboard.ts and runner.ts — `480`, `clamp(dist, 300, 820)`, `900`,
// `300 + 200 * words`, `22`. Every one was tuned by eye, none could be defended, and
// two of them were measurably wrong (see § "What the numbers said" below). A demo's
// pacing is the difference between teaching and reciting, so it deserves a model.
//
// THE SHAPE OF THE MODEL. Three of the four timings are ESTIMATES the library computes;
// the fourth (caption dwell) is an estimate the library only uses when nothing better is
// available. When a `Narrator` is wired (see ./narrate), the narration engine's own
// measurement supersedes the dwell estimate — a Cadenza track's syllable-accurate
// duration, or, with a voice, the MEASURED clip duration. That layering is deliberate:
// a grounded default is still a guess, and a measurement is not.
//
// BOUNDARY. This file is pure, DOM-free, and imports nothing — Vetrina's core stays
// self-contained (checkVetrinaBoundary). In particular it does NOT copy Cadenza's
// syllable model: there is one of those, it lives in Cadenza, and Vetrina reaches it
// through the narrator port rather than through a second copy (HARD RULE #1). The one
// number the two libraries must agree on — the caption reading rate — is pinned by a
// cross-library parity test in pacing.test.ts (tests are exempt from the boundary gate).

/** The curated speed presets, as the `Theme.speed` names. */
export type Speed = 'slow' | 'moderate' | 'fast';

/** Which pacing model a run uses.
 *
 *  `'legacy'` reproduces the five hand-tuned literals byte for byte, and is the DEFAULT: the
 *  grounded numbers are the better ones, but adopting them re-times every existing tour (+13% on
 *  a measured run, everything else held constant), so that is a decision with a review attached
 *  rather than something a library upgrade does to you. It also exists so the two can be A/B'd on the same surface in
 *  the same session — an unmeasurable "feels better" is not evidence (HARD RULE #19). */
export type PacingModel = 'grounded' | 'legacy';

// ── What the numbers said ───────────────────────────────────────────────────
// Two of the five literals were not merely untuned, they were wrong by a factor:
//
// 1. CAPTION DWELL ran at ~300 wpm. `storyboard.readMs` budgets `300 + 200*words`, i.e.
//    200 ms/word ≈ 300 wpm, for a caption the viewer has never seen, while also watching
//    an app. No subtitle standard is near that: the BBC's guideline is 160–180 wpm and
//    Netflix's adult limit of 17 characters/second works out to ~200 wpm. Brysbaert's
//    2019 meta-analysis (77 studies, 5,965 participants) puts UNDISTRACTED silent reading
//    of non-fiction at ~238 wpm, and caption reading is the distracted case, so the
//    budget has to sit BELOW 238, not 60% above it.
//    Cadenza — the same repo, the same job — already uses 150 wpm. The two `readMs`
//    functions therefore disagreed by 2x. This file adopts Cadenza's rate, and
//    pacing.test.ts pins the two together so they cannot drift apart again.
//
// 2. TYPING ran below the threshold at which characters read as separate events.
//    `runner.ts` types at 22 ms/char and calls it "a human cadence". A fast human typist
//    is ~120–150 ms/char (80–100 wpm), so it is 6x faster than the thing it claims to
//    be — but the reason to change it is perceptual, not fidelity: two visual events
//    closer than ~40 ms fuse rather than resolving as two. At 22 ms/char the reveal is a
//    smear that reads as a paste; at 55 ms/char it reads as typing, and is still ~3x
//    faster than a person, which is what a demo actually wants.
//
// The other three were reasonable-but-arbitrary. The grounded model keeps them inside
// the same envelope and redistributes WITHIN it — see `travelMs`.

/** Words per minute budgeted for reading a caption. NOT a silent-reading rate: a tour
 *  caption is read under split attention, which is why it sits below Brysbaert's ~238 wpm
 *  for undistracted non-fiction and inside the 160–180 wpm subtitle band.
 *
 *  MUST equal Cadenza's `PACE_WPM` (pinned by a parity test). */
export const CAPTION_WPM: Record<Speed, number> = { slow: 120, moderate: 150, fast: 175 };

/** The fixed cost of a caption CHANGING: the saccade to it plus the first fixation, before
 *  any word has been read. Cadenza's `readMs` carries the same 300 ms constant. */
export const CAPTION_NOTICE_MS = 300;

/** Reading-time floor and ceiling. The floor is the point below which a caption flashes
 *  rather than reads; the ceiling is subtitle practice's "6-second rule" — beyond it a
 *  caption is not being read, it is being stared at, and the beat should have been split. */
export const CAPTION_MIN_MS = 1000;
export const CAPTION_MAX_MS = 6000;

/** Fitts's law intercept — the fixed cost of an aimed movement that has no distance to
 *  cover at all (reaction + initiation). */
export const FITTS_A_MS = 180;
/** Fitts's law slope, ms per bit of index of difficulty. Human mouse pointing throughput
 *  is ~4–5 bits/s (MacKenzie 1992), i.e. ~200–250 ms/bit; a demonstration cursor is a
 *  presenter's deliberate, legible hand rather than a user racing a target, and 110 ms/bit
 *  is what keeps the resulting envelope inside the 300–820 ms the library already used. */
export const FITTS_B_MS = 110;
/** The width assumed for a target whose size we do not know (a bare point, a rect source
 *  that answers a zero-area rect). 44px is the platform minimum touch target — the size a
 *  control is at least meant to be. */
export const NOMINAL_TARGET_PX = 44;
/** Travel envelope. The clamp is the same one the linear law used, deliberately: this
 *  change is about DISTRIBUTING the time correctly, not about spending more of it. */
export const TRAVEL_MIN_MS = 300;
export const TRAVEL_MAX_MS = 820;

/** Time to initiate and land a saccade onto a newly-named target (~200 ms latency plus the
 *  movement), then the lead a hand gives the eye in aimed movement: the eye arrives on the
 *  target 100–200 ms before the hand does (Land & Hayhoe). Together, the "register beat"
 *  the cursor spends before it starts moving — the pause that lets the viewer's eye get
 *  there first, which is the whole reason it exists. */
export const REGISTER_MS = 350;

/** The land: the pause after an action, while the viewer takes in what changed. A saccade
 *  to the changed region (~250 ms) plus the time to encode it (~400 ms). */
export const SETTLE_MS = 650;

/** How long the caption's cross-fade takes. It MIRRORS the `transition: opacity .18s` the bubble
 *  is styled with (stage.ts), and the coupling is deliberate: a beat that dismisses its caption
 *  and acts in the same frame fires the action while the words are still at ~18% — measured on
 *  the real page, a visible smudge under the click burst. "It disappears, and then the action
 *  happens" means waiting for it to actually be gone. */
export const CAPTION_FADE_MS = 180;

/** Milliseconds per character for the typing reveal. Above the ~40 ms at which successive
 *  visual events fuse, so the reveal reads as typing rather than as a paste; still ~3x a
 *  fast human typist, because a demo that types at human speed is unwatchable. */
export const TYPE_MS_PER_CHAR = 55;

// The literals the grounded model replaces, kept exact so `'legacy'` is byte-identical.
const LEGACY = {
	registerMs: 480,
	travelMin: 300,
	travelMax: 820,
	settleMs: 900,
	typeMsPerChar: 22,
	captionMsPerWord: 200,
	captionNoticeMs: 300,
	captionMinMs: 1200,
	captionMaxMs: 4500,
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const log2 = (v: number) => Math.log(v) / Math.LN2;

/** The one object the stage and the storyboard read their durations from. Every field is a
 *  duration in milliseconds BEFORE the `speed` multiplier the caller applies. */
export interface Pacing {
	readonly model: PacingModel;
	readonly speed: Speed;
	/** The pause before the cursor starts moving, so the eye can lead it. `aimed` is true
	 *  when the cursor is already on the target — there is no saccade to wait for, so there
	 *  is nothing to spend. */
	registerMs(aimed: boolean): number;
	/** How long the cursor takes to travel `distancePx` to a target `targetPx` wide.
	 *  Fitts's law in Shannon form: a + b·log2(D/W + 1). */
	travelMs(distancePx: number, targetPx?: number): number;
	/** How long to dwell on a caption so it can be READ — the fallback, used only when no
	 *  narrator has supplied a real duration for this line. */
	captionMs(text: string): number;
	/** The land — the digest pause after an action, when the author did not name one. */
	settleMs(): number;
	/** Per-character delay for the typing reveal. */
	typeMsPerChar(): number;
}

/** Build the pacing model for a run. Pure — no DOM, no clock, no state. */
export function resolvePacing(speed: Speed = 'moderate', model: PacingModel = 'legacy'): Pacing {
	const legacy = model === 'legacy';
	return {
		model,
		speed,
		registerMs(aimed: boolean): number {
			if (legacy) return LEGACY.registerMs; // the literal spent it even when already aimed
			return aimed ? 0 : REGISTER_MS;
		},
		travelMs(distancePx: number, targetPx?: number): number {
			const d = Number.isFinite(distancePx) ? Math.max(0, distancePx) : 0;
			if (legacy) return clamp(d, LEGACY.travelMin, LEGACY.travelMax);
			// A target we cannot measure is assumed to be the platform minimum, which is the
			// conservative direction: a smaller assumed target buys MORE time, never less.
			const w = Number.isFinite(targetPx) && (targetPx as number) > 0 ? (targetPx as number) : NOMINAL_TARGET_PX;
			return clamp(FITTS_A_MS + FITTS_B_MS * log2(d / w + 1), TRAVEL_MIN_MS, TRAVEL_MAX_MS);
		},
		captionMs(text: string): number {
			const words = text.trim().split(/\s+/).filter(Boolean).length;
			if (legacy) return clamp(LEGACY.captionNoticeMs + LEGACY.captionMsPerWord * words, LEGACY.captionMinMs, LEGACY.captionMaxMs);
			const raw = CAPTION_NOTICE_MS + (60000 / CAPTION_WPM[speed]) * words;
			return Math.round(clamp(raw, CAPTION_MIN_MS, CAPTION_MAX_MS));
		},
		settleMs(): number {
			return legacy ? LEGACY.settleMs : SETTLE_MS;
		},
		typeMsPerChar(): number {
			return legacy ? LEGACY.typeMsPerChar : TYPE_MS_PER_CHAR;
		},
	};
}
