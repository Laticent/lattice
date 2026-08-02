---
status: proposed
summary: >
  Every Studio preview printed "1" as the page number because the engine numbers a slide by its
  ordinal position among the sections of the document it parses, and the previews handed it one
  sliced-out slide. The number was the only symptom loud enough to notice: the same slice was also
  dropping inherited running-global directives and the deck-scoped progress rail. Rendering the deck
  and displaying one section fixes all three but makes the preview's cost scale with the whole deck,
  so it is GATED: a deck with no paginate / running-global directive / divider / auto-glossary /
  `split-panel proof` run keeps the cheap slice path. (The proof entry was MISSING in the first cut —
  see the amendment at the end of this note.) Measured against origin/main on the real Studio at 4x CPU, the shipped default
  deck is faster on both axes (navigation 10.5 -> 7.9ms, typing 9.1 -> 7.9ms); a deck that opts INTO
  pagination gets much faster navigation (11.8 -> 6.9ms) and slower typing (10.4 -> 46.3ms gallery,
  9.8 -> 17.0ms prose) — a real regression on the opt-in path, closed only by step 3. Along the way:
  render() turned out not to be a pure function of its input (module-level chart <defs> counters, 24
  of 112 decks differing on a second render), fixed with a render-scoped kernel plus an anti-squat
  prefix for the hole determinism itself opened; the markdown-it parser is reused across renders,
  keyed on the resolved theme geometry (17% of a one-slide render, nothing on a 117-slide one); and
  structural gating is shown viable against 902 slides in 109 decks, 96.5% byte-equal after a
  mechanical cascade with a 2-slide bail set. Memory: +1.8MB settled, parity everywhere else. Also
  records six claims of mine that the measurements refuted, and five off-path defects logged not
  fixed.
---

# Deck-context preview renders — correctness, cost, and what the measurements actually said

**Status:** steps 1–2 landed on `claude/studio-preview-pagination-8tpodq`; step 3 (structural
gating) designed and shown viable, not built. **Date:** 2026-07-30.

This note exists because the investigation produced several findings that are more valuable than the
patch that prompted them, and because a series of my own claims along the way were wrong in ways worth
recording so nobody re-derives them. Six are called out in place: a Node-based perf table, "typing is
unmeasurable", the parser memo's headline number, the structural-gating residual, and two memory
"wins" that were instrument artifacts. Each was caught by a measurement or a review pass, not by
re-reading my own reasoning, which is the pattern worth keeping.

---

## 1. The bug, and the two it was hiding

Every Studio preview printed `1` as the slide's page number. The engine was right: it derives the
number from a slide's **ordinal position among the sections of the document it parses**
(`lattice_directives_apply`, `lib/engine/slides.js`), and takes no offset — the count *is* the
position. All three Studio preview surfaces sliced one slide out and rendered it alone, so "1 of 1"
was a truthful answer to the wrong question.

**The page number was the only symptom loud enough to notice.** The same slice was also silently
dropping:

- **inherited running-global directives** — a bare `<!-- header: … -->` applies to its slide *and
  every one after*, so a slice rendered without its predecessors lost the running header/footer;
- **the deck-scoped progress dot rail** — derived from the whole deck's dividers.

Both verified by rendering the same slide in-deck and alone. This is why "just suppress the number
in a single-slide preview" was the wrong fix: it addresses the one visible symptom and leaves the
class intact.

## 2. One authored slide is not one section

The first fix indexed the engine's sections with an index into the *caller's* authored slides.
Those counts diverge on decks that ship here:

| deck | authored | sections | cause |
|---|---|---|---|
| `examples/focus.md` | 11 | 14 | `_focusSteps` clones a slide into a section per step |
| `examples/split-headings.md` | 1 | 7 | `split: headings` divides at every heading |

Plus splitter disagreement: the engine's `splitOnHr` breaks on **any** markdown-it `hr` (`***`,
`___`, `- - -`, `---` with trailing spaces), while the Studio's `SEP_RE` (`/\n-{3,}\n/`,
`docs/src/components/studio/lint.ts`) matches only a run of three-or-more hyphens alone on a line
with nothing after it — so `***`, `___`, `- - -` and a trailing space all split for the engine and
not for the Studio. The result was the preview painting a *different slide* than the one selected — worse
than the wrong number, because a wrong number is visibly wrong and a wrong slide is plausibly
wrong.

**The root cause is two independent slide splitters.** The shipped guard fails closed around the
divergence; it does not reconcile it. Reconciling them is the follow-up I would rank above further
performance work, because it is the defect generator.

## 3. `render()` was not a pure function of its input

