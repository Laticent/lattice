---
status: shipped
summary: Two concrete defects in the shipped (non-AI) read-aloud/Cadenza pipeline, fixed without touching the gated self-delivering-presentation bet. (1) Narration doesn't sound human for structured content — slideToSpeech flattens list items/headings with no terminator, so Cadenza's existing punctuation-driven pause table (cadence.ts) never fires between clauses, and chart-family components' most important number (the funnel's stage-to-stage conversion %) is COMPUTED at render time and never reaches the raw markdown slideToSpeech reads, so it's never spoken at all. (2) The word-highlight visibly races ahead on Cadenza's text estimate, then snaps back to word 0 once a clocked voice's real onset lands — read-aloud.ts started its RAF loop synchronously in play(), before knowing whether a clocked voice would attach. Three fixes, one PR: punctuation at structural boundaries in slideToSpeech; a funnel-only chart-narration pilot that speaks the computed conversion rate; deferring the RAF loop's first tick until the mode (audio vs. estimate) is actually known. All three are deterministic, non-AI, and orthogonal to the blocked self-delivering-presentation bet — they harden the engine that bet already depends on. §7 (follow-up) rolls the pilot out to journey/radar/quadrant/state-chart — the only other chart-family members with a real computed-but-unauthored narration gap, found by reading every remaining transform rather than assumed; the other eight members already author their meaningful numbers directly and get no narrator. §8 (follow-up) spikes SSML/prosody support in the TTS stack: neither rung (OpenRouter's hosted Kokoro-82M nor the in-browser one) supports it — punctuation density (§3.1) is the only real pacing lever available today. §10 is a requested adversarial-trio pass (red team + Munger inversion + independent checker) on the §7 rollout before merge: it found and fixed a critical depth-blind nested-bullet parsing bug (a documented per-item "detail" reveal sublist was misparsed as phantom data, corrupting spoken scales) and a critical silent-content-loss regression (three narrators were dropping real authored text their own grammar didn't model, worse than not narrating at all), plus three medium fixes (journey label truncation, a rejected-but-legal volume token, an unconditionally-stripped eyebrow suffix) and one ordering fix.
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
  own. §8 spikes whether the current stack accepts any real markup; short answer: no, and the punctuation
  fix in §3.1 is already the correct lever for the one model both rungs actually use.
- **Not a chart-family-wide narration schema.** See §3.2 and §7 — narrators are added one at a time, only
  where a real computed-but-unauthored gap exists, never speculatively across the whole family.

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

## 7. Chart-narration rollout — journey, radar, quadrant, state-chart

Follow-up to §3.2, logged there as "separate, scoped work once the funnel shape is validated." Before writing
any code, every other chart-family member's transform was read to find which ones — like funnel — compute a
narration-worthy value the raw Markdown never states. The honest result is narrower than "cover the whole
family": **most components already put their meaningful numbers in authored text**, so `slideToSpeech` (with
§3.1's punctuation fix) already narrates them correctly. Four had a real, computed-but-unauthored gap; eight
didn't and got no narrator.

**Added** (`chart-narration.ts`):

