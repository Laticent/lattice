---
status: shipped
summary: Two concrete defects in the shipped (non-AI) read-aloud/Cadenza pipeline, fixed without touching the gated self-delivering-presentation bet. (1) Narration doesn't sound human for structured content — slideToSpeech flattens list items/headings with no terminator, so Cadenza's existing punctuation-driven pause table (cadence.ts) never fires between clauses, and chart-family components' most important number (the funnel's stage-to-stage conversion %) is COMPUTED at render time and never reaches the raw markdown slideToSpeech reads, so it's never spoken at all. (2) The word-highlight visibly races ahead on Cadenza's text estimate, then snaps back to word 0 once a clocked voice's real onset lands — read-aloud.ts started its RAF loop synchronously in play(), before knowing whether a clocked voice would attach. Three fixes, one PR: punctuation at structural boundaries in slideToSpeech; a funnel-only chart-narration pilot that speaks the computed conversion rate; deferring the RAF loop's first tick until the mode (audio vs. estimate) is actually known. All three are deterministic, non-AI, and orthogonal to the blocked self-delivering-presentation bet — they harden the engine that bet already depends on.
companion:
  - ./2026-07-07-cadenza-caption-timeline.md
  - ./2026-07-07-self-delivering-presentation.md
---

# Cadenza narration quality — punctuation, chart facts, and the highlight race (2026-07-09)

> **What this is.** Two user-reported defects in the Studio's read-aloud (Present overlay), both diagnosed to
> a specific line range, both fixed with a small, deterministic change — no AI, no new dependency, no change
> to the gated `2026-07-07-self-delivering-presentation.md` bet. This doc is the design record; the fixes
> ship in the same PR.

## 1. Problem 1 — narration doesn't sound human for numbers/figures/charts

Two independent gaps, not one:

**Gap A — no punctuation at structural boundaries.** `slideToSpeech()` (`docs/src/components/studio/
read-aloud.ts:30-60`) flattens a slide's Markdown into prose by joining lines with a single space; it never
inserts a terminator after a heading or a list item. Cadenza's cadence engine already has a pause table keyed
on trailing punctuation (`docs/src/lib/cadenza/cadence.ts:19-22` — comma 160ms, period 360ms, etc.) — fully
wired, but it never fires between bullets because there is no comma/period between them to trigger on. A
three-bullet slide reads as one run-on sentence with no breath. The mechanism already exists; the input just
never uses it.

**Gap B — chart data isn't structured facts, so it can't be narrated.** Per `2026-07-04-accessible-
descriptions.md` and the (blocked) `2026-07-07-self-delivering-presentation.md` §6, a chart's real insight is
often *computed at render time* and lives only in the transform, never in the markdown a narrator reads. The
clearest case: `lib/components/chart/funnel/funnel.transform.js:120-125` computes each stage's conversion
rate (`pct = Math.round((next / prev) * 100)`) and burns it straight into SVG text — that number does not
exist anywhere in the slide's raw Markdown. Studio's read-aloud pipeline (`PresentOverlay.tsx:91-92`) only
ever sees the raw slide Markdown (`cur`), never rendered HTML, so no amount of improving `slideToSpeech`'s
text-flattening can surface a number that was never authored. The funnel's single most important fact — the
drop-off — is silently absent from every read-aloud today.

## 2. Problem 2 — the highlight races ahead, then snaps back

`read-aloud.ts`'s `play()` started its `requestAnimationFrame` loop **synchronously**, in `'silent'`
(text-estimate) mode, the instant Play was tapped (`:266` region, previously right after `setPlaying(true)`)
— before the async voice model (`getVoice()`) had resolved and before it was known whether a clocked voice
(OpenRouter/Kokoro) would attach. If one does, `getVoice().then(...)` flips `modeRef` to `'audio'` and hard-
resets `elapsedRef`/the reader to 0 (`:328-330` region) — discarding whatever the estimate had already
advanced. In the common case (a warmed voice model, `getVoice()` already resolved) this window is a
microtask and invisible; on the first `play()` of a session — the voice model's dynamic import + WASM/worker
setup genuinely takes real wall-clock time — the estimate visibly advances the highlight for some real
number of animation frames, then the mode-flip visibly rewinds the cursor back to word 0. This is the exact
"races ahead, then gets anchored" the user described, and it reads as broken because the product is, for
that window, showing a highlight position it is about to disown.

