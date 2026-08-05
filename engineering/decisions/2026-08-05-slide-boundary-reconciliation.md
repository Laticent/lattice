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
  four defects found in the author's own instruments.
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
