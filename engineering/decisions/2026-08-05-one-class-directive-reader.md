---
status: shipped
summary: "Seven modules re-spelled `/<!--\\s*_class:\\s*([^>]+?)\\s*-->/` to answer 'what class governs this slide?', and every one carried the same two defects: the running GLOBAL `<!-- class: … -->` was invisible, and with the real directive invisible a QUOTED one in prose took its place (non-global regex + `.match()` takes the first). #1383 named two of them (the deck linter and the editor's autocomplete); the sweep found five more. All six RESOLVERS now share `lib/core/class-directive-scan.mjs`, which reads both forms, resolves them by Marp's spot-replaces-global rule, and counts a comment as a directive only when it OPENS its own line, outside a fence — the shape markdown-it needs to open an `html_block`, which is what makes a quoted example prose (and it consumes a multi-line comment to its closing line, as the engine does). The grammar itself is the render pipeline's own (`lib/core/comment-directive.mjs`, moved to ESM with a CJS re-export so no `require()` site changed), so this is one more CONSUMER of that parse rather than a fourth spelling of it. The token stream (`lib/core/boundary-parser.js`) would be correct by construction and is refused with a reason: `lint-core.js` bundles for the browser under a stated dependency-free premise, and markdown-it roughly triples that bundle on a panel that lints as you type. Gated by a corpus comparison against the engine-derived `slideClassSpans` — of the 276 committed decks carrying a class directive, 274 compared (2,785 slides) with 0 disagreements and 2 skipped, both `split: headings` boundary divergences, asserted at exactly two: where the regex it replaces gets 6 slides wrong across 3 decks. The residual is named rather than glossed: slide NUMBERING still comes from `splitTopLevel`'s `^---$` rule, which diverges from the engine on 2 decks under heading-split injection."
builds-on: 2026-08-04-line-endings-lf-boundaries.md
---

# One reader for the class directive, on every surface that RESOLVES one

## The defect

`lib/authoring/lint-core.js` read a slide's class with one line:

```js
const CLASS_DIRECTIVE = /<!--\s*_class:\s*([^>]+?)\s*-->/;
```

Two things follow from it, and the second is caused by the first.

**1. The global form is invisible.** Marp has two class directives — the spot
`<!-- _class: … -->` (this slide) and the bare `<!-- class: … -->` (a running
global, in force from its slide to the end of the deck). This matches only the
spot form, so on a deck using the bare form the linter and the renderer disagree
about every slide from the directive onward.

**2. With the real directive invisible, a QUOTED one takes its place.** The regex
is non-global and used with `.match()`, so it takes the FIRST `_class:` on the
slide — which, on a slide whose real directive is the global form, is whatever the
prose happens to quote:

```
⚠ slide 1 · unknown-class [zzzz-not-a-component]
```

…off a string inside inline code, on a slide that is `content`.

**And the wrong class is not just a false positive.** The class selects the
per-component slot rules — the card-shape checks, the bodyless-item rules, the
variant vocabulary — so a slide read as the wrong component is checked against the
wrong contract in BOTH directions: spurious errors on shapes that are fine, and
silence on shapes that are not.

## Scope: #1383 named two, the sweep found seven

| Module | Question | Fixed here |
|---|---|---|
| `lib/authoring/lint-core.js` | which component is this slide? | ✅ |
| `docs/src/playground/slide-context.js` | which component is the cursor in? | ✅ |
| `lib/authoring/review-core.js` | which component / bucket per slide? | ✅ |
| `lib/authoring/scorecard.js` | which components does this deck use? | ✅ |
| `lib/authoring/fact-check-core.js` | which component is this claim on? | ✅ |
| `lib/authoring/prose-budgets.js` | *(strip only — never asks WHICH)* | ✅ widened to both forms |
| `docs/src/components/studio/present/rehearsal.js` | which component, for a timing weight? | **no — logged** |

