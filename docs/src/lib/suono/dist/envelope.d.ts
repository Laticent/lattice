/**
 * The fade length actually applied to a clip, in ms. Clamped to at most HALF the clip so the
 * head-fade and tail-fade can never overlap (a very short number fragment gets a proportionally
 * shorter fade rather than a double-ramped mess). 0 (fade disabled) or a non-positive duration
 * yields 0 — the caller then connects the source straight through, no gain node.
 */
export declare function clampFadeMs(durationMs: number, fadeMs: number): number;
