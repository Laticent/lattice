---
status: shipped
summary: >
  The engine breaks a slide on every top-level markdown-it `hr`; every caller-side splitter in the
  tree derived that set from its own regex over `---`, and each derived it differently. Measured
  against the real parser, SIX separator forms split for the engine and not for the callers (`***`,
  `___`, `- - -`, `--- ` with a trailing space, `----`, and a `---` indented one to three spaces),
  while a setext underline split for the callers and not for the engine. The consequences had already
  reached humans three times, and the third was silent data loss: `slideCount` read 1 where the engine
  renders 2, so a chat edit addressed to slide 1 overwrote the whole deck and the app reported success.
  Amendment 4 of the preview-render-cost note concluded the two splitters must stay two, because the
  engine decides after a full parse and the editor needs an answer on every keystroke. The first half
  is right; the second was an assumption nobody measured. What the caller needs is not the parse but
  the parse's ANSWER, and a line scanner reproduces it in 0.04ms on a 40-slide deck.
  `lib/core/slide-boundaries.mjs` is that scanner, pinned to the real parser by a differential test
  over the divergence matrix, a marker-by-context corpus, a seeded fuzz and every committed deck.
  Seven caller-side splitters now read it. 720,000 fuzzed decks across 12 seeds: zero disagreements.
  The corpus equivalence rate is unchanged (1295/1318), which is the point — this buys correctness,
  not a number. Also records four defects the fuzz found that four tiers of hand-written tests missed,
  and three test suites that were pinning the defect.
---

# The two slide splitters, actually reconciled

**Status:** shipped, 2026-08-05. Closes item 1 of #1271; follows
`2026-07-30-preview-deck-context-and-render-cost.md` (§2, Amendment 4).

---

## 1. What was actually wrong

The engine derives a slide boundary from a **top-level markdown-it `hr` token**
(`splitOnHr`, `lib/engine/slides.js`). Every caller-side splitter derived it from a regex over
`---`. Measured against `lib/core/boundary-parser.js` — the markdown-it instance configured the
way the engine configures its own — before any of this changed:

| deck body | engine | `/^---$/m` | `/\r?\n-{3,}\r?\n/` |
|---|---|---|---|
| `# One` · `---` · `# Two` | 2 | 2 | 2 |
| `# One` · `***` · `# Two` | **2** | 1 | 1 |
| `# One` · `___` · `# Two` | **2** | 1 | 1 |
| `# One` · `- - -` · `# Two` | **2** | 1 | 1 |
| `# One` · `--- ` (trailing space) · `# Two` | **2** | 1 | 1 |
| `# One` · `----` · `# Two` | **2** | 1 | 2 |
| `# One` · `  ---` (indent 2) · `# Two` | **2** | 1 | 1 |
| `Interlude` · `---` (no blank line) | **1** | 2 | 2 |
| `the plan`U+2028`---`U+2028`v2` | **1** | 2 | 1 |

Six forms split for the engine and not for the callers. One — the setext underline — splits for
the callers and not for the engine. And U+2028 splits the two *caller-side* splitters from **each
other**: JavaScript's `^`/`$` under the `m` flag treat it as a line terminator, `String.split('\n')`
does not, and `docs/src/lib/normalize-source-text.ts` folds CRLF and BOM but not U+2028, so a
pasted deck carries it through.

`#1271` named four forms. Measuring found six, plus the two disagreements of opposite sign above.
**Every number in the table came from running the real parser, not from reading its rules.**

## 2. Why it mattered more than a miscount

Three consequences had already reached a human, and they get worse in order:

1. **The wrong slide painted** (#1265) — an authored-slide index used to index engine sections.
2. **The editor↔preview off-by-one** (§7b) — a different mechanism, same shape.
3. **A slide destroyed, and reported as applied.** Reproduced on `main`:

```
deck:  # Slide One  ·  "--- " (trailing space)  ·  # Slide Two
engine renders 2 sections;  slideCount() returns 1

applyEditChecked(deck, { action: 'replace', slide: 1, body: '# Rewritten' })
  -> { ok: true }   -> renders as 1 section: "Rewritten"
```

`# Slide Two` and its body are gone, with the chat's green "Applied" tick painted over the loss.
The issue comment reported two forms doing this. **All six do** (`.scratch/repro-dataloss.mjs`),
and `applyEdit`'s stated contract — "preserving every untouched byte" — was true only for decks
whose separators are a bare `---`.

## 3. The claim this change refutes

Amendment 4 of the preview-render-cost note settled the question this way:

> The engine breaks slides on any markdown-it `hr` … *after a full parse*. The Studio needs an
> answer on every keystroke, in a browser, before the engine bundle has finished loading — so it
> scans text for `\n---\n`. That is a difference in KIND … and routing the editor through the
> engine's tokenizer would mean a full parse per keypress. **The two splitters stay two.**

The first half is right. The second is a conclusion about cost that was never measured, and it
smuggles in a second claim: that the only way to get the engine's answer is to run the engine's
parser. Both are wrong.

**On cost.** A block-only parse of the corpus's largest decks, Node, p50 of 200:

| deck | `md.parse` | `md.block.parse` | line scan |
|---|---|---|---|
| 40 slides (20KB) | 0.98ms | 0.40ms | **0.037ms** |
| 119 slides (60KB) | 2.59ms | 1.24ms | **0.129ms** |

Even the rejected option is 0.40ms, memoizable to once per keystroke, against a ~8ms typing
budget. And markdown-it is already an eager dependency of the docs bundle
(`docs/src/lib/compose/deck-markdown.ts` imports it directly), so "before the engine bundle has
loaded" was not the constraint it sounded like.

**On kind.** The caller does not need the parse. It needs the parse's **answer**, and
markdown-it's `hr` rule is line-local: marker in `* - _`, three or more of them, nothing but
spaces and tabs between, indented at most three columns. What is *not* line-local is the
**context** — is this line inside a fence, a math block, an HTML block, a blockquote, a list, a
table; is a paragraph open above it (which turns a run of `-` into a setext underline rather than
a break). That context is trackable in one pass.

So the two splitters stay two in the sense Amendment 4 meant — the engine still tokenizes, the
caller still scans — and they stop being two *derivations*. There is one definition of a
boundary, and the scanner is pinned to the tokenizer by a test rather than by a comment.

## 4. What was built

**`lib/core/slide-boundaries.mjs`** — pure, import-free, browser-bundlable, `require()`-able from
the CommonJS authoring cores. It exports `slideBoundaries` (the 0-based line indices),
`splitSlideChunks` (the `splitOnHr` grouping) and `separatorRanges` (character offsets, for the
editor). It tracks fenced code, `$$` math, all seven HTML-block kinds, blockquotes, lists, tables,
indented code, link reference definitions, and paragraph state.

**Every result carries `certain`.** A hand-written scanner that is merely usually right is the
defect generator this module exists to retire, so it reports when it cannot settle a shape by
scanning — today, an unclosed fence or HTML block, which is what a deck looks like mid-keystroke.
Two callers honor it and refuse: `positionIsTrustworthy` (an index handed to the engine) and
`applyEditChecked` (a splice that rewrites bytes). Fail closed costs an optimization; fail wrong
costs a slide.

**Seven caller-side splitters now read it**, each keeping only its own packaging:

| module | what it kept |
|---|---|
| `lib/authoring/slide-split.js` | the chunk model (front matter is the first two chunks) |
| `lib/diagnostics/slice-equivalence-core.mjs` | `splitSlides`, `positionIsTrustworthy`, `deckSectionFor` |
| `docs/src/components/studio/lint.ts` | the rail, `slideIndexAt` / `slideStartOffset` |
| `docs/src/components/studio/ai/architect-edits.js` | the surgical splice |
| `docs/src/components/studio/coach/coach-core.ts` | per-finding slide jumps |
| `docs/src/components/studio/present/rehearsal.js` | per-slide dwell time |
| `lib/authoring/review-core.js` | already delegated to `slide-split.js` |

**Three refusals retired** from `positionIsTrustworthy`, because none of them is a divergence any
more: the unrecognized `hr` forms, a `---` inside an HTML comment, and a fenced `---`. What
replaces them is the scanner's own verdict. The setext refusal **stays** — it is not about where a
slide breaks (the scanner gets that right) but about how many sections *heading splitting* then
carves the slide into, which is a different mechanism and still needs a parse.

## 5. How it is verified

`test/unit/core/slide-boundaries.test.js` runs the scanner and the real parser side by side over
four tiers, and asserts agreement rather than a list of expectations somebody typed:

1. the divergence matrix above, including U+2028 and the §7b shapes;
2. a generated corpus — 8 separator forms × 18 block contexts × 4 indents × 5 followers, 2880 decks;
3. a **seeded** fuzz — 20,000 decks shuffled from 60 block atoms;
4. every committed deck (278 files across `examples/`, `test/integration/baseline-decks/`,
   `lib/components/`).

Plus two pinned transcriptions: the CommonMark block-tag list and markdown-it's own
`HTML_OPEN_CLOSE_TAG_RE` source, each read from markdown-it at test time so a duplicate cannot rot.

**The fuzz is where the value was.** Four hand-written tiers passed on the first run; the fuzz
immediately found four defects, and every one of them was a rule I had reasoned about rather than
measured:

| defect | consequence |
|---|---|
| `</script>` read as a raw-text block that closes itself | it is a **type-7** block running to the next blank line — every `---` after it became a boundary the engine does not have |
| `reference` checked before `table` | markdown-it tries `table` first, so `[ref]:` over a delimiter row is a table, not a link definition |
| a definition's destination taken from any following line | its line scan STOPS at a block opener, so `[ref]:` over `___` has no destination and the label is a paragraph |
| a nested list's content column kept for a sibling | `- item` over `1. ordered` moves the column from 2 to 3, so a `  ---` at column 2 leaves the list and IS a break |

Each is now a named regression case, so the guard does not depend on a lucky seed. Final sweep:
**720,000 generated decks across 12 seeds, zero disagreements** — including zero in the
`certain: false` bucket.

Each branch was mutation-checked against the committed test. One branch — the lazy-continuation
rule — was found to have **no** committed coverage (the fuzz caught it, the test did not), and
that hole is now closed by name.

## 6. What it cost, and what it did not buy

`npm run equiv`, same corpus, with and without this change:

```
before   1295/1318 slides (98.3%)   positions supplied: 1310
after    1295/1318 slides (98.3%)   positions supplied: 1310
```

**Identical, and that is the honest result.** This is a correctness change; it was never going to
move a rate whose residual is generated ids and whitespace. The number is here to show it did not
move *down* — an earlier cut of the same change did, by 1.0 points and 15 supplied positions,
because the scanner raised `certain: false` on any `<`-led line it did not recognize as a block.
That refusal was pessimism, not caution: `<svg viewBox="…">…</svg>` is a paragraph to markdown-it,
and transcribing its tag pattern faithfully rather than approximately decided it. Declining what
you can decide is a slower wrong answer.

> **Pre-existing, logged not fixed** (HARD RULE #18, off-path): `equiv:check` is red on `main`
> because the committed baseline is stale against a grown corpus — 126 decks blessed, 137 measured.
> The rate is identical with and without this change, so re-blessing here would only mix corpus
> drift into this diff.

## 7. Three test suites were pinning the defect

Worth recording as a class, because all three passed continuously while describing behavior the
renderer does not have.

- **`architect-edits.test.js`** built its fixture as `'body one', '---', '## Two'` — the separator
  hard against the text above it. That deck renders as **one** section: `body one` becomes a setext
  h2 and every `---` in the fixture is a heading underline. 17 tests asserted a 3-slide model of a
  1-slide deck.
- **`lint.test.ts`** joined its fuzz decks with `'\n---\n'`, the same shape, and its body generator
  could emit `***` — which the old splitter did not recognize as a separator, so the arbitrary's
  stated invariant ("can't introduce an accidental separator") held by accident. It now *asks* the
  boundary kernel instead of trusting the character class.
- **`deck-doc.test.ts`** asserted "a thematic break in prose does not split the slide". `***` is a
  top-level `hr`; the engine renders two sections, the second unclassed. The compose layer showed
  one slide where the deck rendered two — #1271's defect reached through the Write surface.

The pattern: **agreement between two copies of a mistake reads exactly like correctness.** §7b of
the preview note said the same thing about a round-trip property; these are three more instances,
and the fix in every case was to test against the engine rather than against a sibling.

## 8. One user-visible normalization

Round-tripping a deck through the Studio's Write surface now **canonicalizes a non-`---` separator
to `---`**. A deck written with `***` comes back with `---`: same render, different bytes. It
follows from modelling the split at all, and it is in the CHANGELOG rather than hidden.

`deck-markdown.ts` still serializes a horizontal rule as `***`, but the reason in its comment was
wrong and is corrected: `***` was never "an `<hr>` the separator regex can never match" — the
engine always split there. It survives as the right spelling for a rule *inside a container*,
where a `---` at a low indent could close the container and become a top-level break.

## 9. Still open

Items 2 and 3 of #1271 — the adjacency-preserving equivalence harness, and structural gating — are
untouched. They are a separate thread with their own dependency (2 → 3); this note closes item 1,
which the card ranks first because it is the root cause of a class rather than one bug.