Several chart kernels mint SVG `<defs>` ids from sequences whose purpose is uniqueness *within* a
document. They were **module**-level — process-scoped, not render-scoped — so they climbed across
calls: **24 of 112 committed decks produced different bytes on a second render in one process**
(`gantt-fill-pass-1` → `-2`, `pie-wedge-1` → `-6`, `radar-area-1` → `-4`). Nothing broke visibly,
because an id and the references to it are minted together. One comment rested the design on "one
Node process per deck", which stopped being true when the docs site began rendering many times per
page.

Fixed by one render-scoped kernel (`lib/core/render-ids.js`) reset per render. **Exported bytes
unchanged**, verified by hashing the first render of **all 112 committed decks** in a fresh process
each, in a worktree at `origin/main` and in this tree: 112 of 112 identical
(`.scratch/hash-first-render.sh`). That is the CLI/export case by construction — one render per
process — so the check is the claim, not a proxy for it.

**Determinism has a price, and it needed a guard.** A predictable id is a squattable id: a deck can
declare `<radialGradient id="pie-wedge-1">` in raw HTML on an earlier slide, and SVG's
first-def-in-tree-order-wins rule then paints the real chart's wedges with the author's gradient
while its legend still reads correctly — a chart that lies. This was *already* possible, but only on
a process's FIRST render; from the second on, the climbing module counter moved the real ids aside by
accident. On the multi-render surfaces this change exists for, that accidental escape is gone, so the
collision became permanent. `resetRenderIds(source)` now probes the source and, when it finds a
minting family named there, shifts the whole namespace behind `lat-r<N>-` with N chosen as
`max(existing) + 1` — free by construction rather than by a loop that might return its own last
untested candidate, which is how `svgA11yNames.uniquePrefix` was broken once before. The probe reads
the DECODED id space too, because `id="pie&#x2d;wedge-1"` parses to exactly the id about to be
minted. No deck that does not name a family is affected, which is every committed deck — hence the
112-of-112 above. Found by the red team.

**Why it is load-bearing rather than tidy:** it is what lets a render cache be *guarded cheaply*.
`2026-07-15-incremental-per-slide-render-cache.md` guards its whole design with an
`incrementalRender === wholeRender` property test. That test is writable against a non-deterministic
renderer, but only by normalizing the drifting ids away first — and a normalizer broad enough to hide
this drift also hides real drift of the same shape, which is what the guard exists to catch. With
determinism the guard is a plain byte comparison. The §5 equivalence measurements below are that
comparison, and they are the concrete payoff: they were not meaningfully runnable before.

## 4. The performance model — and the claims I got wrong

**The cost axis is CONTENT, not slide count.** `main` renders one slide, so its typing barely moves
between a 40-slide prose deck and 40 gallery slides (9.8 vs 10.4ms). A deck-context render makes the
preview's cost scale with the **whole deck's content**, which is where the 4× spread comes from.

**So the fix is a gate, not a faster render.** A preview only needs the deck when the deck
contributes something to the shown slide: `paginate`, a running-global directive comment, a divider
that drives the progress rail, `glossary: auto`, or a `split-panel proof` run. `needsDeckContext`
tests exactly that and renders the slice otherwise — and the slice path is now *cheaper than it was on `main`*, because the parser
memo makes a one-slide render cheaper (§4, wrong claim 3). **`paginate` is default-OFF and none of
the three shipped Studio decks sets it**, so the gated path is the common case, not an edge one.

Measured on the real built Studio at 4× CPU by `docs/e2e/studio-preview-perf.spec.ts` — the SAME
spec run against a worktree at `origin/main` and against this branch, serial, one worker (three
throttled Chromiums in parallel workers inflate every number). TOTAL p50, 40 slides:

| deck | interaction | `main` | this branch | |
|---|---|---|---|---|
| **default** (no `paginate` — the shipped shape) | navigation | 10.5ms | **7.9ms** | **−25%** |
| **default** | typing | 9.1ms | **7.9ms** | **−13%** |
| prose, `paginate: true` | navigation | 10.7ms | **6.0ms** | −44% |
| prose, `paginate: true` | typing | 9.8ms | 17.0ms | **+73%** |
| gallery, `paginate: true` | navigation | 11.8ms | **6.9ms** | −42% |
| gallery, `paginate: true` | typing | 10.4ms | 46.3ms | **+345%** |

Read it as two regimes:

- **The default deck is faster on both axes** — the gate declines the deck render and the parser memo
  makes the remaining slice render cheaper than `main`'s was. This is the case the product ships.