The existing unit test (`read-aloud.test.ts` — "holds at word 0 before the first onset") doesn't catch this:
it flushes the `getVoice()` microtask with `await Promise.resolve()` *before* advancing any fake-timer clock,
which happens to hide exactly the window this doc is about. The bug is real in production, invisible in the
test's synthetic timing.

## 3. Fixes

### 3.1 Punctuation at structural boundaries (`slideToSpeech`)

Classify each collected line as *structural* (heading `#{1,6}\s`, list item `[-*+]\s` / `\d+\.\s`,
blockquote `>\s?`) or *plain* prose. A structural line that doesn't already end in terminal punctuation
(`.!?;:,…`) gets a period appended before the markdown-syntax strip pass runs — so "`- Stage \`600\``"
becomes "`- Stage \`600\`.`", which strips down to "Stage 600." A plain paragraph line (a soft-wrapped
continuation) is left untouched — its author's own punctuation governs, so this never invents a false
sentence break mid-thought. This is a pure, input-side fix: no change to Cadenza's timing model, no new
dependency — it just gives the pause table in `cadence.ts` real terminators to key on.

### 3.2 Funnel chart-narration pilot (`chart-narration.ts`)

A small, deliberately narrow module (`docs/src/components/studio/chart-narration.ts`) that recognizes a
`<!-- _class: funnel -->` slide, re-derives the same stage/value parse `funnel.transform.js` does — directly
off the Markdown list syntax (`- Label \`value\``) `slideToSpeech` already understands, at the top level only
(an indented line is a stage's optional detail sublist, not itself a stage) — and speaks each stage's value
**and** the stage-to-stage conversion rate, using Cadenza's own `numberToWords`/`toSpokenText` (reuse, not a
second number-to-words implementation — HARD RULE #15). Wired into `PresentOverlay`'s narration priority as
`getNote(cur) || narrateChart(cur) || slideToSpeech(cur)` — a hand-authored speaker note still wins; chart
narration only fills the gap `slideToSpeech` structurally cannot.

**This is a pilot, not a generic engine.** It is intentionally narrow — one component, one hand-written
parser — rather than a manifest-schema-driven system covering all ~15 chart-family members. A schema-level
`spokenTemplate` field (the shape floated when this work was scoped) would be speculative generality for a
pattern proven exactly once; the registry shape (`NARRATORS: Array<(markdown) => string | null>` in
`chart-narration.ts`) is deliberately built to make the *second* and *third* component cheap to add once the
funnel pilot validates the phrasing reads naturally in practice. **Follow-up, logged, not silently expanded
into this PR (HARD RULE #18):** `progress`, `piechart`, `roadmap`, `radar`, and the rest of the chart family
each compute their own render-time derived numbers and are equally silent today; extending the pilot to them
is separate, scoped work once the funnel shape is validated against real narration.

### 3.3 Arm-before-play (defer the first tick until the mode is known)

`play()` no longer calls `startLoop()` synchronously. It is called exactly once, inside `getVoice().then()`,
after the rung (and therefore the mode — `'audio'` vs `'silent'`) is actually decided — including the
failure path (voice model failed to load), which explicitly falls back to `startLoop()` in estimate mode.
That guard is necessary *because of this refactor*, not a pre-existing bug being fixed: the old code called
`startLoop()` unconditionally before checking the voice, so a failed load was harmless by accident; moving
the call inside `.then()` means a bare `if (!voice) return` would newly hang the read-along (`playing: true`,
nothing ever animating) — so the fallback ships in the same change, not as an afterthought. The result: the RAF loop's
*first frame* already runs in the correct mode, so there is nothing to rewind. The existing "hold at word 0
until the real onset lands" behavior (`tick()`, `cadence` frozen at 0 while `audioBaseRef` is still null) is
unchanged and still correct — that gap was never the bug; the bug was the earlier window where the loop was
running at all before the mode was known. No new UI state (no spinner/"arming" indicator) — the existing
"nothing highlighted yet" look during that (typically sub-frame) gap already reads as an intentional
about-to-start moment, not a glitch; adding one would be scope beyond what the defect requires.

## 4. What this is not

- **Not a step in the gated self-delivering-presentation bet.** That bet (blocked, per its own doc) drafts
  the *narrative* (throughline, so-what, framing) with a model, human-confirmed. Nothing here drafts
  anything — every fix is a deterministic transform of text/data that already exists on the slide or is
  already computed by a transform. No AI kernel touched.
- **Not SSML/prosody at the TTS layer.** `cadence.ts`'s pause table only ever drove the *caption highlight*
  estimate, never the actual voice audio's pacing — within a sentence, prosody is entirely the TTS model's
  own. Whether the current model (`hexgrad/kokoro-82m` via OpenRouter) accepts break/emphasis markup is an
  open question, flagged here as a follow-up spike, not committed to in this pass.
- **Not a chart-family-wide narration schema.** See §3.2 — the funnel pilot is deliberately narrow.

## 5. Verification

Unit-testable: `slideToSpeech` punctuation cases, `chart-narration.ts`'s stage/conversion-rate parse, and the
reader's arm-before-play sequencing (extends the existing fake-timer harness in `read-aloud.test.ts`).
Real-surface (HARD RULE #23): the Studio's Present overlay, built and driven directly — the funnel's
teleprompter caption is checked to actually show the conversion-rate phrasing (the *display* words render on
screen regardless of whether real TTS audio is available in this sandbox). Real audio pacing/naturalness
from an actual OpenRouter/Kokoro voice is out of reach in this environment and is marked **UNVERIFIED**
rather than claimed.

## 6. Maker-checker review

An independent checker (HARD RULE #25 — real blast radius: the production Studio read-aloud engine)
bug-hunted the diff before merge and found two real defects, both fixed in the same change:

- **The funnel-class check missed every base-modified funnel** (`funnel dark`, `funnel compact`, `funnel
  accent` — real, shipping combinations in `funnel.gallery.md`). The original `<!--\s*_class:\s*funnel\s*-->`
  regex required nothing but whitespace between `funnel` and the closing `-->`, so 3 of the 4 slides in the
  funnel's own gallery silently fell through to plain `slideToSpeech` — defeating Gap B (§1) for the common
  case, not an edge case. Fixed with an explicit token check (`hasClassToken`, splitting the directive's
  value on whitespace) rather than a regex — a first regex fix using `\bfunnel\b` was ALSO wrong (a `\b` word
  boundary sits on either side of a hyphen too, so it still matched a hypothetical `funnel-detail` class);
  the token-membership check is correct by construction. The class check, the heading parse, and the stage
  parse were also unified onto one `withoutFences()` pass (previously only the stage parse was fence-aware),
  and stage-label cleanup gained link-label stripping (`[label](url)` → `label`), closing three related
  correctness gaps the same review surfaced.
- **Pausing during the arming window and resuming before the voice resolved reproduced the exact
  race-then-rewind bug §3.3 exists to fix, reached through pause/resume instead of a cold `play()`.** The
  resume branch assumed "paused implies already armed" — true for a pause after arming, false for a pause
  DURING it (the voice load genuinely takes real wall-clock time, per §2) — so it restarted the loop
  immediately in the stale default mode, and the still-pending `getVoice().then()` callback landed later and
  reset it out from under the resumed loop. Fixed with an explicit `armedRef`: the loop starts, exactly once,
  whichever of resume() or the arming callback observes both "mode decided" and "not paused" second — see the
  comments at each `startLoop()` call site in `read-aloud.ts`.

Both fixes shipped with regression tests (`chart-narration.test.ts`'s modifier/fence/link cases;
`read-aloud.test.ts`'s pause/resume-during-arming case) before this doc's `status` moved to `shipped`.
