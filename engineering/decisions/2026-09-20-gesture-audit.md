---
status: in-progress
summary: >
  The Guide points at slides by searching the live DOM for the sentence it hears. Narration
  GENERATES that sentence — composing it across elements and spelling numbers as words — so for
  a large class of slides there is no element that holds it, and the cue hides. Measured on the
  whole corpus with per-component attribution added for this pass: 88.9% of 10,551 cues resolve,
  and the 11.1% that do not are not spread evenly. `funnel` resolves 15.8%, `matrix-grid` 30.4%,
  `journey` 52.2%, `diagram` 61.0% — and `diagram` alone accounts for 333 dark cues. Eighteen of
  the 70 components never once get a HANDLE: every cue they resolve lands on the element's own
  words, so round three's whole "name the handle, not the container" model never fires. The
  cause is one seam, not many: `chart-narration.js` and `prose-projection.mjs` compose speech,
  `present-guide.ts` matches display text, and the two have no contract. Component manifests
  carry 220 slot selectors and a per-component importance order that nothing in the gesture path
  reads. The visual defects reported from the field are NOT a model issue: no model chooses a
  cue's text, its target or its gesture, and the one model nearby (TTS) can only change WHEN a
  gesture fires.
companion:
  - ./2026-08-05-guide-gesture-semantics.md
  - ./2026-08-05-guide-gesture-vocabulary.md
  - ./2026-07-05-vetrina-walkthrough-library.md
  - ./2026-08-04-vetrina-cue-stale-rect.md
---

# The Guide audit: what a gesture cannot find, and why

**Date** 2026-09-20 · **Status** AUDIT — measured, with three fixes landed and one
architectural fork left to the maintainer.

The ask was an audit of gestures — whether every component can present itself well, whether
Vetrina is where it needs to be, whether component manifests feed the gesture system, and
what a reported visual defect was. §1 answers the defect report, because it is the shortest
answer and it reframes everything after it. §2 is the measurement. §3 is the mechanism. §4 is
the manifest question. §5 is Vetrina. §6 is what landed. §7 is the fork.

---

## 1. The reported defect is not a model issue, and most of it was already fixed

The report was: *container highlighting and underlining were off, highlight steps were
skipped.* The question attached to it was whether this is a model issue.

**No model chooses a cue's text, its target, or its gesture.** The text is produced by
`buildTrack` segmenting the deck's own projected prose; the target and the gesture are chosen
by measuring the live DOM (`guideCueIn`). An AI-authored *deck* is still narrated and pointed
at by the same deterministic code as a hand-written one.

The one model in the neighborhood is a **TTS** one: Present's read-aloud ladder can speak
through `openrouter-tts` / Kokoro, and the Guide's cadence is clocked off that audio. So a
model can affect *when* a gesture fires — a voice's real word timings replace a reading
estimate — but never *what* it points at or *which* stroke it draws. Neither reported symptom
is reachable from there.

The two halves of the report map onto two different, real mechanisms:

- **"Container highlighting and underlining were off"** is round two's defect, and
  `2026-08-05-guide-gesture-semantics.md` fixed it: the classifier named the *container* where
  a hand names a *handle*, so a card that already had a border got a second outline and a
  bullet's whole line got underlined. Round three added the handle step and the
  redundant-boundary rule, and `bracket` fell from 34.2% of gestures to 14.7% — that record
  gives the fall as 14.1% in its prose and 14.7% in its own table, and does not reconcile the
  two. Anyone who saw this before 2026-08-05 saw the defect; it is not on `main` now.
- **"Highlight steps were skipped"** is NOT fixed, is measurable, and is the subject of the
  rest of this note. When a cue resolves to nothing the Guide hides the cursor rather than
  pointing somewhere wrong — a deliberate and correct choice — so a skipped step is exactly
  what an unresolvable cue looks like from the audience. **1,175 of 10,551 cues do this.**

One live hypothesis was checked and **refuted**, and is recorded so nobody re-runs it: the
framed path (`guideCueFor`) passes the whole `Document` as its search root where the Stage path
scopes to `shownSection`, which would let a cue match text on a hidden slide. It cannot,
because `single-slide-render` narrows the preview iframe to one section before the pointer ever
looks. The asymmetry is safe.

