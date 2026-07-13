---
status: proposed
summary: The read-aloud pace model (2026-07-12-narration-pace-model.md) ships a deterministic default (~200 ms/syllable, graded pauses). This is its calibration hook made real: accumulate the per-sentence ratio measured-clip-duration ÷ model-predicted-duration that cursor.align() already computes, per voice, into a robust running scalar k, then feed k back as a per-voice multiplier on SYLLABLE_MS. One coefficient, fit online from the signal the diagnostics overlay already surfaces, stored per voice in localStorage (bring-your-own-key, per device, no server). Tightens the SILENT read-along and the cold-start window before the first onset (mid-stream, align() already corrects a clocked voice); and — the bigger long-term lever — a voice-calibrated model turns a large residual into the "hard-to-say caption" signal that feeds the Layer-2 rewriter. Slice 1 of the calibration/rewriter thread; the pure accumulator lands first, wiring + diagnostics surface second.
companion:
  - ./2026-07-12-narration-pace-model.md
  - ./2026-07-09-cadenza-narration-quality.md
---

# Per-voice pace calibration

**Status:** proposed (design → build slice 1)
**Thread:** read-aloud narration quality (follows `2026-07-12-narration-pace-model.md`)
**Branch:** `claude/read-aloud-skip-rush-regression-ha22xs`

## Problem

The pace model (`cadence.ts`) is a **deterministic default**: ~200 ms/syllable at 150 wpm,
graded pauses. It's grounded in population norms — but every TTS voice has its own true rate,
and the user's chosen voice (cloud Kokoro `af_heart`, another OpenRouter model, the browser
voice) may run faster or slower than the default. When the default is wrong for a voice, two
things suffer: the **silent read-along** (no audio to re-anchor against — the estimate IS the
clock) and the **cold-start window** on a clocked voice (every word before the first measured
onset arrives is positioned by the estimate). Mid-stream, `cursor.align()` already corrects a
clocked voice, so calibration is NOT about mid-stream sync — it's about the two windows the
estimate actually governs, plus laying the residual signal the Layer-2 rewriter needs.

The narration-pace doc named this explicitly (§Calibration hook): *"A later thread can fit
`SYLL_MS` / the pause table per voice by regressing the model against measured onsets."* This
is that thread, kept to the smallest honest slice.

## The signal is already computed

`cursor.align(index, onsetMs, durationMs)` runs per sentence for a clocked voice and computes
`scale = measuredDur / estDur` — the ratio of the voice's REAL clip duration to what the model
PREDICTED. That ratio is the fitness signal; today it re-anchors one cue and is dropped. We
accumulate it per voice instead. **Zero new measurement** — we tap a number `align()` already has.

## The model

- **What we fit — one scalar `k` per voice.** `k = robust_center(measuredDur / estDur)` over the
  sentences played on that voice. `k > 1` → the voice is slower than the default (stretch the
  estimate); `k < 1` → faster. One parameter is deliberate: it's robust with little data, can't
  overfit, and is the literal "coefficient swap" the pace-model doc promised. A fuller regression
  (per-syllable + intercept + per-pause) is a later refinement once we have a sample corpus.
- **How we fit — online, robust, clamped.** Update a running trimmed estimate (median-of-recent
  or an EMA of the ratio with outlier rejection) as sentences play. Accept a sample ONLY when the
  sentence played cleanly (no abort, no synth-fallback, `estDur > 0`, `measuredDur` within a sane
  band). Clamp `k` to **[0.6, 1.6]** so one pathological clip (a decode stall, a truncated
  synth) can never wreck pacing. Require a minimum sample count (~5) before `k` leaves 1.0.
- **Where we store it — localStorage, per voice.** Key by the voice/model id (mirrors
  `readaloud-overlay-prefs.ts`): `{ k, n, updatedAt }`. Per user, per device, client-only — the
  same bring-your-own-key posture as the Playground. No server, no telemetry.
- **How it feeds back.** `estimateWordMs` / `buildTrack` take an optional `rateScale` (default 1);
  the read-aloud consumer passes the current voice's `k`. The silent estimate and the cold-start
  window use the calibrated rate; the clocked mid-stream path is unchanged (still onset-anchored).
- **How it surfaces.** The diagnostics overlay shows the active voice's `k` and sample count `n`,
  with a "reset calibration" control — so the signal is inspectable, not a black box.

## Scope — honest value

Calibration's absolute-pace win lands on the **silent read-along** and the **pre-first-onset
cold start**, not mid-stream clocked sync (`align()` owns that). Its bigger role is as the
**substrate for Layer-2**: once the model is voice-calibrated, a sentence whose measured duration
STILL diverges wildly from the calibrated prediction is a "hard-to-say" caption — the exact
signal the rewriter needs. That is why this is slice 1: it de-risks and feeds the rewriter, and
it stands alone as a real (if modest) improvement to silent + cold-start pacing.

## Slices

1. **This slice — the substrate + scalar `k`.** A pure `calibrate.ts` accumulator
   (`observe(estDur, measuredDur)` → running `k`; serialize/restore), a per-voice localStorage
   store, the `onSentenceTiming` tap, the `rateScale` feedback into `estimateWordMs`/`buildTrack`,
   and the diagnostics readout. Fully unit-testable (the accumulator is pure).
2. **Later — Layer-2 hard-to-say flag + rewriter.** Use the calibrated residual to flag captions
   that read badly, feeding a rewriter (likely an LLM-in-the-loop pass on the user's own key).

## Files this touches (slice 1)

- `docs/src/lib/cadenza/calibrate.ts` — NEW: the pure per-voice accumulator + clamp + serialize.
- `docs/src/lib/cadenza/cadence.ts` — `estimateWordMs(spoken, pace, rateScale?)`.
- `docs/src/lib/cadenza/track.ts` — thread `rateScale` through `buildTrack`.
- `docs/src/playground/readaloud-calibration.ts` — NEW: per-voice localStorage store (mirrors the
  overlay-prefs pattern).
- `docs/src/components/studio/read-aloud.ts` — observe the ratio in `onSentenceTiming`; pass the
  voice's `k` as `rateScale`.
- Diagnostics overlay — show `k` + `n` + reset.
- Regenerate the cadenza + read-along-core bundles. No exported `.vtt`-byte change beyond the
  timing shift the calibrated rate implies (same class as the pace model). Silent-estimate change.

## Open decisions (for the go-ahead)

1. **Estimator:** trimmed-median-of-recent vs EMA-with-outlier-rejection. Recommend a small
   recent-window median (simple, robust, no tuning). Confirm before wiring.
2. **Auto-apply vs opt-in:** apply `k` automatically once `n ≥ 5`, or gate behind a diagnostics
   toggle first. Recommend **auto-apply with the clamp + reset** — it's self-correcting and the
   clamp bounds the blast radius; the toggle is a fallback if on-device review dislikes it.