- **A deck that opts INTO pagination pays for its own correctness on the typing path.** Navigation
  gets much faster (a whole-deck memo turns every rail click into a hit); typing cannot be helped by
  a memo, because the markdown changed and it misses by construction. 46ms on a 40-slide gallery deck
  is over `createFrameScheduler`'s 50ms heavy threshold's doorstep and is the honest cost of showing a
  true page number today. **Closing it is step 3 (§5), which is designed and not built.** Until then,
  paginated heavy decks are slower to type in than they were, and that is a real regression stated
  plainly rather than averaged away.

**Wrong claim 1 — a Node-based table.** An earlier version of these numbers came from a harness
that was warm-up-contaminated (ascending sizes, one warm-up — producing a non-monotonic 40-vs-60
inversion) and fence-blind (splitting on `\n---\n` cuts inside a mermaid block's own front matter,
mislabelling every size). Node engine time was the wrong instrument for a question about a browser
surface.

**Wrong claim 2 — "typing is unmeasurable because CodeMirror rejects synthetic keys."** False. The
editor is simply **off-screen** in the Studio's default Read posture, so `focus()` was a no-op and
every input method failed identically — click, `focus()`+type, CDP `Input.insertText`,
`view.dispatch`. `studio-fixture.ts` already solved all of it: `gotoStudio` seeds
`posture: 'build'` before hydration, `getByLabel('Deck source')` fails loudly on a hidden element,
and `setEditorContent` uses `insertText` because per-key typing lets markdown auto-continuation
swallow the `---` separators and merge every slide. **Four throwaway harnesses were built before
reading that one file.**

**Wrong claim 3 — the parser memo as the fix.** `buildMd` rebuilds a markdown-it, geometry
resolution, the slide pipeline, math, the Mermaid grammar and 15 plugins on *every* render. It is a
roughly FIXED cost, so memoizing it matters in inverse proportion to deck size. Measured by forcing
a miss without changing the render — alternate two theme names of identical geometry, so the key
moves and nothing else does (`.scratch/memo-saving.mjs`, Node, 1× CPU, p50 of 80 renders):

| deck | warm (hit) | forced miss | memo saves | share of render |
|---|---|---|---|---|
| 1 slide | 1.73ms | 2.07ms | 0.35ms | 16.6% |
| 10 slides | 2.27ms | 2.47ms | 0.20ms | 8.1% |
| 40 slides, prose | 3.64ms | 3.74ms | 0.11ms | 2.8% |
| 117 slides, gallery | 44.44ms | 43.47ms | — | within noise |

An earlier version of this note put the one-slide win at "0.44 → 0.15ms, 2.9×" and the 40-slide one
at "20.2 → 18.7ms". Neither is supported: the first came from a bare engine with no theme
registered, and the second attached a Node-measured delta to a browser number it was never measured
against. **The memo's value is unlocked *by* structural gating, not independent of it** — it is worth
16.6% of a one-slide render and nothing on a whole-deck one, and structural gating is what makes the
render one slide.

## 5. Structural gating (step 3) — viable, with evidence

The insight the measurements support: a preview showing slide *k* needs four things with
**different dependencies**, and typing prose changes exactly one of them.

| need | depends on | changes when you type in slide *k*? |
|---|---|---|
| slide *k*'s body | *k*'s markdown + inherited directive state | **yes** |
| page number + total | slide count and *k*'s position | no |
| progress rail | divider positions | no |
| inherited header/footer/theme | preceding slides' directive *lines* | no |

So: re-render only slide *k*, with a synthesized directive prelude (a **0.033ms** string scan over
117 slides — effectively free), and reuse the cached position.

Tested for byte-equivalence — one-slide render vs the matching section of a whole-deck render —
across **902 slides in 109 decks** (2 decks excluded: they are the 1→N expanders from §2, where
there is no one-to-one slide↔section pairing to compare). `.scratch/equiv-classify.mjs`.

Only **32 slides (3.5%)** are byte-exact from a synthesized directive prelude alone. The rest need a
mechanical repair, applied as a cascade — each is O(section bytes) over a string the caller already
holds, and the count is "slides needing this normalizer", so a slide appears in several rows:

| repair | slides | resolution |
|---|---|---|
| pagination attrs + positional `id` | 870 | re-stamp from the cached position |
| progress rail absent | 130 | inject from the deck-wide divider count |
| a11y `<svg>` title/desc ids | 88 | re-stamp — `svgA11yNames` already probes and re-prefixes |
| chart `<defs>` id sequences | 44 | **seed** the sequences — a direct payoff of §3 |
| `cat-N` categorical cycle | 6 | re-stamp — a deck-scoped counter, same class as the page number |

**870 of 902 (96.5%) are byte-equal after the cascade. 30 (3.3%) differ only in whitespace between
block tags. 2 (0.2%) must bail** — both watermark glyphs, driven by the running divider count, both
visible in the markdown and so cheaply detectable.

