---
status: shipped
summary: >
  The engine breaks a slide on every top-level markdown-it `hr`; every caller-side splitter in the
  tree derived that set from its own regex over `---`, and each derived it differently. Measured
  against the real parser, SIX separator forms split for the engine and not for the callers (`***`,
  `___`, `- - -`, `--- ` with a trailing space, `----`, and a `---` indented one to three spaces),
  while a setext underline and four masked contexts split for the callers and not for the engine.
  The consequences had reached humans three times, and the third was silent data loss: `slideCount`
  read 1 where the engine renders 2, so a chat edit addressed to slide 1 overwrote the whole deck
  and the app reported success. `lib/core/slide-boundaries.mjs` is now the one derivation and it
  CALLS THE PARSER — `md.block.parse` on the engine's own configured markdown-it, memoized per
  source. Seven caller-side splitters read it. The first cut of this note argued for a hand-written
  line scanner instead; the adversarial trio took that apart, and this note keeps the record because
  the failure was structural: six confirmed wrong answers behind a `certain: true` flag, a
  differential fuzz whose PRNG had collapsed to 3,736 distinct decks, and a cost table measuring the
  wrong function by 6x. Also records the O(n^2) in `math-block-rule.js` the redesign surfaced, and
  four defects found in the author's own instruments. A FIFTH splitter surfaced on the way — the
  shared class-directive reader, whose own pairing test caught the break — and it is reconciled
  through the same derivation.
---

# The two slide splitters, reconciled — by asking the parser

**Status:** shipped, 2026-08-05. Closes item 1 of #1271; follows
`2026-07-30-preview-deck-context-and-render-cost.md` (§2, Amendment 4).

---

## 1. What was actually wrong

The engine derives a slide boundary from a **top-level markdown-it `hr` token**
(`splitOnHr`, `lib/engine/slides.js`). Every caller-side splitter derived it from a regex over
`---`. Measured against `lib/core/boundary-parser.js` — the markdown-it instance configured the
way the engine configures its own:

| deck body | engine | `/^---$/m` | `/\r?\n-{3,}\r?\n/` |
|---|---|---|---|
| `# One` · `---` · `# Two` | 2 | 2 | 2 |
| `# One` · `***` · `# Two` | **2** | 1 | 1 |
| `# One` · `___` · `# Two` | **2** | 1 | 1 |
| `# One` · `- - -` · `# Two` | **2** | 1 | 1 |
| `# One` · `--- ` (trailing space) · `# Two` | **2** | 1 | 1 |
| `# One` · `---` + tab · `# Two` | **2** | 1 | 1 |
| `# One` · `----` · `# Two` | **2** | 1 | 2 |
| `# One` · `  ---` (indent 2) · `# Two` | **2** | 1 | 1 |
| `# One` · `--- -` · `# Two` | **2** | 1 | 1 |
| `Interlude` · `---` (no blank line) | **1** | 2 | 2 |
| a `---` inside `$$` math · a `<div>` · an HTML comment · a fence | **1** each | 2 | 2 |
| `the plan`U+2028`---`U+2028`v2` | **1** | 2 | 1 |

`#1271` named four forms. Measuring found **eight** in the forward direction, and the reverse
direction is not one case but five — the setext underline plus four masked contexts. U+2028 splits
the two *caller-side* splitters from **each other**: JavaScript's `^`/`$` under the `m` flag treat
it as a line terminator, `String.split('\n')` does not, and `docs/src/lib/normalize-source-text.ts`
folds CRLF and BOM but not U+2028.

## 2. Why it mattered more than a miscount

Three consequences had already reached a human, and they get worse in order:

1. **The wrong slide painted** (#1265) — an authored-slide index used to index engine sections.
2. **The editor↔preview off-by-one** (§7b) — a different mechanism, same shape.
3. **A slide destroyed, and reported as applied.** Reproduced on `main`, on all seven forms:

```
deck:  # Slide One  ·  "--- " (trailing space)  ·  # Slide Two
engine renders 2 sections;  slideCount() returns 1

applyEditChecked(deck, { action: 'replace', slide: 1, body: '# Rewritten' })
  -> { ok: true }   -> renders as 1 section: "Rewritten"
```

## 3. The design: call the parser

`slideBoundaries(body)` runs `md.block.parse` on `lib/core/boundary-parser.js` and keeps the
top-level `hr` tokens' line numbers. That is the whole derivation.

**Why block-parse rather than a full parse.** A slide boundary is a block-level property and
inline parsing cannot move one. Asserted rather than assumed: the test compares the two token
streams over every committed deck and over a generated corpus.

**The cost, measured honestly** (p50 over 400 runs after 300 warmups):

| deck | `slideBoundaries` (block parse) | a bare line scan | delta |
|---|---|---|---|
| median committed deck (4KB) | 0.039ms | 0.023ms | +0.016ms |
| `legal.gallery.md` (22KB) | 0.511ms | 0.217ms | +0.294ms |
| `gallery.md` (58KB, the largest in the tree) | 1.256ms | 0.714ms | +0.542ms |

Against an ~8ms typing budget, memoized to one parse per source string. That is the entire price
of exactness.

**What it buys.** The derivation cannot disagree with the engine about a boundary, because it is
asking the engine's own parser. There is no rule to keep in sync, no `certain` flag to get wrong,
and no residual class for a future fuzz to discover.

**One rule is still shared rather than derived**: `splitOnHr` drops its first token group when that
group is empty, so a body opening with a separator renders N sections from N+1 chunks.
`dropLeadingEmpty` is that rule, exported once, because two index spaces need it. It keys on the
TOKEN stream, not the text — a link reference definition is real source that produces no tokens, so
`[a]: /url` over a separator renders one section, and a `chunk.trim() === ''` test gets it wrong.

## 4. The design this replaced, and why the record is kept

The first cut was a hand-written line scanner reproducing markdown-it's `hr` rule without parsing —
750 lines, a `certain` flag for shapes it could not settle, and a differential test pinning it to
the parser. Every machine gate was green: unit 5474, integration 687, `build:check`, lint, docs
2638, plus a real-Studio e2e at 9/9 with a 7/9 negative control.

**The adversarial trio (HARD RULE #25) found six confirmed wrong answers, every one
`certain: true`:**

| shape | scanner | engine | the rule it missed |
|---|---|---|---|
| `- Revenue` · `- ` · `  ---` | no boundary | **boundary** | an EMPTY list item cannot interrupt a paragraph |
| `Next steps:` · `2. second` · `---` | boundary | **none** | an ordered list not starting at 1 cannot interrupt |
| `\| M \| V \|` · `\|---\|---\|---\|` · row · `---` | boundary | **none** | a column-count mismatch is not a table |
| `[]: /url` · `---` | boundary | **none** | an empty label invalidates the definition |
| `-\tfoo` · `    ---` | boundary | **none** | a tab after a marker sets a different content column |
| a body opening with a separator | chunk/line desync | — | the two index spaces disagreed by one |

The first destroyed a slide under `{ok: true}` — the exact defect the module was written to end.
The last was a **regression against `main`**: an `applyEditChecked` replace INSERTED instead of
replacing, duplicating slide one.

**Three failures in the author's own instruments made that possible, and they are the durable
lesson:**

- **The fuzz's PRNG had collapsed.** `seed = (seed * 1103515245 + 12345) & 0x7fffffff` overflows
  `Number.MAX_SAFE_INTEGER`; the low bits round away and the generator's period falls to 10,466.
  Across 12 seeds × 60,000 rounds it drew **3,736 distinct decks**. The headline "720,000 decks,
  zero disagreements" was a statement about 3,736 samples — false by ~193x. Under a sound PRNG the
  *same atom list* surfaces real defects.
- **The atom list was the author's intuition, not CommonMark's rule surface.** It held `1. ordered`
  and no other ordered marker, so the largest defect class was unreachable by construction.
- **The cost table measured the wrong function.** The "line scan: 0.037ms" row timed a bare
  `/^-{3,}$/` loop, not the scanner. The scanner was 0.217ms on that deck — 5.9x — and the module's
  own guard comment contradicted the table by the same factor.

Two ReDoS "hardening" guards were also added on a **misdiagnosed** CodeQL alert: the alert list was
readable from the check-run annotations endpoint the whole time, and the real finding was
`js/bad-tag-filter` on the comment terminator, not ReDoS. Those guards went with the scanner.

**The pattern, stated plainly: every one of these was reasoned rather than measured, and the
verification apparatus inherited the same blind spots as the thing it verified.** A differential
test is only as good as its oracle *and* its generator; this one had a sound oracle and a dead
generator, and reported confidence.

## 5. How it is verified now

`test/unit/core/slide-boundaries.test.js` **changed its oracle**, because the old one went vacuous
the moment the module became the parser — comparing a function to itself is green by construction.
The oracle is now **the number of `<section>` elements the engine actually renders**: it runs the
whole engine, including the `split: headings` ruler and every plugin.

1. The divergence matrix, each case asserted against the real render.
2. The six shapes the scanner got wrong, pinned individually — the regression record survives the
   design that produced it.
3. Every committed deck (279), asserting `md.block.parse` and a full `md.parse` name the same
   boundaries.
4. A seeded fuzz over 70 atoms drawn from CommonMark's rule surface, **with a mulberry32 PRNG and
   an assertion on the generator itself** — it fails if fewer than 90% of rounds are distinct, so a
   collapsed generator can never again read as confidence. Measured: 99.8% distinct.

Independently, over 1,000,000 generated decks across 5 seeds (997,780 distinct): **zero
disagreements**.

## 6. What the redesign surfaced: an O(n²) in the engine

The parser-backed path made a pre-existing engine defect impossible to ignore.
`lib/core/math-block-rule.js` scanned to end-of-input for a `$$` closer on **every** opener, so a
document of unclosed `$$` lines was quadratic. It was never a scanner problem — `engine.render`
paid it too:

| input | markdown-it without the rule | with it | `engine.render` |
|---|---|---|---|
| `'$$a\n\n'.repeat(20000)` (100KB) | 13ms | **12,277ms** | **11,600ms** |

Fixed by recording the first line from which no closer exists: the scan only ever looks forward, so
if none follows line L, none follows any later line either. The record lives on the per-parse
`state`, so it cannot leak between documents. After: **24ms** for the boundary parse, 109ms for the
full render. Output is unchanged by construction — the short-circuit only skips a scan that would
have failed.

## 6b. A fourth splitter, found by its own contract test

`lib/core/class-directive-scan.mjs` (#1383) answers "which class governs this slide?" for the deck
linter, the reviewer, the scorecard, the fact-checker and the editor's autocomplete. It was not on
the list of caller-side splitters because it is not one — but it walks lines, and it had to know
where a slide begins, so it carried a fifth `/^---$/`.

Its contract is that it indexes **exactly** like `splitTopLevel`, because every consumer pairs the
two arrays positionally (`slides.forEach((slide, i) => directives[i])`). Moving `splitTopLevel` onto
the parser broke that pairing, and its own test caught it — the one place in this change where a
committed test found a regression before a human did.

The two readers had been agreeing on a shape neither the engine nor CommonMark has: a `---` written
**inside a multi-line HTML comment**, which is what commenting a run of slides out looks like. The
engine sees one `html_block` and does not split; both readers split, and the module's header said so
in as many words, deferring the fix on the grounds that correcting the splitter would move every
finding's `slide` number. This change is that correction, so the deferral expired with it.

Fixed by giving the walk its boundaries rather than letting it derive them: `chunkBoundaryLines`
(the full-source, front-matter-inclusive line-space spelling of `splitSlideChunks`) is now read by
`splitTopLevel`'s line analog **and** by the class scan, so the pairing is structural. The scan also
inherits the eight separator forms — on a deck using any of them, every slide after the first one
was previously linted, scored and completed against the wrong component's rules.

The module's stated reason for not calling the parser — that markdown-it roughly triples the browser
authoring-core bundle — no longer holds: the cores reach markdown-it anyway through
`slide-boundaries.mjs`, marked `external` there, and the bundle is 126KB against 133KB before.

## 7. Three test suites were pinning the defect

Worth recording as a class, because all three passed continuously while describing behavior the
renderer does not have.

- **`architect-edits.test.js`** and **`architect.test.ts`** built fixtures as `'body one', '---',
  '## Two'` — the separator hard against the text above it. That deck renders as **one** section.
- **`lint.test.ts`** joined its fuzz decks the same way, and its body generator could emit `***`
  while its comment claimed it could not introduce a separator.
- **`deck-doc.test.ts`** asserted "a thematic break in prose does not split the slide". `***` is a
  top-level `hr`; the engine renders two sections, the second unclassed.

The pattern: **agreement between two copies of a mistake reads exactly like correctness.** §7b of
the preview note said the same about a round-trip property; these are three more instances, and one
more arrived during the fix — `lint.test.ts`'s replacement filter asked the code under test what a
boundary was, so a false negative in the kernel would have excluded the input that exposed it. It
asks markdown-it directly now.

## 8. One user-visible normalization

Round-tripping a deck through the Studio's Write surface now **canonicalizes a non-`---` separator
to `---`**. Same render, different bytes. It follows from modeling the split at all.

`deck-markdown.ts` still serializes a horizontal rule as `***`, but the reason in its comment was
wrong and is corrected: `***` was never "an `<hr>` the separator regex can never match" — the engine
always split there. It survives as the right spelling for a rule *inside a container*.

## 9. Still open

Items 2 and 3 of #1271 — the adjacency-preserving equivalence harness, and structural gating — are
untouched. They are a separate thread with their own dependency (2 → 3).

---

## Amendment (2026-08-10) — the invariant belongs where the frame is fed, not in the fallback

#1551 walked straight through the guard this note established, and the escape route is worth
recording because it generalizes.

**What happened.** Paste a deck carrying its own `---` front-matter block below an existing one.
Front matter is only front matter at offset 0, so the pasted block is ordinary markdown: its opening
`---` becomes a thematic break, its closing one a setext underline under `header: "…"`. The engine
splits one more section than the Studio counts, `alignmentFailure` fires, and `narrowToSlide`
correctly returns `null` — every step above doing exactly what §4 says it should. The caller then
falls back to "render that one authored chunk alone", **and the chunk still contains an `hr`**. Two
sections went into a frame whose CSS and scale transform assume exactly one, so the second — the
author's actual content — sat below the fold and never painted. Rail count, page number and chunk
all agreed with each other and disagreed with the render. Silent, and content-destroying: the class
§1 was written to end.

**The near-miss.** The obvious home for the fix is the `narrowToSlide === null` branch, since that is
the route the bug report walks. That is the wrong home, and a first cut that put it there passed its
own e2e while the defect was still on screen. `wantsContext` is **false** whenever the deck does not
need deck context, and then `renderSource` is `slideMarkdown` outright — the engine renders the lone
chunk and the fallback is never entered at all. Two routes reach the frame; a guard in one of them
protects neither reliably.

So the check now sits **after every route, immediately before the frame is fed**: if a host asked for
a single slide (`slideIndex` + `slideMarkdown`) and the HTML about to be written carries more than
one `<section`, refuse. That is the same sentence §4's walker comment already states for the
whole-deck path — "never stack every section into a frame whose CSS and scale transform assume
exactly one" — applied to the surface it was always about.

**Refusing had to become audible.** `ok:false` on a `loader` host (Present, the editor preview) used
to leave the Nacre skeleton spinning forever with no message — a deterministic failure rendered as
"still loading". Trading a silently missing slide for a silently spinning one is no trade, so
`DeckPreview` now raises its failure card on a deterministic `ok:false` for loader hosts too, and
carries the renderer's reason instead of a bare "This preview couldn't render." The never-paint
ceiling stays non-loader-only: there a skeleton is honest, because the render may still land.

**Left open, deliberately.** Two things this exposes are not fixed here. (a) `splitSlides` and
`splitOnHr` still disagree about the empty leading chunk; making them agree would remove *this*
deck's mismatch, but the fallback stays reachable by other 1→N expansions, so hardening was needed
either way. (b) A stray interior front-matter block is a plausible authoring mistake, and a
`lint-core.js` rule flagging `---`-delimited YAML below offset 0 would catch it at the source — the
actionable cure, since the render fix can only refuse. Both are their own cards under HARD RULE #17.


### Correction (2026-08-10, from the maker-checker) — it is the HEADING split, not an `hr`

The paragraph above originally said the fallback failed because "the chunk still contains an
`hr`". It does not, and the correction matters because it re-aims the follow-up work.

The pasted block's closing `---` is a setext underline (stated correctly above) — and the
`<h2>` it produces is the **second heading in the chunk**, which the DEFAULT `split: headings`
ruler turns into a new section. Flip the same deck to `split: rule` and the counts agree and
#1551 disappears entirely. So the residual is not the empty leading chunk: it is that
`separatorRanges` / `splitSlides` model `hr` separators only and are blind to heading splits,
while `lib/core/bake-splits.js` and `lib/core/section-source-split.js` already use
`headingSplitPoints`.

**That blindness is also why the first cut of the guard was wrong.** It REFUSED whenever a
lone chunk rendered as more than one section, on the assumption that this only happens when
the author has erred. It usually is not an error: `split: headings` is the engine default, so
a deck written as `# Title` + two `##` with no `---` anywhere is one chunk to the caller and
three sections to the engine. Refusing painted an error card over the most ordinary deck
shape there is; `glossary: auto` (which appends a slide to every slice render) and
`_focusSteps` did the same — 3 committed decks / 8 slides, and the corpus understates it
because committed decks happen to use explicit separators. The guard now **narrows** to the
caller's section and refuses only when the markup cannot be walked at all.

Counting also moved from a `/<section\b/g` tally to `sectionsOf`: the tally counted the
string inside an HTML comment, so `<!-- <section> -->` in author content scored 2 against 1
real section and refused a working slide.