`rehearsal.js` is the one left. It chunks with its own `parseSlides`, which strips
front matter and drops blank chunks, so its indices do not line up with
`splitTopLevel`'s and a drop-in would silently shift them. It is docs-only, it
decides a rehearsal-time multiplier and nothing else, and no render path reads it.
Aligning its chunking is a change to that module, not to this reader.

`lib/layout/bridge.js` already reads BOTH forms (`/<!--\s*_?class\s*:/g`) — it
collects every referenced library component rather than resolving one per slide,
so it asks a different question and keeps its own scan.

**One straggler is in `lib/core`, not the docs site**, and saying otherwise would
be the comfortable version. `lib/core/chart-narration.js:49` re-spells the
spot-only pattern to pick a chart's narration phrase, so a run of chart slides
declared once with a mid-deck global narrates as nothing where the spot form
narrates fully — verified against `lib/components/chart/funnel/funnel.gallery.md`.
It is pre-existing and sits on the EXPORT narration path rather than on an
authoring surface, which is why it is logged rather than swept here; it is not,
however, in `docs/src`, and the residual list said it was.

## Why a line scan, and not the token stream

`lib/core/boundary-parser.js` — one markdown-it configured from the engine's own
options — would make these readers agree with the renderer BY CONSTRUCTION, and
that is the shape that stops this bug coming back. It is refused here, with a
reason rather than a hunch:

`lib/authoring/lint-core.js` is bundled for the browser by
`tools/build-authoring-core.js`, whose premise is stated in its own header —
*"each core is dependency-free, so the bundle is its four modules and nothing
else"* (128 KB today). markdown-it roughly triples that, on the Architect/Coach
panel that lints as you type. Injecting a parser from the caller was considered and
rejected as worse: it leaves the browser path either unwired (the defect survives
exactly where it is hardest to notice) or wired to a second markdown-it copy on the
same page.

**What is shared anyway, so this is not a fourth spelling of the grammar:**

- the `<!-- key: value -->` GRAMMAR is `lib/core/comment-directive.mjs` — the same
  parse `lib/engine/slides.js` binds the engine's vocabulary to;
- the SPOT-REPLACES-GLOBAL resolution is the engine's own rule
  (`{ ...runningGlobal, ...slideLocal }`);
- the FENCE rule is the one `lib/authoring/slide-split.js` chunks with, which is
  why `slideClassDirectives` indexes exactly like `splitTopLevel` and no caller's
  slide numbering moves.

### The module format is a constraint, not a preference

The scanner is `.mjs` so the docs editor can import it as SOURCE, rather than
through a committed esbuild bundle. `docs/astro.config.mjs` says why in its own
comments: Vite serves a source CommonJS module from `lib/` untransformed, its
`module.exports` reads as no `default` export, and the importing `<script>` dies
— which is what the `*.generated.js` bundles exist to work around.

The half that is easy to miss, and that this change missed: **the rule is
transitive.** An ESM module in the docs graph may not depend on CJS *anywhere*
below it. Importing the CJS grammar from the ESM scanner passed every local gate —
`lint`, the full unit suite, `build:check`, `test:integration:pr`, the 150-render
regression gate — and failed CI four checks at once (`docs-build`, and
`studio-smoke` / `preview`, which both start the same web server, plus the `ci`
roll-up) with:

```
commentDirective is not defined
  lib/core/class-directive-scan.mjs:63
```

No local gate builds the docs site, so nothing here could have caught it. The fix
is direction, not duplication: the grammar's implementation moved to
`lib/core/comment-directive.mjs`, and `comment-directive.js` stayed as a CJS
re-export so none of the four `require()` sites in the render path changed.
**CJS may wrap ESM; ESM may not wrap CJS.** `require()` of an ES module is
unflagged from Node 22.12, which is the `engines` floor this same branch already
raised for the sibling reason.