**Two corrections to how this was measured, because the first two passes were both wrong.** The
version of this note written before review claimed "~99% reconcilable, ~1% bail" from a classifier
that *listed* a `<defs>` class it never actually normalized — so it was crediting id drift as
reconciled and its residual bucket was unexamined. Re-measured properly it read 92.6% / 7.4% with 58
slides unattributed. Those 58 turned out to be two bugs in the probe itself, not engine properties:

- **32** — the prelude synthesizer treated *any* non-`_` comment `name: value` as a running global,
  so it injected slide 0's `<!-- describe: … -->` into every later slide. `describe:` is slide-local
  and consumed (`lib/authoring/notes-core.js`); it is not in `KNOWN_DIRECTIVES` at all. Fixed by
  using the engine's own directive set.
- **6** — the `cat-N` categorical cycle, a genuine deck-scoped running counter, but re-stampable
  from position rather than semantic. It is now a cascade row, which is also what removed the 7
  "divider slide" bails: they were `cat-N` differences.

The **30 whitespace-only** cases are the probe's remaining artifact — injecting a prelude perturbs
markdown block adjacency, so the body re-parses tight-vs-loose. They are reported separately rather
than folded into either side: a real implementation has to preserve adjacency, and step 3 needs an
equivalence harness that does. The number to carry forward is therefore **0.2% genuine bail, with a
~3% band still owed to a better instrument** — not the ~1% originally asserted, and not the 7.4% the
intermediate pass produced.

Because the id sequences are now render-scoped and resettable, `resetRenderIds()` can become
`seedRenderIds(offsets)` so a slice render emits deck-correct ids directly rather than needing a
post-hoc rewrite.

**Ceiling, stated plainly:** typing must re-render the edited slide, so no design does less work
than one slide render. Structural gating reaches **parity** with `main`, not better; the parser
memo is the only thing that goes below that line, and on a one-slide render it is worth 0.35ms
(17%). If parity is not
acceptable, the different-in-kind option is moving the render off the main thread (a worker), which
decouples typing latency from render cost instead of shrinking it.

## 6. Memory cost

**The instrument had to be rebuilt before any of this was worth reading.** The first version answered
three questions it could not see:

- it drove `page.reload()` between decks to test the memo's boundedness — but a reload destroys the JS
  realm and recreates the memo empty, so its flat heap proved nothing;
- the overview-grid delta spanned those reloads, subtracting two different realms;
- it used `Runtime.getHeapUsage`, which reports the **top frame's JS heap only**. Every preview is a
  same-origin `srcdoc` iframe with its own realm, so the grid's 22 frames — the thing being measured —
  were invisible to it.

The rebuilt instrument (`.scratch/mem-browser2.mjs`) serves the site cross-origin-isolated and uses
`performance.measureUserAgentSpecificMemory()`, which reports total bytes with a per-realm breakdown;
it prints the realm count so the iframes are visible rather than assumed (4 realms at rest, 25 with
the grid open). Everything after first paint happens in ONE realm, so every delta is a real delta.
Three interleaved runs per side, GC forced before each reading, 40-slide gallery deck, same-machine:

| | `main` (3 runs) | this branch (3 runs) | verdict |
|---|---|---|---|
| settled after first paint | 24.68 / 24.66 / 24.68MB | 26.47 / 26.51 / 26.32MB | **+1.8MB**, well outside noise |
| growth over 40 navigations | +3.15 / +3.42 / +2.89MB | +3.30 / +3.37 / +3.53MB | **parity** (within-side spread is larger than the gap) |
| overview grid, 22 live frames | +27.71 / +27.62 / +28.00MB | +25.59 / +27.23 / +27.25MB | **parity** |

**Two claims from the earlier version are refuted by this.** It reported "−0.77MB growth over 40
navigations" and "−6.6MB for the overview grid" as wins. Neither survives: both are parity once the
iframe realms are counted, and both gaps are smaller than the run-to-run spread. The grid's cost lives
almost entirely in its 22 frames (~1.2MB each), which the old top-frame-only reading could not see, so
what it was actually measuring was top-frame bookkeeping noise.

**Boundedness is a structural property, so it is now a structural test.** After three browser attempts
to read it off the heap measured nothing, the honest form of the question is "does the memo ever hold
more than one entry?" — and that is `whole-deck memo boundedness` in
`docs/src/lib/single-slide-render.deck-context.test.ts`: six alternating deck renders must produce six
engine calls (a two-entry cache would serve four of them), and four identical renders must produce
one. It runs in CI instead of being a one-off reading.

