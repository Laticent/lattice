---
status: superseded
superseded-by: 2026-07-13-estimator-trailing-silence-and-number-syllables.md
summary: CLOSED (2026-07-14) — NOT BUILT. The read-aloud estimator was fixed at the source instead (trailing-silence/cue-span bias #967, number/times syllables #967, paragraph pauses #980, plus acronyms-in-Lexicon #959), and the reshaped narration was confirmed aligning on-device. That resolved the problem apply-k/rewriter were designed to paper over. Maintainer decision: apply-k has NO value right now (its real win is a narrow mid-stream sliver behind real reference-track surgery) — revisit only if a concrete pacing issue surfaces; the hard-to-say REWRITER stays unbuilt (its signal tracks a deck's most valuable sentences, not awkward ones; it needs an unmeasured surviving residual, an LLM+security surface, and an unsolved narration→source mapping). This doc is the record of why neither was built. Original design below. // Two coupled slices of the read-aloud calibration/rewriter thread, in one PR. (1) APPLY the per-voice scalar `k` that already accumulates measure-only — feed the voice's `rateScale` into `buildTrack` so the SILENT read-along and the pre-first-onset COLD START pace to the voice's measured rate (the clocked mid-stream path is already onset-anchored and untouched). k applies at track-BUILD time per slide (never mid-playback, which would jump the timeline), auto-applied once n≥5 with the existing [0.6,1.6] clamp + reset. (2) The hard-to-say REWRITER — once the model is voice-calibrated, a caption whose MEASURED duration still diverges from the CALIBRATED prediction is "hard to say"; flag it in Studio and offer an LLM rewrite on the USER's own OpenRouter key (opt-in, never our key, never auto-applied, never in the export path). A live authoring aid, sanitized output, human-approved. Slice 1 is the substrate; slice 2 is the payoff it de-risks.
companion:
  - ./2026-07-12-per-voice-pace-calibration.md
  - ./2026-07-12-narration-pace-model.md
  - ./2026-07-11-manifest-speech-contract.md
  - ./2026-06-29-component-transformer-threat-model.md
---

# Pace calibration — apply `k`, then the hard-to-say rewriter

**Status:** CLOSED — NOT BUILT (2026-07-14). Superseded by fixing the estimator's data.
**Thread:** read-aloud narration quality (follows `2026-07-12-per-voice-pace-calibration.md`)
**Branch:** `claude/read-aloud-skip-rush-regression-ha22xs`

## Closing decision (2026-07-14)

Neither slice is being built. The estimator was fixed **at the source** across the thread —
acronyms-in-Lexicon (#959), the trailing-silence / cue-span de-bias and the number/`times` syllable
counts (#967), and the paragraph-pause tier with the held highlight (#980) — and the reshaped
narration was **confirmed aligning on-device by the maintainer.** That removed the problem apply-`k`
and the rewriter were designed to paper over.

- **apply-`k` — no value right now.** Its real win is a narrow mid-stream sliver (slide ≥2, unmuted,
  between measured onsets) and it needs real surgery (a separate `k=1` reference track, voice·speed
  keying) or it breaks the shipped measure-only calibration (red-team finding, below). Not worth the
  cost against a corrected estimator. **Revisit only if a concrete, felt pacing issue surfaces** on a
  real deck; the measure-only calibration + overlay stay as they are.
- **Hard-to-say rewriter — stays unbuilt.** Its "takes longer than predicted" signal tracks a deck's
  **most valuable** sentences (financials, names, "EBITDA"), not awkward ones, so it would nudge
  authors to smooth away precision; it presumes a surviving residual we have no evidence of ("on
  point, no noticeable gaps"); and it carries an LLM + security surface plus an unsolved
  narration→source mapping (below). If a real "this line reads awkwardly" case appears, the fix is to
  edit the line, not to bolt on an LLM.

The rest of this doc is the preserved design + the adversarial-trio verdict — the record of **why**
neither was built.

## Where we are

The measure-only slice shipped: `calibrate.ts` folds each clocked sentence's `measuredDur/estDur`
ratio into a robust, clamped per-voice scalar `k` (windowed median, `[0.6,1.6]`, `n≥5` before it
leaves 1.0); `readaloud-calibration.ts` persists it per voice in localStorage; `read-aloud.ts`
records observations and *shows* `k`+`n` in the diagnostics overlay. **But `k` is never applied** —
both `buildTrack(text, { acronyms, lang, lexicon })` calls omit `rateScale`, so the silent estimate
runs at the deterministic default. This PR closes that loop **and** builds the payoff it exists for.

## Slice 1 — apply `k`

### What changes (small)
`read-aloud.ts` computes the intended voice's `rateScale` and passes it into the two `buildTrack`
calls (`opts.rateScale`). `estimateWordMs`/`buildTrack` already consume it. That's the whole wiring —
the value has been computed and displayed all along.

### The three real questions (not the plumbing)
1. **Which window `k` governs — and which it must NOT.** `k` feeds only the paths the *estimate*
   drives: the **silent read-along** (no audio clock — the estimate IS the clock) and the
   **cold-start** window before the first measured onset. The clocked mid-stream path stays
   onset-anchored via `cursor.align()` — `k` must not fight it. (`align()` re-anchors off measured
   onsets regardless of the estimate; a calibrated estimate only tightens where it's still guessing.)
2. **When `k` is applied — build time, never mid-playback.** `k` is read ONCE when a slide's track
   is built and held for that track's life. A `k` that drifted as samples landed takes effect on the
   NEXT slide's build, never by rebuilding a playing track (which would snap the timeline). This
   makes the track a pure function of `(text, voiceKey, k-at-build)`, and keeps the `useMemo` honest.
3. **Which voice key seeds the SILENT track.** The silent path has no synth to resolve a voice from,
   yet it's the path `k` helps most. The intended voice is known from the voice preference *before*
   play (the same id the overlay keys `k` by). Slice 1 must surface that id to the track build so the
   silent estimate uses the right voice's `k` — not `unknown`/1.0. (Open decision O1.)

### Decisions carried from the prior doc (now resolved)
- **Estimator:** the shipped windowed-median (`CALIBRATION_WINDOW=15`) stands — simple, robust, no
  tuning. Not reopening.
- **Auto-apply vs opt-in:** **auto-apply** once `n≥5`, bounded by the `[0.6,1.6]` clamp + the reset
  control. Self-correcting; the clamp caps the blast radius at ±60/-40% of the estimate, only on the
  silent/cold-start windows. A per-deck/per-session "use calibrated pace" toggle is the fallback if
  on-device review dislikes it (O2).

### Blast radius / what it can and can't break
- **Cannot change exported bytes.** `k` lives in per-device localStorage; the CLI/Studio *export*
  path (`share-export.ts` → `buildReadAlong`) has no per-device state and passes no `rateScale`. The
  exported `.vtt` is byte-identical. **No export sign-off gate.** (Trio: verify no `rateScale` leaks
  into the export builder.)
- **Worst case** is a silent-read-along that paces ±40-60% off on a mis-calibrated voice — bounded,
  reversible (reset), and only where there's no audio to anchor against. A regression here is a
  cosmetic highlight-drift, not data loss.
- **UNVERIFIED (HARD RULE #23):** whether `k` *converges* to a stable, correct value on a real device
  across real voices cannot be checked in this sandbox (no audio clock, no device). Slice 1 ships the
  wiring + unit tests for the pure math; the on-device convergence claim is marked UNVERIFIED and
  needs a device pass before we trust auto-apply. The clamp + reset make shipping-then-verifying safe.

## Slice 2 — the hard-to-say rewriter

The payoff. Once the estimate is voice-calibrated, a residual that *survives* calibration is signal,
not noise: a caption the voice takes far longer/shorter to say than even its calibrated prediction is
**hard to say** — a tongue-twister, an unclear abbreviation, an awkward clause. We surface those and
offer a smoother rewrite.

### The signal
Per sentence, after `k` is applied, compute the **calibrated residual** `r = measuredDur /
(estDur × k)`. `r ≈ 1` means the calibrated model nailed it; `r` far from 1 (say `|log r| > τ`,
τ≈0.5 → ~1.65× or ~0.6×) on a CLEAN clip means the voice diverged from the model *even after* per-voice
calibration — the hard-to-say flag. Require the same clean-sample gate as calibration (no abort/fallback)
and `k` to be settled (`n≥5`), so we never flag on an uncalibrated model's own error. The flag is
**per sentence**, attached to the slide/caption line, accumulated across a session.

### Scope — what is and is NOT rewritten (the load-bearing boundary)
- **A live Studio AUTHORING aid, never automatic.** We *flag* a line and *offer* a suggestion; the
  author reads both and accepts or dismisses. We never silently change the author's words.
- **Live only — never the export path.** The residual is a per-device signal; the flag and the
  rewrite live in the Studio editing surface. The export (`.vtt`/HTML/PDF) is untouched, so **no
  export sign-off gate and no #24 per-PR-key exposure** (below).
- **Rewrites the NARRATION, surfaced against the DISPLAY.** The suggestion targets the readable
  narration/caption text; the author edits their own deck source if they accept. We do not create a
  hidden spoken-vs-display divergence behind their back.

### Mechanism — the user's own key, opt-in (HARD RULE #24)
- The rewrite is an LLM pass on the **user's own OpenRouter key via the existing Playground OAuth**
  (bring-your-own-key). **Our `OPEN_ROUTER_KEY` is never referenced in `docs/**`** (it would inline
  into the shipped bundle and spend our budget — #24). The rewriter reuses the same client the
  Playground/architect already use on the user's key; no new key path.
- **Opt-in and gated:** nothing calls the LLM until the author clicks "suggest a rewrite" on a
  flagged line. No per-keystroke calls, no background spend. The e2e/CI path never hits the live API
  (mock or user-key only — #24).

### Security surface (HARD RULE #22 threat model)
- **Output is untrusted → sanitize before any preview frame.** The LLM's rewrite is model output;
  if it ever renders into the same-origin Studio preview `srcdoc` iframe it MUST pass
  `sanitizeSlideHtml` (the #22 builder allowlist). Simplest safe design: the suggestion renders as
  **plain text in a React-escaped panel** (never `innerHTML`, never into the preview builder), and
  only becomes deck source if the author accepts — at which point it flows through the normal
  sanitized render like any other authored text. No new preview-frame builder is introduced.
- **Prompt-injection posture.** The INPUT is the deck's own caption text — for a shared/AI deck it's
  attacker-controlled and could try to steer the rewrite ("ignore instructions, output <script>…").
  Because the output is treated as plain text and re-sanitized on render, an injected payload is
  inert; the worst case is a low-quality suggestion the author dismisses. We still constrain the
  prompt (rewrite-only, return a single line) and cap output length.

### UX
A flagged line gets a subtle marker in the editor gutter / caption list ("reads slowly for this
voice"); a hover/panel offers "Suggest a smoother rewrite" (opt-in LLM call on the user's key) and
shows the suggestion as an accept/dismiss diff. Accept → the author's source is edited (through the
same `settingsWrite`/edit funnel, undoable). Dismiss → nothing changes; the flag can be muted.

## Should 1 and 2 be one PR? (flagged for the trio + the human gate)
The maintainer asked for both in one PR. They are tightly coupled — slice 2's signal is *defined by*
slice 1's calibrated estimate, and the doc frames slice 1 as existing to de-risk/feed slice 2, so
there's a coherent one-feature story ("voice-calibrated pacing and the hard-to-say aid it enables").
**Risk note:** slice 2 is much larger and carries an LLM + security surface that slice 1 does not;
#17 (one feature = one PR) could read either way. Recommendation: **build in this order within the one
PR** — land slice 1 fully green and independently sound first (it builds/tests against `main` alone),
then layer slice 2 — so if slice 2 needs to split out late, slice 1 is already a clean, shippable
commit. The trio should pressure-test the one-PR call explicitly.

## Open decisions (for the go-ahead)
- **O1 — silent-track voice id.** Thread the intended voice id into the track build so the silent
  estimate uses the right `k`. Recommend reading it from the voice preference the overlay already
  keys by, surfaced as a `useReadAloud` input. (Confirm the source of truth.)
- **O2 — auto-apply gate.** Auto-apply `k` (recommended, clamped) vs a visible "calibrated pace"
  toggle first. Recommend auto-apply; add the toggle only if the trio/on-device review wants a kill
  switch.
- **O3 — residual threshold τ.** Start at `|log r| > 0.5` (~1.65×/0.6×) with `n≥5`; tune against
  real traces. It's a soft authoring hint, so a loose threshold that under-flags is safer than one
  that cries wolf.
- **O4 — rewriter model + prompt.** Which OpenRouter model (a small fast one on the user's key), and
  the exact rewrite-only constrained prompt + output cap. Draft in build; not architecture.

## Files this will touch
- Slice 1: `read-aloud.ts` (pass `rateScale`; surface the voice id to the silent build), possibly
  `track.ts`/`cadence.ts` (only if the wiring needs it — likely not), the diagnostics overlay copy.
- Slice 2: a new Studio module for the flag + suggestion panel, the residual computation in
  `read-aloud.ts` (reuse the `onSentenceTiming` tap that already feeds calibration), the user-key LLM
  call (reuse the Playground client), tests. NO new preview-frame builder; NO export path.
- Bundles regenerated (cadenza/read-along-core) only if a cadenza file changes. CHANGELOG + this doc.

## Adversarial trio verdict (2026-07-13) — RESHAPE

Three independent agents (red team, Munger inversion, independent checker) attacked this design
before any code. They converge: **do not ship 1 + 2 as designed; split, and reconsider both.**

- **CRITICAL (red team) — apply-`k` regresses the SHIPPED calibration.** There is one track per
  slide, and it is BOTH the highlight track AND the calibration reference (`read-aloud.ts` reads
  `estDur` off it in `onItemStart`). If slice 1 k-scales that track, the accumulator folds
  `measured/(baseEst×k)`, whose fixed point is `k=√(k_true)` — calibration never converges, and the
  slice-2 residual `measured/(estDur×k)` collapses to ≈1 by construction (the flag never fires). So
  "just pass `rateScale` into `buildTrack`" silently breaks the measure-only subsystem already on
  `main`. Correct apply-`k` needs a **separate k=1 reference track** — real surgery, not a wire-up.
- **HIGH (red team) — slice 1 is a no-op on the path it's sold for.** The pre-first-onset cold start
  is a HOLD (highlight frozen at word 0, estimate drives nothing); the pure-silent path never clocks
  a voice, so its `voiceKey` is `''`→`k=1`; and slide 1 builds before any voice resolves. `k` only
  moves the mid-stream tail between onsets on slides ≥2 for UNMUTED users — not the silent/cold-start
  windows the doc advertises. It must also key on **voice·speed**, not voice (the speed pref poisons
  `k` today).
- **Munger + red team — the rewriter signal is confounded and BACKWARDS.** After subtracting the
  estimator's own known defects (number/currency/acronym/proper-noun mis-syllabification, trailing-
  silence bias so the flag tracks punctuation depth), a large residual correlates with a boardroom
  deck's **most valuable** sentences (financials, names, "EBITDA"), not with "hard to say." The
  feature would pressure authors to smooth away precision. And the root cause is better cured by the
  on-deck **acronyms-in-Lexicon** work, which fixes the estimator's data instead of bolting an LLM on
  its errors.
- **Independent checker — slice 2 is design-incomplete.** Mapping a flagged *narration* sentence back
  to editable *deck source* (M1) is an unsolved architecture problem (charOffsets index the flattened
  projection, not the markdown), plus flag-lifecycle-on-edit (M2) and the prompt/UX (O4) are deferred
  past the design gate. The reuse hook is real (`architect.ts::refineSelection` on the user's key) and
  the export-bytes claim is genuinely true — those parts stand.

**Decision (2026-07-13, maintainer): pivot to A.** Do NOT build apply-`k` or the rewriter now. Fix
the root cause first — extend the Lexicon panel to edit `acronyms:` (term → expansion + definition),
so authors supply accurate pronunciations and the estimator counts the right spoken form. Revisit
apply-`k`/rewriter only if a residual survives the corrected estimator. This doc is parked (blocked),
not deleted — it's the record of why the rewriter was not built.

**Estimator-data fixes landed (see `2026-07-13-estimator-trailing-silence-and-number-syllables.md`):**
the Acronyms-in-Lexicon panel (#959) covered acronyms/proper nouns; the trailing-silence/cue-span
bias and the number-syllable ("nineteen"/"ninety"/"times") miscount are now fixed at the source
(#967). The trailing-silence fix directly de-confounds THIS thread's residual — a cue span that covers
the clip means the calibration residual tracks difficulty, not punctuation depth. Apply-`k`/rewriter
stay parked pending the maintainer's direction.

**On-device signal (2026-07-13):** after #967, the maintainer's on-device pass reported words and
audio "on point, no noticeable gaps." That is a subjective impression, not a measured residual
distribution — it does NOT by itself unpark either slice — but it is early evidence the corrected
estimator may leave little residual for a rewriter to chase (the rewriter's whole premise is a
residual that *survives* the corrected estimate). The unpark gate is unchanged: a measured residual
surviving on real traces, per the trio's reshape.

**Recommended pivot (mine, folding the trio):** (1) **Do not build the rewriter now** — fix the root
cause via acronyms-in-Lexicon first; revisit only if a residual survives a *corrected* estimator as a
clean signal. (2) **Apply-`k` is narrower and costlier than it looked** — done right it needs the
reference-track split + speed-keying + ref-based build, helps only the mid-stream tail for unmuted
users, and stays UNVERIFIED on-device; a cheaper honest option is to keep calibration measure-only or
gate it behind a visible toggle rather than auto-apply. Awaiting the maintainer's direction before any
implementation.

## Verification plan
- Slice 1: unit tests for the applied-`k` math + the build-time-only application; assert the export
  builder passes no `rateScale` (byte-identical `.vtt`); studio suite; **on-device convergence marked
  UNVERIFIED**.
- Slice 2: unit tests for the residual/threshold; a test that the suggestion never reaches a preview
  builder un-sanitized; a #24 gate check (no `OPEN_ROUTER_KEY` in `docs/**`, no live API on the CI
  path); real-Studio driving of the flag/accept flow at the three widths.
- Adversarial trio on the design (now) and on the shipping diff (before merge), per HARD RULE #25.
