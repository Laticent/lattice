// Suono — declick envelope math. PURE, node-safe. A TTS/synth clip rarely begins or ends exactly at
// a zero-crossing, so playing it raw steps from silence straight to a non-zero sample — a
// discontinuity the ear hears as a click/pop. It's worst on decks that narrate many short fragments
// back to back ("53 / 14 / 4 / 1" → many clip boundaries → many clicks), and a shorter breath gap
// only packs the clicks closer. The cure is a few-ms gain ramp at each clip's head and tail (see
// stage.play): amplitude 0→1 in, 1→0 out, so playback never steps from/to a non-zero sample. This
// module is just the timing math so it can be unit-tested without an AudioContext.

/**
 * The fade length actually applied to a clip, in ms. Clamped to at most HALF the clip so the
 * head-fade and tail-fade can never overlap (a very short number fragment gets a proportionally
 * shorter fade rather than a double-ramped mess). 0 (fade disabled) or a non-positive duration
 * yields 0 — the caller then connects the source straight through, no gain node.
 */
export function clampFadeMs(durationMs: number, fadeMs: number): number {
	// Reject non-finite too (a caller-constructed Clip could carry Infinity/NaN durationMs) —
	// Infinity > 0 is true, so a bare `> 0` check would let `t0 + Infinity` reach
	// linearRampToValueAtTime and throw a RangeError. Non-finite → no fade (straight connect).
	if (!Number.isFinite(durationMs) || !Number.isFinite(fadeMs) || !(fadeMs > 0) || !(durationMs > 0)) return 0;
	return Math.min(fadeMs, durationMs / 2);
}