Node-side retention, separately measured: the parser memo holds **0.44MB** (one markdown-it + 15
plugins); a deck memo entry is **48KB** at 40 slides and **285KB** at 117; a whole-deck render
allocates ~0.55MB of transient garbage that GCs cleanly (0.83MB after 20 renders, i.e. noise). The
memo's `css` field is the *same string instance* the theme store already memoizes, so it costs a
pointer, not the ~563KB sheet.

**Net: +1.8MB fixed, and parity everywhere else.** Roughly half the +1.8MB is attributable (the parser
memo, one memo entry, the whole-deck source strings the Studio now holds); the remainder is not
decomposed, so it is recorded as **observed** rather than explained.

## 7. What to preserve from this branch

Independently valuable, regardless of what happens to the pagination fix:

1. **`lib/core/render-ids.js` + determinism + the anti-squat prefix** — a correctness fix, what
   lets a future cache's equivalence guard be a plain byte comparison, and a closed hole that
   determinism itself opened. `test/unit/core/render-ids.test.js`.
2. **The parser memo, keyed on the resolved geometry** — a real saving on every render path, largest
   where the render is small. The KEY is the load-bearing part: a mutation-counter key looks correct
   and misses 100% of the time on the live-theme surfaces, which re-register identical CSS before
   every render on purpose. `test/unit/engine/parser-memo.test.js`.
3. **`docs/e2e/studio-preview-perf.spec.ts`** — the only instrument in the repo that measures the
   preview's *typing* path on a real surface, over two decks, with an assertion that renders
   actually happened (a caret outside the shown slide records zero samples, which reads as "free"
   rather than as a broken harness — a trap two earlier harnesses fell into, once in each
   direction).
4. **`single-slide-render.alignment.test.ts`** — drives the real engine and real splitter over the
   real example decks, asserting the two 1→N decks by name so the divergence cannot be silently
   assumed away.
5. **The equivalence method in §5** — worth committing as a test when step 3 is built; it is what
   makes that work safe rather than hopeful.

## 7b. The bug the true page number exposed — editor↔rail off by one

Reported after the branch was pushed: *"the slide I am previewing via the preview slide selection is not
the slide text that is in full view in the editor. I feel like the count or something is off."* On
`examples/gallery-jargon.md`, from the deployed preview.

**It was a real off-by-one, and it was NOT caused by this branch.** `slideStartOffset` and `slideIndexAt`
(`docs/src/components/studio/lint.ts`) located slides by counting `---` separators over the whole editor
document. The rail counts slides in the front-matter-STRIPPED body. A front-matter block's closing `---`
is newline-flanked, so it matched the separator regex and became separator #0:

| direction | was | should be |
|---|---|---|
| rail *k* → editor (`slideStartOffset`) | frames slide *k−1* | frames slide *k* |
| caret in slide *k* → rail (`slideIndexAt`) | reports *k+1* | reports *k* |

Both wrong in the same direction, so they compounded instead of cancelling; `slideStartOffset(src, 0)`
framed the YAML block. A rarer second shift stacked on top: `splitSlides` drops empty chunks, a raw
separator count does not.

`git diff origin/main` on `lint.ts`, `Editor.tsx` and `front-matter.ts` is **empty** — the math is
byte-identical to `main`, so the defect predates this work. **What this branch changed is its
visibility:** while every preview printed "1 of 1" there was no number to reveal that the two panes were
on different slides. Making the page number true made a latent misalignment legible. That is worth
recording as a class: *a correctness fix can surface an unrelated defect by removing the noise that hid
it*, and the resulting bug report will point at the new change.

**Fixed in place rather than logged**, because it is squarely on the path of this work (editor↔preview
sync is what the branch is about) — HARD RULE #18's on-path clause. Both functions now derive from one
`slideRanges` helper that indexes exactly what `splitSlides` returns, so the two directions cannot
disagree with each other or with the rail.

**Why the existing test suite could not catch it, which is the more useful finding.** The fuzz property
was `slideIndexAt(src, slideStartOffset(src, i)) === i` over decks built as `bodies.join('\n---\n')` from
non-empty bodies — no front matter, no empty chunks. The two functions were self-consistent on exactly
that shape, so **the round-trip property was TRUE while the pair was wrong on every real deck**. A
round-trip between two functions that share a mistake proves only that they share it. The new cases feed
the shapes real decks have.

**Both directions are now guarded on the real surface, each with a verified negative control** — the
report named the caret→preview direction FIRST ("the slide I am editing is not the slide displayed"),
and that one was initially checked with an invalid control: `git stash push` had nothing to stash
because the fix was already committed, so the "without the fix" run silently ran WITH it and passed.
Re-run against `origin/main`'s `lint.ts` it fails on 5 of 7 sampled slides, previewing slide *i+1* for
a click into slide *i*. A negative control that cannot fail is the same defect as a test that cannot
fail.