---

## 2. The measurement, and the instrument that could not answer the question

`npm run sweep:guide` drives the shipping classifier over every committed deck in a real
Chromium. Today's corpus is **182 decks, 10,551 cues** — it was 126 decks and 5,879 cues when
round three measured it, so the older figures in that record are not comparable and should not
be read as a trend.

```
resolved to a target   9376 (88.9%)
gestures 7823 · rests 1553 (16.6% of resolved) · hides 1175
handle:  body 50.9% · phrase 34.6% · marker 7.3% · header 7.2%
```

**The sweep reported per DECK and never per COMPONENT**, so it structurally could not answer
"can each component present itself" — a deck mixes components, and one at 90% hides another at
0%. Per-component attribution was added for this pass (`05a481b`) and is measurement-neutral:
the same 9,376 / 1,175 before and after. What it shows:

| component | cues | resolved | handle mix |
|---|---|---|---|
| `funnel` | 101 | **15.8%** | body 100% |
| `matrix-grid` | 46 | **30.4%** | body 100% |
| `obligation-matrix` | 21 | 42.9% | body 89% · phrase 11% |
| `pricing` | 47 | 44.7% | body 71% · phrase 29% |
| `team-profile` | 62 | 46.8% | body 100% |
| `kpi` | 110 | 50.9% | body 66% · header 20% · phrase 14% |
| `journey` | 341 | 52.2% | body 95% · phrase 3% · header 2% |
| `verdict-grid` | 69 | 53.6% | phrase 57% · body 43% |
| `compare-table` | 205 | 57.6% | body 83% · phrase 17% |
| `diagram` | 854 | 61.0% | body 55% · phrase 45% |

Ranked by **dark cues** rather than rate — where the silence actually is — the order is
`diagram` 333, `journey` 163, `compare-table` 87, `funnel` 85, `kpi` 54.

Two things the table says that the corpus rate hides:

- **Eighteen of the 70 components never get a handle at all** — every cue they resolve lands
  on the element's own words. Nine carry enough cues to rank: `funnel`, `matrix-grid`,
  `team-profile`, `logo-wall`, `state-chart`, `progress`, `map`, `timeline-list`, `kanban`.
  The other nine (`stacked-bar`, `bar`, `bullet`, `heatmap`, `line`, `slope`, `wifi`,
  `contact`, `video`) sit under the 12-cue ranking floor and are counted, not ranked. Round
  three's entire model (name the marker, the header, the phrase) never fires for any of them,
  so they get the round-two behavior the semantics record was written to retire.
- **The corpus covers everything.** 0 of 70 components are never cued, so no row above is a
  sampling artifact.

For contrast, `policy-recommendation`, `redline`, `decision`, `cards-stack`, `gantt`, `cycle`
and `inventory` all resolve 100%, with a real handle mix. The system works well; it works well
on a specific shape of slide.

---

## 3. The mechanism: speech is COMPOSED, matching is VERBATIM

The first hypothesis — "chart labels live in SVG, and `BLOCK_SELECTOR` has no `text`/`tspan`"
— is true and is **not** the main cause. It was tested directly: of the 284 unmatchable cues in
the six worst components, **zero** are findable in SVG `<text>`/`<tspan>` and zero in `data-`
attributes, so widening the selector to SVG text would recover none of them. Two SVG components
corroborate it from the other side — `map` and `piechart` resolve 100% and 97%. What the misses
actually say, read off the corpus:

```
funnel         Visitors: twelve thousand.
team-profile   Ada Okafor, Executive Sponsor: Clears blockers above the program.
compare-table  Cost — Option A: Low; Option B: High; Option C: Low.
journey        Discover: Search, forty-five percent; Referral, eighteen percent.
kpi            faster to skim: 61%.
```

Every one is a sentence **built** rather than **read**. `lib/core/chart-narration.js` and
`lib/transformers/prose-projection.mjs` compose speech from a slide's data model: they join a
label to its value, a name to its role to its note, a table row to all of its cells — and they
spell numbers out (`numberToWords` for the funnel's percentages, `toSpokenText` for its
values; both render `12,000` as `twelve thousand`). The Guide then searches the DOM for that sentence verbatim.

