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

> **Resolved in Amendment 4 (2026-08-02)** — though not the way this sentence expected. The two
> splitters differ in KIND (token-level after a full parse vs text-level before the engine bundle
> loads) and stay two; what became single is the separator's DEFINITION, the arbiter that decides
> when they may disagree, and the alignment invariant. See "The two slide splitters, reconciled".

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

### What the sweep cannot detect — measured, and load-bearing

> **CLOSED by Amendment 4 (2026-08-02).** Both findings below were true when written and are no
> longer: the sweep now runs the shipped repair and neutralizes neither `pagination` nor `rail`.
> The section is kept verbatim because the *measurements* in it are what justified the fix, and
> because "a diagnostic that cannot fail" is a class worth being able to recognize again.

A Munger inversion of the shipped diagnostic asked what would have to be true for the headless half
to be *incapable* of catching a real defect. Two things, and both are true:

**It never runs the code that ships.** `tools/slice-equivalence.mjs` imports `lib/diagnostics` and
`lib/engine` only. The repair that actually fixes the preview — `supplyablePosition`,
`positionIsTrustworthy`, `deckSectionFor`, `DECK_DERIVED_FACTS` — lives in
`docs/src/lib/single-slide-render.ts` and is never executed by the sweep. Every slice is rendered
with **no supplied position**, so the sweep faithfully reproduces the pre-#1272 behavior on all 1201
slides. Change `positionIsTrustworthy` to `return false` — every Studio slide back to "1 of 1", the
originally reported bug fully restored — and `equiv:check` moves **0.0 points and passes.**

**Most of the rate is neutralizer.** Measured on this corpus:

| regime | rate |
|---|---|
| blessed (`PROTOTYPE_NEUTRALIZERS`) | **91.9%** (1104/1201) |
| minus the `pagination` neutralizer | **11.0%** (132/1201) |
| minus the `rail` neutralizer | **67.5%** (811/1201) |

So roughly **81 of the 91.9 points are differences agreed to be ignored**, because their repairs
already ship. The tool now prints the active neutralizer set on every run, for the same reason it
prints the prelude count: the set is an *assertion about what ships*, nothing pins it to reality,
and a reader who cannot see it cannot judge the number.

**This also replaces the stated reason for keeping it off CI.** The old argument — it measures a
prototype with no production consumer — is weak now that the same core powers the shipped overlay.
The real reason is that **it cannot produce a true alarm at its own resolution**: the `--check` band
is 1.5 points, which over 1201 slides is 18 slides, and breaking `cat-N` on every proof slide in the
corpus moves it 5 slides — 0.4 points, a pass. Promoting it to a gate would not catch the defect
class it was built around. That is a property, not a scheduling choice.

**What the sweep IS**, then: the residual for step 3 — how far a slice sits from its deck section
once the shipped repairs are set aside. It says whether the general mechanism is worth building. It
is not, and cannot be, a regression gate for user-visible behavior; the gates for that are the unit
tier, the Studio e2e specs, and the author-facing overlay.