Three instrument attempts before a usable one, all worth naming because each *passed* while measuring
nothing: the DOM selection reads empty (a rail click moves focus off the editor); "slide *i*'s first line
is in the rendered DOM" passed with the bug reintroduced, because CodeMirror builds a margin of lines
around the viewport; and "first line near the scroller's center" was wrong by construction, since
`revealSlide` centers the whole slide RANGE, so the first line sits half a slide (120–191px, measured)
above center. The assertion that discriminates: **the editor's vertical center falls inside slide *i***
— it passes with the fix and fails on 6 of 8 sampled indices without it.

## 8. Off-path defects found, logged not fixed (HARD RULE #18)

- **A bare `# h1` on a default `form` slide renders white-on-white.** `base.elements.css` sets
  `color: var(--text-display)`; `themes/indaco.css` defines it as `#FFFFFF` for dark surfaces. A
  title slide silently loses its title. Confirmed independent of this work through the untouched
  export path.
- **`docs/scripts/frame-bench.mjs` silently measures nothing** in the default posture — it focuses
  `.cm-content` and types, which does nothing while the editor is off-screen, and reports `NaN` for
  the patch/write regimes rather than failing. Superseded for preview work by the `@perf` spec, but
  the script itself still misleads.
- **`docs/src/playground/preview-virtual.js` exports a dead `diffSections`** with no production
  consumer, and its header points at a controller that has since moved.
- **`lib/components/chart/state-chart/state-chart.transform.js` mints `sc-node-fill-N` from a
  counter scoped to the `applyToDom` CALL**, while its comment claims "unique per figure". Two
  `applyToDom` passes over one long-lived document can therefore both emit `sc-node-fill-1`. Not in
  the engine's HTML output and untouched by this work, so it was left alone rather than pulled into
  the diff — but it is the same class as §3 and should migrate to `render-ids.js` when someone is in
  there. Found by the red team.
- **The flat `splitSections` in `docs/src` is the weaker of two existing walkers.**
  `lib/core/split-sections.js` is depth-aware ("survives nested sections") but is CJS and not
  exposed on the browser engine bundle, so the preview detects-and-degrades instead. Exposing that
  kernel is the proper fix.

---

## Amendment (2026-07-30, same day): the gate's question was a proxy, and it missed `cat-N`

The gate shipped keyed on "does this deck show page numbers, inherit a running global, draw a
progress rail, or grow a glossary slide?" That list is a **proxy** for the real question, which is
*does any slide render something whose value depends on other slides?* — and the proxy was missing an
entry: **`split-panel proof`**.

`cat-N` is not authored. The engine assigns it from a slide's ordinal among the deck's proof slides
(`sequenceProofPanels`, `lib/core/split-panels.js`), so a slice rendered alone is always "the first proof
slide" and takes `cat-1` — a leveled deck presented as N identical blue panels. That is the
originally reported bug, and it survived this gate because **the reported deck also paginates**: it
tripped the `pagination` entry and came out right by luck. Measured against the gate verbatim:

```
proof deck, no paginate/divider/glossary  -> needsDeckContext = false
same deck WITH paginate: true             -> needsDeckContext = true
```

Confirmed on the real Present overlay before the fix: a three-slide un-paginated proof run painted
`rgb(188, 213, 236)` for all three slides. After: `cat-1`/`cat-2`/`cat-3`, three distinct fills.

Live impact at the time was zero — of 126 decks in `examples/` and `test/integration/baseline-decks/`,
exactly one has a proof run and it paginates — but an author writing a proof deck without pagination
hit the full original symptom.

**Why pagination hid the problem, and the general lesson.** Pagination is the *forgiving* fact: a page
number nobody displays can be wrong invisibly, so gating on "is it enabled" is safe there. A
categorical hue is displayed either way, so the same shortcut renders it wrong in plain sight. Keying
the gate on a *visibility* switch therefore only ever worked for the one fact whose visibility and
correctness coincide.

**What changed.** `needsDeckContext` is now a `DECK_DERIVED_FACTS` registry — each entry names the
fact, states why it cannot be derived from a lone slice, and carries its probes. Adding a
deck-derived feature means adding an entry, and the registry is exported so tests assert every fact
is named, justified, probed, uniquely named, and that no probe is dead. Bias stays toward
over-triggering: a false positive costs one memoized parse, a false negative renders wrong output.

The `split-panel proof` probe matches `proof`/`capstone` *without* requiring `split-panel` in the same
directive, because `deckClassPropagate` can supply that token from front matter.

