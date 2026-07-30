---
status: proposed
summary: >
  Every Studio preview printed "1" as the page number because the engine numbers a slide by its
  ordinal position among the sections of the document it parses, and the previews handed it one
  sliced-out slide. The number was the only symptom loud enough to notice: the same slice was also
  dropping inherited running-global directives and the deck-scoped progress rail. Fixing it by
  rendering the deck and displaying one section made navigation faster (10.2 -> 5.8ms) and typing
  slower (9.0 -> 20.2ms prose, 10.6 -> 57.1ms gallery), because the preview's cost now scales with
  the whole deck's content rather than the shown slide's. Along the way: render() turned out not to
  be a pure function of its input (module-level chart <defs> counters, 48 of 112 decks differing on
  a second render), which is the precondition for any render cache's incremental-equals-whole guard;
  the markdown-it parser is now reused across renders (a fixed ~0.3ms, large on a one-slide render,
  negligible on a 40-slide one); and structural gating is shown viable against 901 slides in 109
  decks, ~99% mechanically reconcilable with a ~1% bail set. Memory: +1.4MB settled, lower growth
  under use, 6.6MB cheaper for the overview grid, and flat under deck churn. Also records three
  claims of mine that the measurements refuted, and four off-path defects logged not fixed.
---

# Deck-context preview renders — correctness, cost, and what the measurements actually said

**Status:** steps 1–2 landed on `claude/studio-preview-pagination-8tpodq`; step 3 (structural
gating) designed and shown viable, not built. **Date:** 2026-07-30.

This note exists because the investigation produced several findings that are more valuable than
the patch that prompted them, and because three of my own claims along the way were wrong in ways
worth recording so nobody re-derives them.

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
`___`, `- - -`, `---` with trailing spaces), while the Studio's `SEP_RE` matches only a bare
`\n---\n`. The result was the preview painting a *different slide* than the one selected — worse
than the wrong number, because a wrong number is visibly wrong and a wrong slide is plausibly
wrong.

**The root cause is two independent slide splitters.** The shipped guard fails closed around the
divergence; it does not reconcile it. Reconciling them is the follow-up I would rank above further
performance work, because it is the defect generator.

## 3. `render()` was not a pure function of its input

Several chart kernels mint SVG `<defs>` ids from sequences whose purpose is uniqueness *within* a
document. They were **module**-level — process-scoped, not render-scoped — so they climbed across
calls: **48 of 112 committed decks produced different bytes on a second render in one process**
(`gantt-fill-pass-1` → `-2`, `pie-wedge-1` → `-6`, `radar-area-1` → `-4`). Nothing broke visibly,
because an id and the references to it are minted together. One comment rested the design on "one
Node process per deck", which stopped being true when the docs site began rendering many times per
page.

Fixed by one render-scoped kernel (`lib/core/render-ids.js`) reset per render. **Exported bytes
unchanged**, verified by hashing the first render of 31 decks in fresh processes before and after.

**Why it is load-bearing rather than tidy:** byte-determinism is the *precondition* for caching the
render at all. `2026-07-15-incremental-per-slide-render-cache.md` guards its whole design with an
`incrementalRender === wholeRender` property test, and that test cannot be written against a
non-deterministic renderer — it fails spuriously, and the obvious repair is a normalizer that also
hides the drift it exists to catch. Every equivalence measurement in §5 below became possible only
after this fix.

## 4. The performance model — and three claims I got wrong

**The cost axis is CONTENT, not slide count.** `main`'s typing barely moves between a 40-slide
prose deck and 40 gallery slides (9.0 vs 10.6ms) because it rendered one slide. Deck context makes
the preview's cost scale with the **whole deck's content**: 20→57ms at the same slide count.