- **`narrateJourneyWeighted`** — the `weighted` variant's per-task share of the slide's total volume
  (`journey.transform.js`'s `volPct = round(vol/totalVolume*100)`, `totalVolume` summed across every task on
  the slide) is burned into a CSS custom property for chip width, never spoken. The other four journey
  variants parse the `+N` volume token but never render it (the manifest's own antiPatterns says so) — the
  narrator gates on both the `journey` AND `weighted` class tokens for exactly that reason.
- **`narrateRadar`** / **`narrateQuadrant`** — when a slide's eyebrow doesn't declare an axis scale/range,
  `radar.transform.js` / `quadrant.transform.js` auto-fit one from the data (`niceCeil`, ported here as a
  local copy — same cross-boundary constraint as `voice-model.js`'s `splitSentences`) and burn the computed
  ring-tick / axis numbers into SVG text. An eyes-free listener has no other way to learn whether "Performance
  9" is out of 10 or out of 100 — so these narrators speak the resolved scale (per axis, independently, for
  quadrant) ONLY when it isn't already stated in the eyebrow `slideToSpeech` would otherwise read verbatim.
- **`narrateStateChart`** (composes with `slideToSpeech`, not a full replacement like the others) —
  `state-chart.transform.js` infers a start state (the first authored state, when none is tagged `` `start` ``)
  and terminal states (any state with zero outgoing transitions, when none is tagged `` `end` ``). These are
  real facts about the machine's shape that go unspoken only when the author didn't already say them, so the
  narrator prefixes just the inferred sentence(s) and lets `slideToSpeech` read the rest of the (already
  reasonable) numbered-list-plus-transitions prose. Returns null — falling through to plain `slideToSpeech` —
  the moment every state's role is already explicit.

**Evaluated, no narrator added** (their meaningful numbers are already authored text, or their computed
values are rendering geometry with no narratable semantic content):

| Component | Why no narrator |
|---|---|
| `piechart` | The `%` is typed by the author (`` - Marketing `40%` ``) — nothing is derived from a count. |
| `progress` | Same — the `%` pill is authored directly, not computed from a fill fraction. |
| `roadmap` | Every rendered string (state label, phase header, deliverable) is copied verbatim from the authored cell/marker; nothing is computed. |
| `gantt` | Computes a bar's timeline position/width as a %, but that's SVG geometry (`chart-family.js`'s `pct(v)`), never narratable text. |
| `timeline-list` | Pure re-formatting (date pill + title + status pill) of literal authored text; no arithmetic. |
| `map` | Computes a choropleth color-mix % (`rampMix`) — a display color-space value, not a semantic fact like a conversion rate. |
| `word-cloud` | Computes a normalized 1–5 weight + rank for sizing, neither of which means anything spoken aloud without the visual ("rank 3, weight 2.4" conveys nothing on its own). |
| `kanban` | The one inference (a "done" column dims via a fixed name vocabulary) is presentational styling, not narration content. |

## 8. SSML/prosody spike — findings

Neither TTS rung in `voice-model.js` supports real SSML/break markup:

- **OpenRouter's `/api/v1/audio/speech`** documents only `model`, `input`, `voice`, `response_format`,
  `speed`, and provider overrides — no break/emphasis tags, even for a backing provider (Azure) whose own API
  *does* support SSML internally; OpenRouter's route doesn't expose it.
- **The OpenAI TTS spec it mirrors** is the same — `speed` is the only pacing lever the base spec offers
  (`gpt-4o-mini-tts`'s natural-language `instructions` field is prompt-steering, not markup, and isn't a
  parameter either rung forwards).
- **Kokoro-82M itself** (both the OpenRouter-hosted and in-browser rungs use the same model) has no SSML
  support — it's an open, unimplemented feature request upstream (`github.com/hexgrad/kokoro/issues/36`,
  filed Feb 2025; a popular community wrapper confirms the same gap). Its G2P pipeline (`misaki`) supports
  exactly one markup form: inline IPA phoneme override for pronunciation correction (`[Kokoro](/kˈOkəɹO/)`),
  not pacing or emphasis.
- **What IS controllable:** `speed` (a flat multiplier, forwarded natively by both rungs) — and punctuation
  density. Per Kokoro's own HF discussion threads, richer/chained punctuation (`.`, `,`, `;`, `—`, `…`,
  chained without spaces for a longer pause) measurably changes pacing; this is a documented community
  folk-technique, not a spec, and it's exactly the lever §3.1's punctuation fix already pulls. There is no
  emotional/prosodic steering beyond that — Kokoro's training data has little emotional range.
- **A real, buildable follow-up this surfaced (not attempted here):** true fixed-duration pauses are
  achievable today without any model-level markup, by splicing programmatically-generated silence between
  the already-per-sentence-synthesized audio clips `voice-model.js` produces (`speak()` already synthesizes
  and plays one sentence at a time). That's a real feature, not a spike — logged here as a separate,
  scoped follow-up, not started.

**Conclusion:** there is no SSML lever to pull in this stack today. The punctuation fix (§3.1) was already
the correct, and only, available lever for pacing; no further TTS-layer work is justified by this spike.

## 9. Maker-checker review — the rollout (§7)

A second independent checker pass (same HARD RULE #25 discipline as §6, re-run because §7 is new production
code with its own blast radius) bug-hunted the four new narrators against their real transform sources
before this landed. Six findings, all fixed with regression tests in the same change:

- **HIGH — `narrateQuadrant` garbled the label and used the wrong coordinate on the shipping `trail`
  variant.** `` - Label `5, 60` `3, 78` `` (before → after) has TWO trailing pills; the original single
  anchored regex swallowed the first pill into the label and read only the second as "the" position — no
  test exercised `trail` at all, so this shipped silently. Fixed by reusing `stripTrailingPills` (already
  written for state-chart) to collect every pill, speaking the LAST one as the item's position and folding
  every pill's coordinates into the axis-scale computation (so the auto-fit range reflects the trail's full
  extent). Narrating the "moved from" position itself is a deliberate, logged narrowing — the bug was the
  garbled label and dropped data, not "trail motion isn't spoken."