Moving the file had a second consequence worth recording, because it is an
argument about what a mitigation IS. CodeQL re-read the whole grammar as new code
and flagged its regex `js/polynomial-redos` — a lazy `([\s\S]*?)` paired with a
greedy `\s*` before an anchored `-->$`, which splits the tail every possible way
when the anchor cannot match. That hazard was real and known: the file's own
header records 21s of engine render for a 4 KB deck, and it was answered with an
O(1) `endsWith('-->')` guard. The guard works. It is also invisible to the
analyzer, and a mitigation nobody but its author can verify is one refactor away
from being silently removed. So the regex is now unambiguous rather than merely
guarded: slice the delimiters off and match the INSIDE, where `([\s\S]*)` is
greedy to the end of an already-bounded string and there is no anchor left to
backtrack toward. Equivalence is not asserted, it is measured — the old and new
parses agree on all **6,147** `<!-- … -->` comments in the committed corpus and on
**400,000** fuzz strings built from the delimiter alphabet. The deck linter's
line-quoting regex carried the same shape and became a non-capturing `.*`.

CodeQL's other finding on this file is the more interesting one, because the right
answer was **not** to comply. `js/bad-tag-filter` flagged the scanner's
comment-end matcher for recognizing `-->` and not `--!>`, which the HTML spec also
treats as a comment end. The query is reading the pattern as an attempt to
SANITIZE markup, where missing a terminator is a filter bypass. This parse
sanitizes nothing — untrusted slide HTML is sanitized by DOMPurify at the preview
boundary (`sanitizeSlideHtml`, HARD RULE #22) — and its actual contract is to
answer the class question **the way the renderer answers it**. markdown-it pairs
`/^<!--/` with a literal `/-->/` (`rules_block/html_block.mjs`), verified against
the engine: a directive closed with `--!>` renders as `content`, i.e. the comment
swallowed it. Complying with the spec would have made the linter disagree with the
render on exactly one input — the defect this whole decision exists to remove.

So the behavior is unchanged and the *spelling* changed: `line.includes('-->')`
rather than a regex. That silences the query by not being the thing it matches,
which is honest here in a way a suppression comment would not have been — a
suppression also would not survive esbuild into
`docs/src/playground/authoring-core.generated.js`, where the same code is scanned a
second time and was flagged a second time. The agreement with markdown-it is now a
test that drives the real engine on both spellings, so the next person who reads
this as a bug finds the reason and a failing test rather than a comment.

**What closes the quoted-directive defect** is one requirement: only a WHOLE-LINE
comment can be a directive. That is not a heuristic — it is the shape markdown-it
requires to open an `html_block`, which is the token the engine reads a directive
off. A comment that starts mid-sentence is a `code_inline` or `text` child, and is
prose to the renderer too.

## The gate

`test/unit/core/class-directive-scan.test.js` compares the scan against
`slideClassSpans` — the reader that IS derived from the engine's token stream —
over every committed deck carrying a class directive — 276 of them:
**274 compared (2,785 slides), 0 disagreements**, plus **2 skipped** — the two whose `^---$` chunk count differs
from the engine's under heading-split injection, where there is no slide-to-slide
correspondence to compare. The skip is asserted at exactly two so it cannot grow
quietly, and the residual it belongs to is named below. The same test pins the DIFFERENCE that makes that number mean
something: the regex it replaces gets **6 slides wrong**, across the three decks
that use the global form.

A synthetic case list could not have told you these agree. The corpus can, and it
is the same instrument #1374 used one level up.

## The residual, named

Slide **numbering** still comes from `splitTopLevel`'s `^---$` rule. The engine
splits on every top-level thematic break (`***`, `___`, `- - -`), treats a setext
underline as a heading rather than a break, and injects extra boundaries under
`split: headings` (the default). On **2 of 276** committed decks the engine
therefore finds more slides than the linter counts, so a finding's `slide` field
is off by that much — a pre-existing property of the linter's chunking, unchanged
by this and now asserted at exactly two rather than left to drift. Closing it means
moving every authoring core onto the boundary parser, which is the same cost this
decision just declined for the same reason.

**The positional pairing is the sharp edge, and it nearly shipped broken.** Every
consumer does `slides.forEach((slide, idx) => directives[idx])` — two arrays
computed independently, matched by position, with nothing checking that they are
the same length. The reader this replaced had no such coupling: each chunk ran the
regex over *itself*, so it could not be misaligned even in principle. Returning an
indexed array bought the global form and paid for it with an invariant.

It broke immediately, on the very first block construct the scan newly learned.
Consuming a multi-line comment skipped its lines from the walk, and `splitTopLevel`
still splits on a `---` written *inside* one — which is what commenting out a run
of slides looks like. Measured on a deck of that shape: 7 chunks against 6
directives, and from the comment on, every slide was checked against its
neighbour's class contract. Defect #3 of this decision's own opening, arriving
through the fix for it. The 275-deck corpus gate could not see it (no committed
deck has the shape) and neither could 5,498 unit tests.

The fix here is the conservative one — the scan still emits a boundary for a
separator it consumes, so the two agree by construction — plus two guards: a
synthetic case for the mechanism and a **whole-corpus** length check over all 846
committed markdown files. Both were mutation-tested against the unfixed scan.

The DEEPER fix is not taken, and is named rather than glossed: `splitTopLevel` is
the array that is actually wrong. The engine does not split inside an `html_block`
either, so on such a deck the linter sees more slides than the render does, and
matching it is matching a splitter that disagrees with the renderer. The dominating
move is **one chunker** — have `slideClassDirectives` return the boundaries it
walked and have callers iterate those, so the two answers cannot drift because
there is only one. That is smaller than the change it would replace, and it also
closes the numbering residual above. It is refused *here* only because it moves the
`slide` number on every finding for any deck with a nested rule or a commented-out
run, which is a behavior change to six authoring surfaces on a branch that is
already six commits and closing six issues. Next change, not this one.

**"One reader" means one reader for THIS QUESTION**, and the scope is worth stating
exactly, because "every `_class:` regex in the repo is gone" would be false. Six
modules that resolve *which class governs slide N* now share the scan. Several
other regexes remain and ask different questions — `docs/…/studio/lint.ts` collects
every class the deck mentions, `coach-core.ts` asks whether a deck contains a
`decision` or `title` slide at all, `lib/layout/bridge.js` collects referenced
library components. Those are presence and collection questions, not resolution,
and unifying them would be a different change with a different argument.

Gaps found on the way and left alone deliberately:

- **`liftImageBgImages` (`lib/core/bg-image.js:133`) reads the spot form only**, and
  splits slides with its own `/(^---[ \t]*$)/m` — a seventh spelling of a boundary
  rule the change before this one reduced to one. So a run of image slides declared
  with a mid-deck global does NOT get the half-canvas lift:

  ```
  liftImageBgImages('<!-- _class: image -->\n\n![bg](a.png)\n\n## H')  → lifted
  liftImageBgImages('<!-- class: image -->\n\n![bg](a.png)\n\n## H')   → NOT lifted
  ```

  Pre-existing, on the RENDER path, and therefore not a change to make without the
  74-gallery regression gate confirming it — which is why it is logged here with a
  reproduction rather than folded in. It is the strongest argument that this reader
  should eventually be the token stream after all.
- The deck-wide front-matter `class:` is still not folded into a slide's linted
  token list, so a deck-wide modifier is neither validated nor available to the
  per-component rules. (The tokens the register *refuses* are flagged — see
  `2026-08-05-deck-class-register-boundary.md` — but an unknown one is not.)
- **`docs/…/studio/present/rehearsal.js` resolves a class per slide** — it is a
  resolver, so it belongs in the sweep — but its `chunks()` splits the source its
  own way (front matter stripped, empty chunks dropped), which does not line up
  with the index space `slideClassDirectives` returns. Swapping the reader in
  without moving `chunks()` onto the shared splitter would silently re-assign
  slides; moving it is a behavior change to the rehearsal planner, not a swap. The
  gap costs a mid-deck-global slide its ROLE, which shifts a dwell weight rather
  than any correctness. Logged in the file itself, with the condition that would
  close it.