Measured on the real built Studio at 4× CPU by `docs/e2e/studio-preview-perf.spec.ts` (committed,
tagged `@perf`, in no project's grep so it never gates a PR), TOTAL p50:

| interaction | deck (40 slides) | main | deck context |
|---|---|---|---|
| navigation | prose | 10.2ms | **5.8ms** |
| navigation | gallery | 11.7ms | **6.7ms** |
| typing | prose | 9.0ms | 20.2ms |
| typing | gallery | 10.6ms | 57.1ms |

Navigation is *faster* than before, because the previous code re-rendered a slide every time and a
single-entry whole-deck memo makes navigation a cache hit. Typing is worse, and the memo cannot
reach it: the markdown changed, so it misses by construction.

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
resolution, the slide pipeline, math, the Mermaid grammar and 15 plugins on *every* render. That is
a fixed ~0.3ms, so memoizing it is large proportionally on a small render (one slide: 0.44 →
0.15ms, 2.9×) and nearly nothing on a large one (the Studio's 40-slide render: 20.2 → 18.7ms). I
presented the 2.9× as a preview number. **Its value is unlocked *by* structural gating, not
independent of it.**

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
across **901 slides in 109 decks**:

| class | share | resolution |
|---|---|---|
| pagination attrs + positional `id` | ~76% | re-stamp from the cached position |
| `<defs>` id sequences | ~12% | **seed** the sequences — a direct payoff of §3 |
| progress rail absent | ~14% | inject from the deck-wide divider count |
| **genuinely semantic** | **~10 of 901 (~1%)** | bail to whole-deck |

The ~1% is divider slides and the watermark glyph — both driven by running divider counts, both
visible in the markdown, so both cheaply detectable for a bail. **~99% is mechanically
reconcilable.** Because the id sequences are now render-scoped and resettable, `resetRenderIds()`
can become `seedRenderIds(offsets)` so a slice render emits deck-correct ids directly rather than
needing a post-hoc rewrite.

**Ceiling, stated plainly:** typing must re-render the edited slide, so no design does less work
than one slide render. Structural gating reaches **parity** with `main`, not better; the parser
memo is the only thing that goes below that line, and it is worth ~0.3ms. If parity is not
acceptable, the different-in-kind option is moving the render off the main thread (a worker), which
decouples typing latency from render cost instead of shrinking it.

## 6. Memory cost

Measured in the real Studio with GC forced before each reading, 40-slide gallery deck:

| | main | deck context | Δ |
|---|---|---|---|
| settled after first paint | 17.18MB | 18.60MB | **+1.4MB** |
| growth over 40 navigations | +7.30MB | +6.53MB | −0.77MB |
| overview grid (22 frames) | +20.00MB | +13.40MB | **−6.6MB** |
| deck-churn, 6 alternating decks | — | 18.53 → 18.55MB | **+0.02MB** |

Node-side retention: the parser memo holds **0.44MB** (one markdown-it + 15 plugins); a deck memo
entry is **48KB** at 40 slides and **285KB** at 117; a whole-deck render allocates ~0.55MB of
transient garbage that GCs cleanly (0.83MB after 20 renders, i.e. noise). The memo's `css` field is
the *same string instance* the theme store already memoizes, so it costs a pointer, not the ~563KB
sheet.

**The churn row is the one that matters.** Alternating two different decks across six reloads makes
every render miss and replace the entry; the heap is flat to 0.02MB. A map-shaped cache or a
retained-realm leak climbs there. Given `2026-07-17-preview-accumulation-leaks.md`, bounded is a
property to demonstrate, not assert.

Roughly half the +1.4MB is attributable (parser memo, memo entry, the whole-deck source strings the
Studio now holds); the remainder is not decomposed, so it is recorded as **observed** rather than
explained. It scales with deck size but stays bounded at one entry.

**Net:** +1.4MB fixed, lower growth under use, and the overview grid materially cheaper.

## 7. What to preserve from this branch

Independently valuable, regardless of what happens to the pagination fix:

1. **`lib/core/render-ids.js` + determinism** — a correctness fix, and the precondition for every
   caching design. `test/unit/core/render-ids.test.js`.
2. **The parser memo** — a real saving on every render path, largest where the render is small.
   `test/unit/engine/parser-memo.test.js`.
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
- **The flat `splitSections` in `docs/src` is the weaker of two existing walkers.**
  `lib/core/split-sections.js` is depth-aware ("survives nested sections") but is CJS and not
  exposed on the browser engine bundle, so the preview detects-and-degrades instead. Exposing that
  kernel is the proper fix.