- **MEDIUM-HIGH — `narrateQuadrant` silently understated the axis range for negative-extreme data.** The
  narrator assumed `min: 0` always; `quadrant.transform.js`'s real `resolveScale` allows a negative min
  (`xMin < 0 ? xMin : 0`) and mirrors it into the max. Fixed with `resolveAxisScale`, a direct per-axis port
  of that logic (radar's own real scale, unlike quadrant's, always fixes min at 0 — so radar's narrator was
  already correct and needed no change here).
- **MEDIUM — the shared eyebrow-range regex was unanchored, matching quadrant's real (anchored) `pullRange`
  incorrectly.** Radar's real `parseScale` is *also* unanchored (so the shared function was correct for
  radar), but quadrant's real `pullRange` anchors to end-of-string specifically so an axis NAME containing an
  earlier number-hyphen-number pattern isn't mistaken for the trailing range. Fixed with a quadrant-specific
  `pullQuadrantRange` (anchored, no lone-max fallback — quadrant's real function has neither), leaving
  radar's `parseScaleRange` unanchored to match its own source.
- **MEDIUM — `narrateStateChartInference` let an out-of-range transition target (a plausible typo, e.g.
  `` `submit => 9` `` on a 3-state chart) suppress terminal inference.** `state-chart.transform.js` marks an
  unresolvable target "(unresolved)" and does NOT count it as outgoing; the narrator's original single-pass
  parse counted any `event => N` syntactically, regardless of whether `N` was a real state. Fixed with a
  two-pass parse (states first, so the total count is known; transitions validated against it second).
- **LOW-MEDIUM — an inferred state's unrelated trailing annotation (e.g. `` `port 8080` ``) was silently
  dropped from its spoken label**, where the real transform re-appends an "unknown" pill (anything that
  isn't `start`/`end`/a status keyword) into the rendered label rather than discarding it. Fixed by porting
  the same three-way pill classification (`parseStateLead`), including the `STATUS_KEYWORDS` set so a status
  pill is correctly excluded from the label (a separate badge in the real UI) while a genuinely unknown one
  is kept.
- **LOW, evaluated and NOT changed — an unterminated fence blanks the rest of the slide.** The checker flagged
  this as worth a look; on inspection it's already the conservative, correct behavior (matches
  `slideToSpeech`'s own fence handling) — the alternative (treating the rest of the slide as fence-free once
  the toggle looks unreliable) would let genuine fenced EXAMPLE content be parsed as real data, which is
  worse than under-narrating. Left as-is; documented in `withoutFences`'s comment rather than "fixed."

Also folded in during this pass: the `radar`↔`quadrant` variant-name collision the checker's item #7 flagged
(radar's own `quadrant` variant carries the literal token `quadrant`, and vice versa isn't possible since
`quadrant` the component never carries a `radar` token) — both narrators now explicitly bail on the other's
token rather than relying on their data shapes happening not to match.

## 10. Adversarial trio — red team, Munger inversion, independent checker (§7/§9 hardening)

Requested explicitly ("i need this red teamed, inversion and independent checker on it too") before PR #862
merged — HARD RULE #25's top tier, for critical/high-blast-radius/novel work, applied here because §9's
maker-checker pass had already found a HIGH-severity data-corruption bug in shipping code once; a rollout
across four narrators parsing real component grammars warranted the deeper pass before merge. All three
lenses converged on the same root cause from different angles, plus each surfaced findings the others didn't.

**CRITICAL, convergent finding (red team + independent checker) — depth-blind nested-bullet parsing.**
`parseRadarSeries`, `parseQuadrantGroups`, and `parseJourneySections` all treated ANY indented line matching
their data-line regex as a data point, regardless of how deeply nested. But `radar.manifest.json` and
`quadrant.manifest.json` both document a real, shipping third nesting level — an optional per-axis/per-item
"detail" reveal sublist, built on the shared `mark-detail.js` chart-family substrate — and journey's transform
defensively tolerates one too. A detail line that itself ends in a number (a plausible reference date,
confidence range, or secondary metric an author would genuinely write) was silently ingested as a phantom
axis/item/task, corrupting BOTH the spoken data list and the auto-fit scale with a confidently WRONG number —
worse than saying nothing, because it sounds authoritative. Red team's proof-of-concept: a detail line
`` - Verified in cycle `2024` `` under a radar axis valued `9` pushed the spoken scale from "zero to ten" to
"zero to two thousand five hundred." Fixed identically across all three parsers: track the FIRST nested
line's indentation per top-level bullet as that bullet's true data level (`leadingSpaces`); anything deeper
is left unconsumed rather than ingested. Regression tests lock in one case per parser (radar/quadrant/journey)
confirming the scale/total stays correct and the detail line is not treated as data.

**CRITICAL, Munger-inversion finding ("how would we make this actively worse than doing nothing?") — silent
content loss.** Inverting the goal — a narrator should never say LESS than `slideToSpeech` would have,
only add computed facts on top — exposed that `narrateFunnel`/`narrateRadar`/`narrateQuadrant` were doing
exactly that: any line their own grammar didn't model (a detail sublist, an intro paragraph between the
heading and the data) was neither spoken nor an error — just gone. `funnel.gallery.md`'s own default sample
authors a detail sublist under a stage; a listener would have heard it before this narrator existed, and
silently lost it after. That is a real regression a rollout praised for "adding facts" had actually shipped.
Fixed with `speakLeftover`: each parser now returns the exact set of line indices it consumed, and every
full-replacement narrator flattens everything NOT in that set (minus blanks/directive/heading) through the
existing `slideToSpeech` pipeline and appends it. Ordering trade-off, called out explicitly rather than
hidden: leftover content is appended after the computed facts, not interleaved at its authored position —
true interleaving would mean reconstructing document order across every narrator, a much larger change for a
smaller listening benefit than guaranteeing nothing is silently dropped. Seven new regression tests cover
this directly (a detail line spoken-but-not-counted, for funnel/radar/quadrant/journey; a quadrant intro
paragraph spoken).