**Next slice, not this one.** Making the sweep measure what ships means porting `positionIsTrustworthy`
and `deckSectionFor` into `lib/diagnostics/` (both are pure string functions), supplying `page` in the
corpus walk, and dropping `pagination`/`rail` from the neutralizer set. The rate would stop being
mostly-neutralizer and start *falling* when a shipped repair breaks. That is a change to the shipped
render path's ownership and a re-blessed baseline, so it is logged here rather than widened into this
PR (HARD RULE #17).

**Why both, rather than either.** The headless half is the one that can be scripted, scheduled, and
gated without a browser. The author-facing half is the one that answers the question *at the moment
it is asked* — a number or a color looks wrong on the deck in front of you — which a corpus rate
never can. They are not the same tool aimed at two audiences; they ask the same question about
different subjects.

**The one place they must NOT agree.** Both compare normalized renders, but they neutralize
different things, and this is load-bearing rather than incidental:

> **RETIRED by Amendment 4 (2026-08-02).** The asymmetry below existed only because the sweep
> could not repair what it hid. Once it supplies the position, both surfaces neutralize the same
> two residuals and the pair collapsed to one `RESIDUAL_NEUTRALIZERS`.

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

---

## Amendment 4 (2026-08-02): the sweep now runs the code that ships, and it can fail

Amendment 3 recorded two properties of the headless sweep that together made it incapable of
catching a regression in anything a user touches: it never executed the shipped repair, and ~81 of
its 91.9 points were neutralizer. Both are now closed, and the fix was one change with two halves
that only work together.

**The supply functions moved to the shared core.** `positionIsTrustworthy`, `deckSectionFor` and
`supplyablePosition` were pure string functions over the deck source that happened to live in
`docs/src/lib/single-slide-render.ts` — a browser module the Node CLI cannot import. That accident
of placement, not any design decision, is what left the sweep rendering all 1201 corpus slides with
no supplied position. They now live in `lib/diagnostics/slice-equivalence-core.mjs` beside the rest
of the shared core, the Studio imports them, and the corpus walk hands the engine the same `page`
the Studio's slice route does (HARD RULE #1). `DECK_DERIVED_FACTS` deliberately did **not** move:
the sweep renders every slide as a slice on purpose, because that is what makes its rate the
*residual*.

**The neutralizer pair retired.** `PROTOTYPE_NEUTRALIZERS` hid `pagination` and `rail`;
`SHIPPED_NEUTRALIZERS` kept them. With the position supplied, hiding them would neutralize exactly
the difference a broken repair produces — so both sets collapsed to one `RESIDUAL_NEUTRALIZERS`
(`ids`, `whitespace`), which is what neither surface can repair yet. The asymmetry the unit tests
pinned was never a design principle; it was a symptom of the sweep's blindness, and it went away
with the blindness.

### The falsification, which is the actual deliverable

A green run proves nothing about a guard. Two mutations, each run against the re-blessed baseline:

| mutation | `positions` | rate | `equiv:check` |
|---|---|---|---|
| none | 1215 | 99.2% | passes |
| `positionIsTrustworthy` → `return false` | **0** | **10.5%** | **FAILS** |
| `deckSectionFor` → `return undefined` | 1215 | **73.3%** | **FAILS** |

The first mutation is the originally reported bug fully restored — every slide back to "1 of 1".
Against the tool as it shipped in #1298 it moved **0.0 points and passed**. The second is the check
that the rate *alone* carries weight, not just the exact-field comparison: `positions` is untouched
there and the 1.5-point band still catches it by 16×.

`positions` joins `decks` / `slides` / `preludes` as an exact-match field in the baseline, for the
same reason those are: it is the number that tells a reader whether the percentage means anything.
At 0, the tool is measuring the pre-#1272 engine no matter how healthy the rate looks — which is
precisely the state it was in when Amendment 3 was written, undetected.

### What the rate did, and why it barely moved

91.9% → 91.9%, and the coincidence is worth reading rather than glossing:

| bucket | before | after |
|---|---|---|
| generated ids (`seedRenderIds` row) | 44 | 41 |
| unclassified | 46 | 51 |
| `cat-N` (categorical hue) | 5 | 5 |
| watermark glyph | 2 | 0 |

The supplied position repairs pagination and the rail on very nearly the same slides the
neutralizers used to hide them on — that is what "the neutralizer asserts what ships" meant, and the
assertion turns out to have been accurate. The watermark bucket going to zero is the visible gain:
those two slides differed on a glyph driven by the running divider count, which `deckSectionFor` now
supplies. What the number no longer is, is *free*: it is now 91.9% because the repair works, not
because the difference was hidden.

### Still not a CI gate, but for a different reason

Amendment 3 argued it could not produce a true alarm at its own resolution. That argument is gone —
a broken repair now moves it by 24 to 81 points against a 1.5-point band. What is left is weaker and
honest: the sweep's subject is a diagnostic prototype rather than a shipped surface, and a corpus
edit moves the rate, so it stays on-demand alongside `bench` and `quality`. The gates for
user-visible behavior remain the unit tier, the Studio e2e specs, and the author-facing overlay
(HARD RULE #23 — a rate is not a painted pixel).

### Coverage the move bought for free

`positionIsTrustworthy` and `deckSectionFor` had **no direct unit coverage** in `docs/src`. They
were exercised only through a browser render path and three Playwright specs, which meant every rule
in them — the `_focusSteps` bail, the four unrecognized `hr` forms, the default-heading-split count,
the divider-inside-code fail-safe, the `divider-lite` token test — rode on an end-to-end assertion
about a painted number. In the pure core they are directly testable, and
`test/unit/diagnostics/slice-equivalence-core.test.js` now pins each of those rules by name.

### The two slide splitters, reconciled — and the part that must stay two

§2 named "two independent slide splitters" as the defect generator and ranked reconciling them above
further performance work. #1298 made it worse: the *alignment invariant* — the checks that decide
whether an index may identify a section — had grown to **three copies**, and they had already
diverged inside four days.

**The part that CANNOT be merged, stated plainly, because pretending otherwise is how a fourth copy
gets written.** The engine breaks slides on any markdown-it `hr` token (`***`, `___`, `- - -`,
`---` with a trailing space) *after a full parse*. The Studio needs an answer on every keystroke, in
a browser, before the engine bundle has finished loading — so it scans text for `\n---\n`. That is a
difference in KIND (token-level-after-parse vs text-level-before-load), not a duplication, and
routing the editor through the engine's tokenizer would mean a full parse per keypress. The two
splitters stay two.

What follows from that is where the work went:

1. **One definition of the separator.** The literal `\n-{3,}\n` had four copies — `lint.ts`'s
   `SEP_RE`, `positionIsTrustworthy`, and `deckSectionFor` twice. Their entire job is to agree: the
   moment they don't, the progress rail, the editor↔preview sync and the supplied page number are
   counting different things. `slideSeparatorRe()` in the shared core is now the only one. It is a
   FACTORY, not an exported RegExp — a `/g` literal carries `lastIndex`, and two modules sharing one
   instance interleave their scans.

2. **One place that decides when the two may disagree.** `positionIsTrustworthy` already enumerated
   the shapes on which they can (the four `hr` forms, `_focusSteps`, a chunk carrying two top-level
   headings under the default heading split) and refused to supply a position for any of them. That
   is the reconciliation: not one splitter, but one arbiter, failing closed. It now lives in the
   shared core with direct unit coverage per rule, where before it had none.

3. **One alignment invariant, and it was hiding a hole.** `narrowToSlide` now calls
   `alignmentFailure` instead of repeating it. The copies had diverged in the DANGEROUS direction:
   `narrowToSlide` let a **missing `slideCount`** through and narrowed on the index alone — exactly
   the `_focusSteps` / `split: headings` case where "slide k" is not section k, so the preview paints
   a slide the author did not select. Every production caller (`StudioShell`, `PresentOverlay`,
   `SlideOverview`→`slide-thumb`) passes the count, so the permissive branch protected nothing and
   concealed a real gap; only tests reached it. It now fails closed to the honest slice.

4. **One walker under that invariant.** The guard is *"the flat walker mis-paired"*, so checking it
   against a list produced by a DIFFERENT walker guards nothing — and that is what
   `narrowToSlide` did, tallying `<section` opens against the filmstrip's `splitSections` while
   `alignmentFailure` was handed `sectionsOf`. Both are flat and non-greedy; `sectionsOf` is the more
   robust (the filmstrip's `<section\b[^>]*>` stops at the first `>`, so an attribute value
   containing one cuts the open tag in half). One walker now feeds the invariant that judges it.

**Still open, and unchanged:** the depth-aware `lib/core/split-sections.js` is CommonJS and not on
the browser engine bundle, so `docs/src` still detect-and-degrades on nested `<section>` rather than
walking it correctly. Exposing that kernel is a bundle-surface change, and it is the remaining item
under §8's last bullet.

### `seedRenderIds` — the residual is named and quantified, and the seed has no source

With the classifier corrected (below), the corpus residual decomposes completely for the first time:

| cause | slides |
|---|---|
| generated ids | **87** |
| `cat-N` (categorical hue) | 5 |
| progress rail absent | 5 |
| **unclassified** | **0** |

**51 of those 87 were reading `unclassified`.** The cause buckets knew one generated-id family — the
`<svg>` title/desc wiring, `lat-svgt-N` / `lat-svgd-N` — and not the five chart `<defs>` gradient
families in `render-ids.js`, so a slide whose entire difference was two counter offsets fell through
whenever both moved together. `gantt-fill-pass-N` is the shape that proves the point: callers own
their id TEMPLATE, so the family name is a *prefix* of the id and a pattern anchoring `-\d+` straight
to it matches nothing. The list is duplicated (the core takes no imports; `render-ids.js` is CJS) and
a test now reads both sources and fails if they diverge — watched fail by adding a sixth family.

The 5 `progress rail absent` are `examples/state-chart.md`, and they are correct: a slide shows
`` `<!-- _class: divider -->` `` in an inline code span, so the deck's divider count reads
differently with and without code blanked, `deckSectionFor` hits its fail-safe, and the Studio sends
that deck down the whole-deck route via the `ambiguous divider count` registry entry. The sweep
renders every slide as a slice regardless — that is what makes its number the *residual* — so the
difference is real for the sweep and absent for the user.

**Why the repair is not written here.** Both families number from the document start, so the slice
needs to know how many named `<svg>`s and how many chart gradients the PRECEDING slides emitted.
That count is not caller-held metadata like `slide k of N` is: it is a property of what the chart
kernels produced, derivable only by rendering the earlier slides — which is the whole-deck parse the
slice route exists to avoid. Four routes exist and three are closed:

| route | verdict |
|---|---|
| caller supplies the offsets | the caller would have to render the deck to know them — **circular** |
| predict the svg count from the markdown | re-derives engine semantics, which this design has refused throughout |
| rewrite the slice's ids after the fact | needs the same unknown offset — **circular** |
| fold the slide's position into the id (`lat-svgt-<slide>-<n>`) | **works, and changes exported bytes** |

Only the fourth is sound, and it changes the shape of every generated id on every render path,
including the HTML export. That is the QUALITY BAR's one hard stop, so it is **not taken
unilaterally** — and it should be argued on its merits rather than waved through, because the case
for it is weaker than it first looks:

- **The difference is invisible and each document is self-consistent.** A preview whose chart is
  wired to `lat-svgt-1` announces correctly; so does the export's `lat-svgt-4`. Nothing reads across
  the two.
- **The composition case it would serve is already spoken for.** `render-ids.js`'s own KNOWN LIMIT
  says that composing separately-rendered sections needs an assembly-time re-uniquing pass — the
  shape `svgA11yNames.uniquePrefix` already implements. That pass fixes collisions without any
  seeding; seeding does not remove the need for it.
- **Both id namespaces carry anti-squat guards that key on the id SHAPE**, and each has been broken
  twice by exactly that kind of change (`uniquePrefix` by a decoy-token loop and by an
  entity-encoded id; `renderIdPrefix` was written against those two lessons). Changing the shape
  means re-earning both guards against their documented attacks.

**Decision: the fourth route was taken, on the human's call.** Ids are now scoped by the shown
slide's ABSOLUTE deck position — the same `page.offset` the page number already rides on:

```
lat-svgt-1   ->  lat-svgt-<slide>-<n>       (svg-a11y-names.js)
pie-wedge-1  ->  pie-wedge-<slide>-<n>      (render-ids.js, all five families)
```

`<n>` restarts within each slide, so section *k* of a deck render and a slice rendered at offset *k*
mint the same strings. Uniqueness within a document is preserved by construction (slide × ordinal),
which is the trap the whole module exists for. `nextRenderSeq` returns a STRING rather than a number
so every call site keeps its template verbatim and the shape stays readable in an export diff — the
reason these were ordinals and not hashes in the first place.

Two plumbing points:

- `applyToRenderedHtml` counts **every** top-level section, not just the chart-bearing ones. Counting
  only the interesting ones would number them 1,2,3… and a slice would land on a different slide than
  the deck did.
- `svgA11yNames.applyToHtml` probes for its unique prefix over the WHOLE document (an author's
  squatting `id` can live on any slide) and only then walks section by section. A section-less
  fragment keeps the old bare ordinal — there is no slide to scope by, and inventing one would be a
  guess.

**Result: 91.9% → 99.2%.** The `generated ids` bucket goes 87 → 0. What is left is the 5 `cat-N`
slides and the 5 rail slides, both explained above.

### What the export change actually was, measured over the WHOLE blast radius

The first pass measured one deck and generalized. It was re-measured over the exact set of decks
that mint one of these ids — computed by rendering all 127 committed decks and keeping the ones
whose HTML contains a generated id: **27 decks**. Each was rendered from `origin/main` and from this
branch on the same machine, then compared page by page:

| | result |
|---|---|
| decks compared | **27** (every deck that mints a generated id) |
| pages pixel-compared | **386** |
| decks with any pixel change | **0** |
| total changed pixels | **0** |
| exported HTML: byte-identical | 0 |
| exported HTML: differs ONLY in the generated id strings | **27** |
| exported HTML: differs in anything else | **0** |

`pdftoppm -r 60` + ImageMagick `compare -metric AE`; the id-only test normalizes every family's
discriminator and re-diffs. PDF *bytes* differ, but they differ between two runs of the *same* code
too (Chromium stamps a document id and a timestamp), so bytes are not the instrument here — pixels
are. `examples/chart-legends.md` was additionally rendered in **dark** (`indaco-dark`): 0 changed
pixels across its 8 pages there too. Sent for sign-off before merge, per the QUALITY BAR's export
rule.

Two more claims that had been reasoned rather than measured, now measured across the same corpus:

- **id uniqueness** — 1762 ids across 127 rendered decks, **0 duplicates**. Slide × per-slide
  ordinal holds on real content, not just on the synthetic fixtures.
- **the two section walkers** — `sectionsOf` (which `narrowToSlide` now uses, so that the alignment
  guard judges the list it is actually handed) against the filmstrip's `splitSections`: 1230
  sections across 127 decks, **0 disagreements**.

### The two anti-squat guards, re-earned rather than assumed

Both id namespaces carry a guard against an author (or, in the Studio, an untrusted shared deck)
declaring the id the engine is about to mint. Each has been broken twice by a change that looked
unrelated to it, so neither was taken on trust:

- **`uniquePrefix` (svg-a11y-names).** New test squats `lat-svgt-2-1` — the shape the engine now
  mints — in both the literal and the entity-encoded spelling. Watched fail: disabling the probe
  turns it red, along with the pre-existing decoy-token and steal-the-name cases.
- **`safePrefix` / `renderIdPrefix` (render-ids).** The end-to-end squat fixture had gone VACUOUS: it
  squatted `pie-wedge-1`, which the new shape can no longer collide with, so its duplicate-id
  assertion would have passed with the guard removed. The fixture now squats `pie-wedge-2-1` and
  `pie-wedge-2-2` — exactly what its chart slide mints — and disabling the namespace shift reports
  `render 1 has duplicate ids, so the squat landed: pie-wedge-2-1, pie-wedge-2-2`.

Plus a third mutation on the repair itself: disabling `setRenderSection` moves `equiv:check` 99.2% →
95.3% and fails. All three falsifications from Amendment 4 still fire against the re-blessed
baseline, harder than before: `positionIsTrustworthy → false` reads **10.5%**, and `deckSectionFor → undefined` reads **73.3%**
(re-derived after both re-blesses; the first cut of this paragraph quoted 10.3/73.1 against the
superseded 1201-slide corpus and did not reproduce).

**The browser DOM path is deliberately untouched** — but saying so was not the same as it being
true, and checking it turned up a defect. `applyToDom` never enters slide scope, so its ids keep the
bare document-start ordinal they have always had. That is true of the DOM path itself and was false
of the process it runs in: `slide` is MODULE state, `applyToRenderedHtml` set it per section, and
nothing released it. Measured:

```
eng.render(<two-section deck>)
nextRenderSeq('pie-wedge')   ->  "2-3"      // wanted "1"
```

So the next mint after any render inherited the LAST section number of the document before it. Not
observed as a live defect — the preview iframe is a separate realm, so the runtime's copy of the
module starts fresh — but it is a trap of exactly the class this module's own KNOWN LIMIT 2 records:
per-render state is safe only if it is RELEASED, not merely set. `applyToRenderedHtml` now leaves
scope after its walk, guarded by a unit test that drives the real engine and was watched fail
against the missing release.

Worth naming as a pattern: every claim in this section that was *reasoned* rather than *measured*
turned out to hide something — the one-deck pixel generalization, the id-shape coupling in
`reidClone`, and this. The ones that were measured did not.

### What the id change broke, and what it turned up — found by CI, not by review

The unit tier, `build:check`, the docs suite and `equiv` were all green; the **integration** tier was
not. `test/integration/invariants/axe-a11y.test.js` failed on the `--player` shell with
`duplicate-id-aria (critical, 14 nodes)` quoting `<title id="lat-svgt-80-1">`.

**The cause was a shape-matching regex, and it failed in the worst available direction.** The
Read·Article view re-hosts every chart by cloning it into a second copy of the same document, and
`reidClone` (`lib/transformers/prose-projection.mjs`) moved the copy's ids aside by matching what an
id LOOKS like — `/lat-(?:x\d+-)?svg[td]-\d+/`. Slide scoping made ids `lat-svgt-80-1`, and the
function's two halves then disagreed with each other:

| half | pattern | on `lat-svgt-80-1` |
|---|---|---|
| the definition | `id="(lat-…svg[td]-\d+)"` — anchored by the closing quote | **no match**, id left in place |
| the reference | `MINTED.test(ref)` — unanchored | matches `lat-svgt-80` **inside** it, suffix appended |

So the clone kept a duplicate `<title id>` *and* pointed its `aria-labelledby` at an id that existed
nowhere — a chart with no accessible name, which is worse than the duplication the function exists to
prevent. Counted on the real player build of `gallery.md`: 14 duplicated ARIA ids and 14 dangling
references, against 0 of each on `main`.

**Fixed shape-agnostically**, because the defect is the shape-matching itself: collect the ids the
cloned subtree DEFINES, suffix those, and rewrite every reference to them. Nothing in it knows what an
id looks like, so the next shape change cannot reach it.

**And it turned up a defect that predates all of this.** The same clone also carries the chart's
`<defs>` gradients, which `reidClone` never handled at all — **45 duplicated ids in the shipped
player, on `main` today**. The axe gate could not see them: `duplicate-id-aria` inspects only ids used
in ARIA, and a gradient is referenced through `url(#…)`. They resolved correctly purely by luck, since
SVG's first-def-wins rule happened to land on an identical gradient — exactly the "correct by luck"
this function's own header objects to. Rewriting `url(#…)` was the same line of the same function, so
it was fixed in place rather than logged (HARD RULE #18, on-path). The player goes 45 → 0.

| | duplicated ids | dangling ARIA refs |
|---|---|---|
| `main` | 45 | 0 |
| this branch, before the fix | 59 | 14 |
| this branch, after | **0** | **0** |

**Two things worth keeping from this.** First, an id-shape change has a blast radius beyond the
minter: anything that PARSES those ids is coupled to the shape, and grep for the shape rather than for
the module. Second, the axe gate found the half that ARIA could see and was structurally blind to the
half it could not — a green a11y gate bounds what the rule set inspects, not what is correct.

---

## Amendment 5 (2026-08-03): what the adversarial trio found, after everything else was green

Every machine gate was green, CI was green, the export delta was measured over 27 decks and 386
pages, and eight Studio e2e specs had been run by hand. The trio (HARD RULE #25 — red team, Munger
inversion, independent checker, all on Opus, all pointed at `origin/main...HEAD` rather than at a
draft) then found **nine** things. Two would have shipped broken. This section exists because the
pattern is more useful than the list.

### The one that would have shipped a wrong number on a real deck

`positionIsTrustworthy` counted heading splits with an ATX-only `^#{1,2}` scan. **Setext headings
split too**, and are invisible to it:

```
# Cover                          caller chunks:   3
                                 engine sections: 4
---                              positionIsTrustworthy: TRUE

# Alpha                          whole deck paints:  1 | 2 | 3 | 4
                                 slice 2 (offset 2): paints "3"      <- the deck says 4
Interlude                        slice 1:            paints "2 3"    <- two sections, one-slide frame
=========
```

That is the "plausible lie … strictly worse than the bug being fixed" this note names as the bar,
produced by ordinary markdown. Three siblings came with it: an underline of `-` (which is a setext
h2 to markdown-it and a *slide separator* to the caller — the two disagree about the same three
characters), ATX indented 1–3 spaces, and a `---` inside an HTML comment.

**Refused rather than counted.** Whether an underline is a heading depends on the paragraph above it
— that is a parse, not a scan, and this function's whole contract is to fail closed when it cannot
be certain.

**And the fix's own first cut silently disabled the feature.** The comment check used a lazy
`[\s\S]*?`, which spans an intervening `-->`, so `<!-- _class: a -->` … `\n---\n` …
`<!-- _class: b -->` matched as one comment containing a separator — **126 of 128 decks refused**,
the whole optimization off, every test still green. Caught only by measuring the corpus impact of
the fix rather than trusting the battery of counterexamples. Now: 125 trusted, 3 refused, and the 3
are exactly the genuinely misaligned decks.

### The one where the comment claimed the opposite of the truth

`reidClone`'s rewrite says *"Nothing here knows what an id looks like, so the next shape change
cannot reach it."* Decoupled from the id *shape*, yes. Still coupled to its *serialization*, and
seven reference forms had their definition renamed and their reference left behind — confirmed on a
real `--player` export, `style="fill:url('#bar-grad')"` pointing at the slide's copy:

| form | first cut |
|---|---|
| `url('#g')`, `url("#g")`, and the entity-serialized `url(&quot;#g&quot;)` | **dangled** |
| `<use href>`, `<textPath href>`, `xlink:href`, `<a href="#…">` | **dangled** |
| `label for`, `aria-controls` / `-owns` / `-flowto` / `-details` / `headers` | **dangled** |
| an id containing `)` | **dangled** — `[^)"'\s]+` stops at the first paren |

Fixed by naming the IDREF attributes explicitly and driving `url(#…)` from the *known id set* rather
than from a pattern for what an id looks like. What is still **not** covered is now stated rather
than claimed away: an id selector inside a `<style>` (mermaid scopes its whole stylesheet by the
svg's root id that way), inert only because the shared sanitizer lists `style` in `FORBID_TAGS`.

### Two demonstrated exploits, both pre-existing, both on the HARD RULE #22 surface

Fixed in place because both live in files this change already rewrites.

- **`uniquePrefix` is defeated by an UNQUOTED attribute with numeric character references.**
  `<span id=lat&#x2d;svgt&#x2d;2&#x2d;1 hidden>` carries no literal `lat-svg` (the raw-text test
  misses) and is unquoted (the id-attribute scan misses), yet parses to exactly the id about to be
  minted and wins by tree order. Demonstrated on a **real Chrome accessibility tree**: the chart
  announced *"Deloitte audited and approved"* with a pixel-identical render. Fixed with the shape
  `safePrefix` already used — decode the whole text, not only the values a quote-aware scan finds.
- **`safePrefix`'s `\d{1,9}` cap returned the one candidate it could not see.** Mention
  `lat-r999999999-` and `max+1` yields `lat-r1000000000-` — ten digits, invisible to the same probe.
  Squat it and first-def-wins paints the real chart's wedge with the author's fill while the legend
  reads correctly. Its header's claim "never return a candidate that was not itself tested" was
  false for exactly that candidate.

### Three defects in this note's own instruments

- **A raw NUL byte** was committed into `lib/core/render-ids.js` (from a `\0` Map separator written
  as a literal). It makes the file **binary to grep/ripgrep** — so `rg nextRenderSeq lib/`, the
  command this module's own comment tells maintainers to run, silently omits the file that defines
  it — and it renders as a space in a diff, so review cannot see it. The author's own grep output
  had said `binary file matches` and was walked past. Now written as an escape; NUL is still the
  right separator, only the encoding changed.
- **The re-earned squat fixture went vacuous again, with a shorter fuse.** It hard-coded
  `pie-wedge-2-1` "because the chart lives on slide 2", so adding one slide moved the engine to
  `3-1`, the squat stopped colliding, and the duplicate-id assertion would pass with the guard
  removed. The *previous* fixture rotted when the id shape changed (rare); this one rotted when
  anyone edited the deck (routine). It now harvests the ids from a real render and squats those.
- **`svgA11yNames.applyToHtml` silently narrowed.** Moving to a per-section walk stopped naming any
  `<svg role="img">` outside a top-level section — the unnamed-graphic defect the module exists to
  prevent. Inert (no committed deck has one) and untested. Restored, with one shared counter across
  the gaps because the first restore gave two out-of-section graphics the same id.

### The claim in this note that was half true

**`positions` is a tautology.** The sweep skips any deck where `sections !== chunks`, and that is
exactly the condition under which `positionIsTrustworthy` refuses — measured: of 128 decks, the
three the sweep skips are the three it would refuse, and **no measured deck is ever refused**. So
`positions === slides` by construction.

The consequence is sharper than the redundancy. Every falsification in Amendment 4 pushes the supply
path toward **fail-closed**, and those collapse the rate by 24–89 points. The opposite mutation —
`positionIsTrustworthy → return true`, the one that produces the plausible lie — moves it **0.0
points**, because every deck that would expose it is already skipped. "The sweep can fail" is true
in the direction that is safe to be wrong about and false in the direction that isn't. Stated here
rather than fixed: closing it means measuring the 1→N decks instead of skipping them, with
`refusals` as a baseline field, and that is a change to the instrument's shape.

### The pattern

Nine findings. Every one landed on something *reasoned* rather than *measured* — a comment asserting
completeness, a fixture whose coupling was a sentence, a claim about a direction nobody had mutated.
Nothing the trio attacked that had a number behind it moved: the pixel sweep, the ids-only HTML
delta, id uniqueness, the walker equivalence and the `nextRenderSeq` type change all reproduced
exactly under independent re-derivation.

The second-order lesson is about the fixes, not the defects: the comment-spanning regex, the
duplicate-id-across-gaps bug, and three separate wrong assertions in the verification scripts were
all introduced *while fixing* the trio's findings, and all were caught by measuring the fix rather
than by reading it. A fix is a change like any other.
