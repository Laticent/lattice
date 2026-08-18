---
status: shipped
summary: A typed `✓` resolves to whatever font covers U+2713 on the reader's machine, so its shape and weight shift across OSes and PDF viewers — and five sites typed `content:"\2713"` (including themes/a11y-base.css) re-implementing `--mark-check`, a curated SVG that existed the whole time. New HARD RULE #28 plus `checkTypedGlyphs`, an exceed-only ratchet frozen at 228. The predicate is "shape or word", NOT "non-ASCII" — an em-dash is punctuation, a curly quote is a quotation mark, and redline renders `content:'OLD — prior text'`; the deliberately-absent list is as load-bearing as the deny list. Curated table in lib/core/shape-glyphs.js, shared so the build gate and the author lint cannot drift. We fail the build on OUR surfaces; authors get coached, never blocked. Engine JS is deliberately not gated — every hit was terminal text (console.warn, --help), and a gate that cannot tell a log line from a DOM string gets switched off.
version: 1
supersedes: none
builds-on: 2026-08-12-sketch-label-voice.md
---

# Chrome is drawn, never typed

**Date:** 2026-08-18
**Status:** shipped
**Rule:** HARD RULE #28

---

## The defect

Lattice draws its chrome as SVG so a slide renders identically whatever font the
reader's machine resolves. A typed character defeats that in one keystroke: `✓`
is U+2713, and its shape, weight and baseline come from whichever installed font
happens to cover it — different on macOS, Windows, Linux and inside every PDF
viewer. Where nothing covers it, it is tofu.

The failure was already in the tree, in the worst possible place. An audit of
every CSS `content:` declaration found **five sites typing `\2713`** — among them
`themes/a11y-base.css`, the *accessibility* theme, where a font-dependent shape
is precisely what must not happen — plus two typing `\2717`. Both were
re-implementing `--mark-check` and `--mark-x`, curated SVG masks that had existed
the whole time. Two spellings of one mark, one of them font-dependent.

## The inventory

Counted across the tree, split by whether it reaches a reader:

| Surface | Count | Verdict |
|---|---|---|
| Deck markdown (renders on a slide) | 316 in 64 decks | in scope |
| CSS `content:` | 63 sites, 19 distinct characters | **29 are chrome**, 34 are punctuation |
| Engine JS non-comment lines | 117 | not gated — see below |
| `engineering/` + `design/` prose | ~6,000 | out of scope — writing, not chrome |
| Source-comment box drawing | ~30,000 | out of scope — no reader ever sees it |

## The predicate is "shape or word", not "non-ASCII"

This is the decision the whole rule rests on, and the CSS audit is what forced
it. Of 19 distinct characters in `content:`, only 13 were chrome:

- **Shapes** — `✓ ✗ › ❯ ⌄ → ↻ ▶ ⏸ ✦ ✧ ◆ ●`. Icons wearing a character's clothes.
- **Words** — `— – · “ ” &nbsp;`. `redline` literally renders
  `content: 'OLD — prior text'`; `quote` and `citation-card` use curly quotes
  *as quotation marks*. These are text doing text's job.

A general non-ASCII ban would have flagged all 34 punctuation sites, fought
typography permanently, and been switched off inside a week — leaving nothing
enforced. So the gate reads a **curated deny list**, and
`lib/core/shape-glyphs.js` carries a `NOT_SHAPES` list beside it recording where
the boundary was drawn and why, so nobody re-litigates it every time the gate
fires. `×` (MULTIPLICATION SIGN) stays out as a mathematical operator; `✕`
(MULTIPLICATION X), its icon-shaped sibling, is listed.

When a candidate is arguable, it is left out. A smaller list that survives is
worth more than a complete one that gets bypassed.

## We fail ourselves; we coach everyone else

Two consumers of one table, deliberately different in tone:

- **`checkTypedGlyphs`** (`tools/check-ownership.js`) polices *our own* rendered
  surfaces — the decks we ship and engine CSS `content:` — and **fails the
  build**. Exceed-only ratchet frozen at **228**, the same shape as
  `US_ENGLISH_BUDGET`; lower it as each surface converts. Target zero.
- **`lib/authoring/lint-core.js`** sees a typed glyph in *someone else's* deck
  and **coaches**: names what it will look like on another machine, points at the
  modifier that does it properly, offers the fix. It never blocks.

An author may type whatever they like. Consistency is king, flexibility is the
necessary evil that keeps the engine worth writing for — and the answer to
"I want this shape" is a new modifier, not a refusal.

## Why engine JS is not gated

A first cut scanned non-comment lines in `lib/**` and `lattice-emulator.js` and
reported 33 hits in the emulator alone. **Every one was terminal text**: 24 `⚠`
in `console.warn`, 9 `→` inside the `--help` block. Neither has a font contract
to break — a CLI writes to whatever the shell renders, and no reader sees it on a
slide.

Separating a DOM-bound string from a log line, from an LLM prompt (`lib/theme/
ai.js` bullets a model prompt with `•`), and from a regex that *parses* an
author's typed arrow (`quadrant`, `lint-core`, `chart-narration` all accept
`→` as input) needs real intent analysis. A gate that guesses wrong is a gate
somebody switches off. The CSS and deck arms are exact, so they gate; the JS
emitters convert by hand alongside the tokens, under review.

**Parsers stay.** Accepting `Low → High` from an author is input tolerance, and
it is unrelated to whether we *emit* the character. Input generosity and output
purity are different properties.

## One sanctioned exemption

`examples/speech-symbols.md` is a read-aloud stress test: its front matter maps
`"→"` to `"leads to"` and the body types `→ ⇒ ↑ ↓ ←` as **fixtures** proving the
lexicon and pronunciation pipeline speak each one correctly. The glyph is the
input, not the decoration; replacing them would delete what the deck tests.

`SANCTIONED_GLYPH_DECKS` carries the entry with that justification, and the gate
fails on a **stale** sanction — a listed deck that no longer exists, is no longer
reached, or no longer contains a glyph — so the list cannot quietly rot into a
blanket exemption.

## What is still to do

This lands the rule and the ratchet, so nothing new can be added. Still open:

1. **The curated `--icon-*` token set** — ~13 SVG masks beside the existing
   `--mark-*`, replacing the 29 chrome sites in CSS. The five `✓` and two `✗`
   just repoint at `--mark-check` / `--mark-x`, which already exist.
2. **The author lint rule** in `lint-core.js`, using `shapeGlyphAdvice`.
3. **More modifiers**, so the coaching has somewhere to point.
4. **The 316 deck glyphs**, converted once 1–3 give them a destination.

## Verification

- `checkTypedGlyphs` measured against the live tree at each scoping decision:
  354 raw → 237 after dropping the JS arm → 228 after the one sanction.
- `test/unit/core/shape-glyphs.test.js` (13) pins the boundary in both
  directions — including that `redline`'s real `content:` value is clean.
- `test/unit/cli/check-ownership.test.js` gains 3 tests: budget, ratchet
  honesty, and sanction truthfulness.
- `npm run lint` — which caught a real defect: the first cut reinvented
  `stripJsComments`, a helper the file already had (HARD RULE #15).