**MEDIUM, red-team + independent-checker finding — journey label truncation.** `parseJourneySections` built a
task's label as "everything before the first backtick token," so a task authoring a qualifying phrase AFTER
its tokens (`` - Escalate `@support` `:2` to tier two `+40` ``) silently lost that phrase — a real authoring
pattern the manifest's own grammar permits. Fixed by stripping every backtick token from the line and keeping
the rest, matching how `journey.transform.js` strips `<code>` spans without disturbing surrounding text.

**MEDIUM, red-team finding — journey volume regex rejected `parseFloat`-legal input.** The `+N` volume token
regex required a leading digit before any decimal point, so an author writing `` `+.5` `` (legal input to the
real transform's `parseFloat(tok.slice(1))`) silently fell back to the default volume of 1, understating that
task's share. Fixed the regex to accept a bare leading decimal point.

**MEDIUM, independent-checker finding — quadrant eyebrow "targets" strip was unconditional.**
`splitQuadrantEyebrow`'s strip of a trailing `` `· targets tx, ty` `` phrase ran regardless of whether that
phrase actually parsed as a coordinate pair. An unparseable one (a typo, a placeholder like "targets tbd")
was stripped anyway, handing the axis-range parser a clean-looking eyebrow the real render can't resolve
either — a false "we know the range" where production itself falls back to auto-fit. Fixed by gating the
strip on `hasParseableTargets` (a port of `quadrant.transform.js`'s own `parseTargets`), so an unparseable
targets phrase stays embedded and correctly breaks the same trailing-anchor parse production's own eyebrow
reading would fail on too.

**LOW, Munger-inversion finding — state-chart heading order was inconsistent.** Every other narrator here
speaks the heading first; `narrateStateChart` spoke the inferred start/end facts first and the heading last
(`` `${inferred} ${rest}` ``, heading folded into `rest`). Inverting "what would make this feel amateurish
specifically because it's inconsistent" flagged that an eyes-free listener who's learned "the reader always
opens with the slide title" hits a different order only on state-chart slides. Fixed by computing the
heading explicitly, stripping it from the `slideToSpeech` pass (so it isn't spoken twice), and joining
`[heading, inferred, rest]` in that order — now matching every other narrator.

**Logged, not fixed (HARD RULE #18 discipline — off-path / lower-priority, not silently pulled into this
diff):**

- **`niceCeil`'s drift risk (Munger inversion).** This module keeps a hand-copied `niceCeil` identical to
  `radar.transform.js`/`quadrant.transform.js`'s own — a deliberate cross-boundary constraint (this module is
  docs-side ESM/TS; those are root `lib/` CJS), documented in the function's own comment, and pinned by
  hand-verified test cases rather than a byte-diff. A future change to either source `niceCeil` would silently
  desync from this copy with no test catching the drift until a spoken scale disagrees with the rendered one.
  No shared-fixture mechanism crosses the CJS/ESM line elsewhere in this codebase either, so building one is a
  bigger, separate piece of infrastructure work, not a one-line fix here.
- **Radar's `target`/`delta`/`benchmark`-style variant nuances (red team).** Red team noted that radar (per
  its manifest) supports variants beyond the plain/`quadrant` split this narrator's bail-guard already
  handles, and didn't exhaustively verify every one narrates sensibly — only that the two variants with
  narrator-relevant structural differences (plain, `quadrant`) are covered. A narrower, scoped audit of the
  remaining variants is a reasonable follow-up, not a blocker: none of them change the two/three-level nesting
  shape this parser depends on, so the worst case is a missed opportunity to speak a fact, not corrupted data.