So the funnel is not a hard case, it is an **impossible** one: the slide renders `12,000` and
the narration says `twelve thousand`. No matcher can join those, and the spanning fallback
cannot either, because neither part is findable. That is nearly all of `funnel`'s 15.8% —
of the 72 funnel cues a probe over the rendered corpus finds unmatchable, 69 carry a spelled
number or percent and 3 do not. (The probe's 72 and the sweep's 85 dark cues are two
instruments; the 85 is not decomposed here.)

`findSpanningTarget` exists for exactly the composed case and splits on `/[:;]\s+/`. It is why
`compare-table` and `journey` do as well as they do. It does not reach a join made with a comma
(`Ada Okafor, Executive Sponsor`), and 63.1% of the cues it does resolve are **partial
answers** — it gave up and handed back the element holding the longest part.

**This is one seam, not a pile of component bugs.** Two subsystems produce and consume the same
sentence and have no contract between them. `present-guide.ts:26-50` argues — correctly — that
the projection cannot hand over a per-sentence NODE: sentences do not exist until `buildTrack`
segments the string, threading identity would change a shared kernel contract for a
Studio-only feature, and the projection parses a *detached* copy whose nodes are not pointable
anyway. All three objections hold. None of them is an objection to a **string anchor**, which
survives all four string-only boundaries and survives whatever the runtime did to the DOM.

---

## 4. Manifests: the hints exist, and nothing reads them

**All 70 components declare a `slots` map — 220 slots, every one carrying a real CSS
selector** (`title → h2`, `cards → ul > li`, `options → ul > li`, `verdict → blockquote`).
**All 70 declare `adapt.priority`**, an explicit importance order over those slots — what leads
and what sheds first. Nothing that RENDERS reads it: the only consumers are two checkers
(`checkSolverIntentDeclared` and an adapt-contract test) plus republication into
`dist/docs/components.json`. 22 chart components declare
87 `kernel.marks[].class` entries naming the exact class their transform writes, and the funnel
additionally emits `data-label="Visitors" data-value="12,000"` on every band.

`present-guide.ts` imports two modules — `@/lib/vetrina` and `@/playground/frame-geom.js`. It
reads **no** manifest field, and does not know which component it is pointing at. Its handles
are rediscovered by heuristic: `markerBox` reverse-engineers a `::marker` from computed styles,
`headerRange` takes "everything before the first nested block", `BLOCK_SELECTOR` is one
hardcoded element list for all 70 components.

The refusal was deliberate — round three chose it, on the grounds that *"a `querySelector` per
component would be Guide learning the component catalog by heart."* That is a fair objection to
Guide holding the catalog. It is a weaker objection to Guide *reading* a generated one, and the
repo already does exactly that elsewhere: `tools/build-axis-dom-catalog.js` projects manifest
`density.domSelector` into `lib/runtime/axis-dom-catalog.generated.js`, which the runtime uses
to find a component's collection elements in the live DOM for the Fix-Me overlay. The pattern
is built, shipped and proven.

Worth separating from this: **manifests would not fix the funnel.** No selector helps when the
spoken number is not on the slide. Manifests are a fix for the *handle* failure (the nine
components at `body 100%`), not for the *match* failure.

---

## 5. Vetrina

The library is genuinely strong — the gesture alphabet is frozen behind a gate, cues track
their targets per frame, the take-over race is honest, and it dispatches no synthetic input
(verified: no `dispatchEvent` / `new MouseEvent` / `.click()` anywhere in `stage.ts` or
`runner.ts`). Its real-surface Playwright coverage is better than most of this repo.

What the audit found against it, in order:

1. **`useWalkthrough` latched `active: true` forever when `run()` threw.** Fixed here — see §6.
2. **The deictic four were unverified on any real surface.** `underline` / `wash` / `bracket` /
   `tap` had jsdom coverage only, against rectangles the test invented, checked with the same
   formula the implementation uses. They now paint on a real page — see §6.
