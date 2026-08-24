---
status: shipped
summary: >
  `checkLineEndingBoundaries` / `SANCTIONED_EOL_BOUNDARIES` were cited as shipped and
  load-bearing in TWELVE lines across ten files — CLAUDE.md's doc-index row that tells every
  agent what to do when adding a markdown ingest, the `## What shipped` section of the note
  that introduced them, `.gitattributes`, the changelog, and six source comments — and neither
  identifier existed anywhere in the tree. (#1524 said "nine places" and "four source
  comments"; it undercounted, which is the thesis holding one level up.) `build:check` passed because there was nothing to run. The
  cost was already paid: #1388 (`export-marp` exports a BOM'd deck in the wrong palette) is
  #1349 recurring one file over, at the ninth ingest, and its own diagnosis reasoned that
  "the gate cannot see it" because the file was missing from a list that did not exist. The
  gate is now written, in five arms, each watched red on the real tree: a listed boundary
  that stopped normalizing, a stale entry, a pinned normalization COUNT that moved (the
  engine has two public doors and #1357 measured the divergence when only one normalized),
  an UNLISTED fold, and `\r?\n` used to normalize where a boundary needs `\r\n?`. The
  unlisted-fold arm earned itself immediately: it found `lib/core/boundary-parser.mjs`, a
  tenth boundary no prose list had ever named, and the export-marp entry the issue asked
  for went red on its first run because that ingest genuinely never normalized — so writing
  the gate closed #1388's instance as a side effect of listing it. Third instance of this
  defect class in one swimlane, after #1823 (an overflow oracle whose true branch was
  unreachable) and #1820.
---

# A `## What shipped` heading is a claim, and nothing in the tree checks it

**2026-08-24 · closes #1524, closes #1388**

**Area:** `tools/check-ownership.js`, `tools/export-marp.js`

## The finding

```
$ grep -rn 'SANCTIONED_EOL_BOUNDARIES\|checkLineEndingBoundaries' tools/check-ownership.js
(no output)
```

Twelve citation lines across ten files, measured with `git grep` rather than counted from
the issue, three of which actively direct behavior:

| where | what it says |
|---|---|
| `CLAUDE.md` doc-index | *adding an INGEST for markdown → read the note **+ `SANCTIONED_EOL_BOUNDARIES`*** |
| `2026-08-04-line-endings-lf-boundaries.md` §What shipped | *"`checkLineEndingBoundaries` + `SANCTIONED_EOL_BOUNDARIES` (`tools/check-ownership.js`, via `build:check`). It fails on: …"* |
| same note, §If you are adding a markdown ingest | *"**add the file to `SANCTIONED_EOL_BOUNDARIES`** with a justification"* |
| `.gitattributes`, the frozen changelog ledger | cited as the enforcement mechanism |
| six source comments | `Library.tsx`, `StudioShell.tsx`, `architect-edits.js`, `deck-source.ts`, `normalize-source-text.ts`, `resolve-color-mode.js` |

(#1524's own text says "nine places" and "four source comments." Both undercount. That is not
a nitpick against the issue — it is this note's thesis surviving contact with itself: a number
in prose that nobody re-derives drifts, and the count above was re-derived with one command.)

So an agent adding a markdown ingest was told to follow a procedure into a function that
did not exist, and every reader trusted the citation instead of grepping the name.

## Why this is not a documentation nit

The line-endings design (#1357) is *deliberately* a centralization: it converts ~55 readers
each independently remembering `\r?` into **one guarantee plus a list that must stay true**.
The value of the whole design is exactly the accuracy of that list. The note said so itself,
and said the list was a gate rather than a comment *because a boundary list kept in prose
rots* — then shipped the list in prose.

It rotted on schedule. **#1388** — `tools/export-marp.js` reads author markdown with a bare
`fs.readFileSync`, so a BOM'd or CRLF deck exports to a Marp bundle in the wrong palette —
is #1349 recurring at the ninth ingest. Its diagnosis is right about the outcome and wrong
about the cause: the gate could not see it because **there was no gate**, not because the
file was missing from a list.

`#1349` → fixed at eight ingests by `#1357` → recurred as `#1388` at the ninth. The thing
that was supposed to close that loop was never built.

## The six arms, each watched red

A gate that has never fired earns no trust from passing, so every arm was mutated on the
**real tree** and the control re-run after each:

| mutant | result |
|---|---|
| revert `lib/core/resolve-palette.js`'s fold | **RED** — 1 error, that file only |
| drop ONE of `lib/engine/index.js`'s two doors | **RED** — count 2 declared, 1 carried |
| keep both folds, drop one door's BOM strip | **RED** — 1 BOM-strip against 2 declared |
| add a new unlisted ingest under `lib/core/` | **RED** — names the file and line |
| swap a boundary's `\r\n?` for `\r?\n` (or `\r\n`) | **RED** — names the spelling and the remedy |
| add a raw `readFileSync` + `/^---\n/` reader | **RED** — arm 6, no fold to inspect |
| unmutated control, before and after each | **GREEN** |

Arm 3 is the one worth explaining. `lib/engine/index.js` pins a **count** of 2 because the
engine has two public doors and #1357 measured what happens when only one normalizes:
`geometry()` reported 1280x720 while `render()` used 960x720 on the same lone-CR deck — a
host fit-scaling against a box the render does not use. A file-scoped "does it normalize
at all" check certifies that state as green.

Arm 4 keys on the **raw fold idiom**, never on a call to `normalizeSourceText`. Delegating
to the shared helper is the behavior the design wants; flagging its callers would punish the
right answer. What arm 4 catches is a *second implementation*, which is what makes the list
untrustworthy rather than merely incomplete — the thing `deck-source.ts`'s own comment says
would "make the list a lie".

**Arm 6 exists because the first five could not fail on the actual bug.** They all key on a
fold that is already present, so a reader with no normalization at all is invisible to every
one of them — and #1349 and #1388 were both exactly that. An independent checker ran the
probe on this diff and found the gate green over `tools/export-chart-svg.js:78`, a
user-facing CLI reading an author's deck raw while `frontmatterTheme` anchored on `/^---\n/`,
**stricter than the reader #1349 was about**. A `theme: cuoio` deck saved by Notepad exported
every chart SVG in `indaco`. So the sixth arm asks a different question — does this file read
`utf8` text AND anchor front matter on a fence that admits exactly one byte after it — and it
is narrow on purpose: its first cut fired on four slide-separator splits (`/^---\s*$/m`) that
already tolerate a CR, and flagging those would have taught the next reader that the arm is
noise. It narrows the blind spot; it does not close it. A reader that parses front matter some
other way still slips past, and this note says so rather than repeating the mistake it is about.

## What the gate found on its first run

**`tools/export-marp.js` went red**, exactly as #1524 predicted: the issue asked for it to
be seeded into the list, and it had no normalization to seed. Fixed at the ingest — extracted
as a named `readDeckSource` so the guard can drive the real boundary rather than a copy of it —
which closes **#1388's instance** as well as its class.

Measured on the real surface, one deck declaring `theme: cuoio`, exported twice per build:

| deck as authored | bundle BEFORE | bundle AFTER |
|---|---|---|
| LF | `themes/cuoio.css`, `cuoio-dark.css` | same |
| **BOM + CRLF** | **`themes/indaco.css`, `indaco-dark.css`** | `themes/cuoio.css`, `cuoio-dark.css` |

After the fix the two bundles are byte-identical apart from the deck's own filename (which
appears in `README.md` and `package.json`). Before it, a Notepad-saved deck shipped a Marp
bundle themed in a palette its author never asked for, silently — the recipient sees a deck in
the wrong brand and nothing anywhere reports an error. The unit guard
(`test/unit/core/line-endings.test.js`) covers LF / CRLF / lone-CR / BOM+CRLF through
`readDeckSource`, and reverting the boundary turns the CR and BOM rows red.

**Three more boundaries nobody had written down.** Arm 4 found `lib/core/boundary-parser.mjs`;
arm 5 found `lib/exemplars/tier-filter.js`, which was folding `\r\n` (no lone-CR coverage) and
had no BOM strip at all, in a function whose `^---` test decides whether a deck HAS front
matter; arm 6 found `tools/export-chart-svg.js`. `boundary-parser` is a genuine ingest — the boundary path's door — and it spells the engine's
line out by hand rather than importing it, because the dependency runs `lib/engine` →
`lib/core`. Every prose list of these boundaries, in three documents, had eight entries. The
list now has twelve.

Three folds were **not** boundaries and are recorded as such rather than ignored. The two
index builders (`build-decisions-index.js`, `build-gotchas-index.js`) read repo-committed
markdown that `.gitattributes` already holds to LF, so their fold is tolerance rather than
canonicalization. And `lib/authoring/notes-core.js` folds a *candidate string* for one comparison against rendered
HTML; the source itself flows on untouched, and it strips no BOM because there is no document
here whose front matter could be defeated. It lives in `SANCTIONED_EOL_NON_BOUNDARIES`, which
is stale-checked too, so the exemption cannot rot into a blanket waiver.

## The generalizable finding, and its third instance

This is the third gate in one swimlane found to be asserting coverage it did not have:

| # | gate | how it failed |
|---|---|---|
| #1820 | the word-cloud spectrum ramp floor | a floor below the threshold it named |
| #1823 | `slide does not overflow its frame` | compared `scrollHeight` to `clientHeight` on an `overflow: hidden` box — the true branch was **unreachable** |
| #1524 | `checkLineEndingBoundaries` | **did not exist**, in nine citations |

The shared shape is not carelessness. In all three the *documentation was accurate about
intent* and nothing mechanical ever asked whether the intent had been carried out. The habit
that found all three is the same one, and it is cheap: **before trusting a gate's green, feed
it a known-bad input and watch it go red.** Each of these had survived for the life of its
suite.

## What this gate still cannot see

Written down because the defect this note is about was a doc that did not say this.

- **A reader that parses front matter some other way.** Arm 6's signal is a `^---\n` anchor
  over a `utf8` read. A reader using a YAML library, or splitting on a different pattern, is
  not covered.
- **A trailing `// … .replace(/\r\n?/g, '\n') …` comment fires arm 4.** `commentSpans` anchors
  comments at line start, so a mention of the idiom in a trailing comment reads as code. It is
  a loud false positive with an obvious remedy (move the mention to a line-start comment), and
  the helper is shared with every other gate in the file, so it is left as-is rather than
  forked. Same for a line-start `/*` inside a template literal, which can swallow a real fold —
  contrived, and a census of all 1,047 scanned files found no live instance.
- **`docs/public/**` and `test/**` helpers are outside the scan roots.**
- **The `.gitattributes` arm checks only that the line is present**, not that a Windows clone
  actually refuses a CRLF commit. That is unreachable from this sandbox. **UNVERIFIED.**

## Gates

`npm run lint` · `npm test` · `npm run build:check` ·
`node --test test/unit/tools/line-ending-boundary-gate.test.js` (21/21) ·
`node --test test/unit/core/line-endings.test.js`