**Guard:** `docs/e2e/proof-run-deck-context.spec.ts` drives the real Present overlay on an
un-paginated proof run and reads the painted fill; it fails with all three slides on one slot if the
registry entry is removed. The unit tests assert the gate's *answer*; this asserts the *painted
result*, which is the distinction that matters — this bug class has now been found twice by bug
report and never by a passing unit suite.

---

## Amendment 2 (2026-07-30): pagination stopped needing the deck at all

The gate above treats `paginate` as a reason to re-parse the whole deck. That was the wrong stance,
and correcting it is the largest performance win in this whole line of work.

A page number is **`slide k of N`** — positional metadata the caller *already holds*.
`PresentOverlay`, `SlideOverview` and the editor preview each know exactly which slide they are
showing and how many the deck has. The engine only needed the deck because it **derives** the number
by counting the sections of whatever document it is handed. So a preview showing one slide re-parsed
the entire deck to recompute a position nobody had lost.

`render()` now takes an optional `page` (`{ offset, total }`). Supplying it lets the preview render
the shown slide ALONE and still print a true number, and `paginate` is no longer a gate trigger.

**Why this is the big one.** Measured over the 126 committed decks in `examples/` +
`test/integration/baseline-decks/`:

| | decks taking the expensive whole-deck path |
|---|---|
| before | 121 (96.0%) |
| with page position supplied | **53 (42.1%)** |
| if section position were supplied too (the rail) | **10 (7.9%)** |

115 decks set pagination and **69 tripped this gate for pagination alone** (68 of them flip to the slice path). The claim in §5 that
"`paginate` is default-OFF … so the gated path is the common case" was generalized from three
starter decks; the corpus says the opposite, and one click of the Studio's Page-numbers control
moved a deck permanently onto the expensive path.

**Measured, same machine, minutes apart, identical `node_modules`** (stash the change, rebuild,
re-run — not a cross-machine comparison):

| deck | interaction | before | after | |
|---|---|---|---|---|
| default (no `paginate`) | typing | 7.8ms | 7.0ms | −10% |
| **prose, `paginate: true`** | **typing** | **17.9ms** | **8.0ms** | **−55%** |
| prose, `paginate: true` | navigation | 5.1ms | 8.1ms | **+59%** |
| gallery, `paginate: true` | typing | 44.7ms | 44.0ms | — |

The +73% typing regression this note recorded for a paginate-only deck is **gone** — 8.0ms is better
than the 9.8ms it cost before any of this. Two honest caveats: prose NAVIGATION is slower, because
navigation used to hit the whole-deck memo and slice renders do not share one (3ms on the cheap axis
to buy 10ms on the axis that was over `createFrameScheduler`'s threshold); and the GALLERY deck
barely moves, because it carries dividers and still trips the rail. Dividers are what the 42% → 8%
row above would close, and that is the next step, not this one.

**The gate's question changed with it.** It no longer asks "does this deck paginate?" but **"can I
trust my own slide indices?"** — the only thing supplying a position actually requires. Two plugins
break that 1→N: `_focusSteps` clones one authored slide per step, and `split: headings` starts a
slide at every `##`. Under either, "slide k" of the caller's list is not section k, so those decks
keep the whole-deck render. One committed deck (`examples/focus.md`) is in that class.

**Two implementation traps, both of which would have been silent:**

1. **`page` rides the per-render markdown-it `env`, never the pipeline's install options.** The
   parser is memoized (§4), so a value baked into a plugin closure is served stale on a hit — every
   slide printing the first one's number. Regression-tested by rendering at differing offsets on one
   engine instance.
2. **The whole-deck memo key includes the supplied position.** Two byte-identical slides at
   different deck positions now render differently, so a key over source alone would hand slide 7
   the number cached for slide 3.

Absent `page`, numbering is counted off the document exactly as before, so no export path — none of
which supplies it — can move. Guarded on the real surface by
`docs/e2e/supplied-page-position.spec.ts`, which walks the real Present overlay on a paginated deck
and asserts the PAINTED badge matches the player's counter.

## Amendment 3 (2026-08-02): the instrument, and why it has two surfaces

§5 was designed against a measurement that lived in `.scratch/` and was lost. When its numbers were
later questioned nobody could re-examine the residual, so the rate was restated three times (~99%,
92.6%, 96.5%) as successive passes found bugs in the *probe* rather than in the engine. Two of those
bugs are worth naming, because both were the class where the instrument is wrong and still looks
plausible: the corpus walk read only the top level of `examples/`, silently measuring 111 of 125
decks and calling it "the corpus"; and normalizing the pagination *attribute* but not its painted
span read 34.2% where the truth was 90.5%.

The instrument is now committed, and it has **two surfaces over one pure core**
(`lib/diagnostics/slice-equivalence-core.mjs`):

- **Headless** — `tools/slice-equivalence.mjs` (`npm run equiv` / `equiv:bless` / `equiv:check`).
  Sweeps every committed deck against a baseline with a 1.5-point band. On-demand, **not a CI gate**:
  it measures a prototype with no production consumer, so a drop means "the prototype moved", not "a
  user broke". Same shape as `bench` and `quality`, and catalogued in `engineering/capabilities.md`
  so the next person does not rebuild it — the failure that lost the original measurement.
  Reads **1104/1201 slides (91.9%)**, residual concentrated in generated ids / `cat-N` (49 slides,
  the `seedRenderIds` row) and unclassified (46).
- **Author-facing** — the Studio's **Preview fidelity** overlay
  (`docs/src/components/studio/PreviewFidelityOverlay.tsx`, Workspace → Diagnostics, or
  `?fidelity`). Reports which route the shown slide took, which registry fact forced it, and what
  position was supplied; a button renders the slide both ways and quotes the first divergence.

### The prelude is empty for every slide in the corpus — so 91.9% is not the prototype's score

This amendment first claimed, and the CHANGELOG and capability index repeated, that the sweep scores
the *prototype prelude*. **It does not.** Counting directly over the corpus:

```
measured slides:                    1201
slides given a NON-EMPTY prelude:      0
```

Every running-directive comment in the committed decks is outside the engine's vocabulary (`note`,
`describe`, `caption`), and every in-vocabulary directive is written in the `_` spot form, which is
slide-local by definition and correctly not carried forward. The deck-level ones (`header:`,
`paginate:`) live in front matter, which the harness already prepends verbatim.