3. **README claims that the code does not honor.** "Answer with a zero-area rect" to say *gone*
   is wrong (`liveRect` accepts a zero-AREA rect at a real position and only rejects an
   ALL-zero one, and the source comment says so). The accent "legibility floor" lifts nothing —
   `accent: 'white'` yields a white cursor with a white co-stroke, and the repo's own
   `var(--accent, …)` idiom always gets a white co-stroke whatever the var resolves to.
   `clearance` moves the cursor but not the bracket ink. A `read` beat does not keep its caption
   up through the action under `caption:'cursor'`. And one that is not a README claim but sits
   with them: the same pacing measurement is `+13%` in the README and in `pacing.ts`, and
   `+21%` in `theme.ts`. **None of these are fixed here** —
   they are library-contract changes, logged rather than pulled into an audit's diff (#18).
4. **Capability with no demo surface.** Before this pass, `wash` and `tap` appeared on zero
   pages, the whole `Theme` surface was unreachable from `/vetrina`, and the most capable demo
   in the repo was `/proto/vetrina-caption`, unlinked and marked disposable.

Doc drift found in passing: `2026-08-05-guide-gesture-vocabulary.md` and
`2026-09-13-vetrina-cursor-caption-narration.md` are both `status: in-progress` while their
work is on `main`; `engineering/capabilities.md` calls `mutate:guide` a 42-mutation battery
where the semantics record says 74; `dist/docs/components.pick.md` says "read the 61 rows" over
70 rows.

---

## 6. What landed

- **`vetrina(react)`** — `useWalkthrough` unlatches when `run()` throws. The test that pins it
  only bites when the throw is CAUGHT inside `act()`, which is what a real host does; letting
  it escape makes React discard the pending update and the defect hides. Verified red against
  the unfixed build.
- **`sweep(guide)`** — per-component attribution, misses included. This is the instrument the
  audit needed and it stays in the tree, so §2's table is re-derivable rather than a snapshot.
- **`site(vetrina)`** — the showcase now carries live theme controls, a timestamped beat log,
  and the `Step[]` the recorder compiles to, plus a beat playing all four deictic strokes.
  Verified on the real page at 1440/820/390, and pinned by `docs/e2e/vetrina-showcase.spec.ts`
  (verified able to fail: removing the `tap` gesture turns the ink arm red). All four strokes
  paint with real area — `underline` a 480x3 bar under its line, `bracket` a 509x120 outline
  around the list. `wash` and `tap` are deliberately NOT quoted as constants: `wash` sizes to
  the phrase's own line rects and `tap`'s ripple is mid-animation when sampled, so both vary
  run to run, and the spec asserts non-zero area rather than a number.

---

## 7. The fork, which is the maintainer's

Three routes to the 1,175 dark cues. They are not exclusive, and the measurement says which
buys what.

**A — Give the projection an anchor token.** Where `chart-narration.js` / `prose-projection.mjs`
compose a sentence they already know the element; emit a stable string anchor with it
(`data-mark="0"` already exists on every funnel band) and let Guide prefer it over text
matching. Reaches the impossible cases, including the whole funnel. Costs a field on a shared
kernel contract that the CLI export also consumes — which is exactly the objection
`present-guide.ts:26-50` raises, and it is a real one.

**B — Feed handles from the manifests.** Project `slots` + `adapt.priority` into a generated
catalog on the `axis-dom-catalog` model and let `anchorFor` consult it. Reaches the nine
`body 100%` components. Does nothing for the funnel.

**C — Widen the matcher.** Add SVG `text`/`tspan` to `BLOCK_SELECTOR`, split joins on commas.
Cheapest, and the one to be most suspicious of: round two MEASURED that relaxing the matcher
bought reach by pointing at the wrong element (90.7% reach, 639 hits on an element holding
less than half the sentence) and refused it. Any move here owes that same cross-check, which
the sweep already prints.

**Recommendation: B first, then A, and C only with the cross-check.** B is the one whose blast
radius stops inside the gesture subsystem, it reaches the failure that most looks like the
original report ("it names the container"), and the generated-catalog pattern it needs is
already shipped and proven. A is the larger win and the larger commitment. This is left open
deliberately: it changes a shared kernel contract, which is not a call to take inside an audit.