So **91.9% is slice-vs-deck equivalence with the prelude mechanism contributing nothing** — a useful
number, and the right denominator for the `seedRenderIds` row, but it says nothing about whether the
general mechanism works. Step 3's own corpus evidence is currently zero, and that is the honest state
of §5.

Two consequences, both now fixed rather than noted:

1. **The sweep prints the prelude count on every run**, so the claim cannot silently go stale again.
   It is in the blessed baseline too.
2. **`synthesizePrelude` throws when its vocabulary argument is missing**, instead of defaulting to
   empty sets. A caller that dropped it would have synthesized empty preludes for all 1201 slides and
   moved `equiv:check`'s band by **0.0 points** — undetectable by construction. This was found by
   asking whether the injected-vocabulary design had a footgun; it did, and it was already live.

The *author-facing* half is where the mechanism does get exercised, because an author's in-progress
deck is not the committed corpus: the running-header deck below produces exactly the divergence a
prelude would repair. That asymmetry is itself an argument for having built both surfaces.

**Why both, rather than either.** The headless half is the one that can be scripted, scheduled, and
gated without a browser. The author-facing half is the one that answers the question *at the moment
it is asked* — a number or a color looks wrong on the deck in front of you — which a corpus rate
never can. They are not the same tool aimed at two audiences; they ask the same question about
different subjects.

**The one place they must NOT agree.** Both compare normalized renders, but they neutralize
different things, and this is load-bearing rather than incidental:

| | headless sweep | author overlay |
|---|---|---|
| positional `id="N"` | hidden | hidden (no shipped repair yet) |
| pagination attr + painted span | **hidden** | **kept** |
| progress rail | **hidden** | **kept** |
| inter-block whitespace | hidden | hidden |

The sweep hides the repairs that already ship (#1272, #1280) so the rate isolates what is still
UNREPAIRED — the residual step 3 would have to close. The overlay keeps them, because a wrong page number or a wrong rail is precisely
the finding an author turns it on for — hiding them would blind it to its main use. The asymmetry is
pinned by `test/unit/diagnostics/slice-equivalence-core.test.js`, which fails if either set drifts
toward the other.

**A difference means opposite things on the two routes**, and the overlay says which:

- On the **slice** route the slide on screen *is* the fast render, so a difference is a live bug —
  the registry has a hole.
- On the **whole-deck** route the preview already shows the full render; the fast route was never
  taken. A difference there means the gate is earning its cost; a *match* means it over-triggered on
  this slide and paid for a deck parse it did not need.

**Verified on the real Studio** (HARD RULE #23), typing a two-slide deck whose first slide sets a
running `<!-- header: … -->`: route reads `the whole deck (slow)` because `running-global directive`;
compare on slide 1 reports the fast route *would have matched*; compare on slide 2 reports it *would
differ*, quoting the exact loss — `data-header="Q3 Board Review"` present in the deck render, absent
from the slice. That is §5's thesis rendered visible: it is precisely what the prelude synthesizer
would repair. The fourth branch — slice route *and* a difference — was **not** reachable on a real
deck, since producing it requires a registry hole; it is UNVERIFIED on a real surface.
