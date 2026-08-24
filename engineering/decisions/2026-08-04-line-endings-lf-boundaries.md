---
status: shipped
summary: A Windows-authored deck exported in the WRONG PALETTE because one front-matter reader of ~55 lacked a `\r?`, and it survived an earlier CRLF sweep precisely because that sweep fixed readers one at a time. Author text is now made canonical at an INGEST — LF endings, no leading BOM — across eight boundaries. The load-bearing part is that the boundary list is a `check-ownership` GATE rather than a comment: centralizing converts fifty-odd redundant partial guarantees into one guarantee plus a list that must stay true, and that list rotted twice inside this change alone. A UTF-8 BOM turned out to be strictly worse than the CRLF (wrong palette, lost `size:`, an extra rendered slide, and a Studio-vs-CLI divergence).
---

# Line endings are LF, and the boundary list is a gate

**2026-08-04 · #1349, PR #1357**

## The bug

A Windows-authored deck declaring `theme: cuoio` exported **entirely in the default palette**,
silently. `lib/core/resolve-palette.js` was the one front-matter reader of ~55 whose regex lacked
`\r?`, and `lattice-emulator.js` calls it on raw file text *outside* the engine's `render()`, so
nothing downstream could rescue it.

Rendered, through the real pipeline, with `main` in a worktree as the control:

```
                     pages   md5 of every page, concatenated
main    LF             7     5841cf…   correct baseline
main    CRLF           7     2116f4…   WRONG PALETTE (#1349)
main    CR             8     aaa908…   wrong, AND mis-split into slides
branch  all three      7     5841cf…   converged, and identical to main's LF
```

## Why the repair is not "add `\r?` to that reader"

Fifty-odd readers each independently remembering `\r?` is a design that guarantees the next one
forgets. It already had: this bug survived a repo-wide CRLF sweep *because* the sweep fixed readers
one at a time. So the repair is to make author text **canonical at an ingest** — LF endings, no
leading BOM — and let every reader downstream stop caring.

## The thing that is easy to miss

**Centralizing converts N redundant partial guarantees into ONE guarantee plus a list that must
stay true.** Before, any single reader forgetting cost you one bug. After, the value of the whole
design is exactly the accuracy of the boundary list — so the list *is* the design.

A list kept in prose rots. It rotted **twice inside this change**:

1. `.gitattributes` first named "`lattice-emulator.js` and the Studio's import path are the other
   two" when the real count was six.
2. Its replacement, a shared helper, claimed to be "the ONE function that enforces it in
   `docs/src`" while `docs/src/lib/compose/deck-source.ts` had been doing byte-identical work since
   #1170 — and while `architect-edits.js` could not import the helper at all (plain JS loaded
   directly by `node --test`, so it cannot import a `.ts` file).

Both were caught by review, not by a machine. This repo's standing answer to "a set of places that
must all remember X" is a `SANCTIONED_*` allowlist in `tools/check-ownership.js` — HARD RULES #20,
#22, #24, #26, #27 are all that shape. This is the sixth.

## What shipped

> **CORRECTION — 2026-08-24, #1524.** This section was WRONG for twenty days, in the way that
> mattered most: the gate it describes was never written. `tools/check-ownership.js` contained
> neither identifier, so `build:check` enforced nothing and every reader below trusted the
> citation instead of grepping the name — including #1388, which reasoned that `export-marp`
> escaped because it was "missing from the list" when the truth was that the list was fiction.
> The gate exists as of #1524; the table below is now its seeded contents rather than a plan.
> See `2026-08-24-what-shipped-was-a-claim.md`. **Four boundaries have been added since**, and
> the gate is what found them — `tools/export-marp.js` (#1388's instance, which had no
> normalization at all) and `lib/core/boundary-parser.mjs` (a tenth boundary that no prose
> list here ever named). The authoritative list is now the code, not this table.

`checkLineEndingBoundaries` + `SANCTIONED_EOL_BOUNDARIES` (`tools/check-ownership.js`, via
`build:check`). It fails on:

- a listed site that **stopped normalizing**,
- a **stale entry** (the file is gone), and
- `\r?\n` used where a boundary needs `\r\n?`.

The boundaries themselves:

| boundary | why |
|---|---|
| `.gitattributes` — `* text=auto eol=lf` | a Windows clone checks out LF and cannot commit CRLF back |
| `lib/engine/index.js` — `render()` **and** `geometry()` | the engine's two public doors; both parse front matter, so both must agree |
| `lattice-emulator.js` — `readFileOrDie` | the CLI's only door for author text; **the one that actually fixes #1349** |
| `tools/lint-deck.js` — the file read | without it a Windows author got *different lint advice for identical content* |
| `lib/core/resolve-palette.js` | normalizes its own input rather than growing another `\r?` |
| `docs/src/lib/normalize-source-text.ts` | the shared `docs/src` helper; the Studio's three ingests call it |
| `architect-edits.js` — `parseEdits` | a model reply is external input and models emit CRLF |
| `lib/layout/ai.js` — `coerceComponent` | a generated component skeleton is markdown spliced into deck source |
| `tools/export-marp.js` — the deck read *(added #1524)* | the export-to-Marp ingest; it never normalized, which is #1388 |
| `tools/export-chart-svg.js` — the deck read *(added #1524)* | the chart-SVG CLI; no normalization at all, and a `/^---\n/` theme reader, so a Notepad-saved deck exported in the default palette |
| `lib/core/boundary-parser.mjs` — `normalizeSource` *(added #1524)* | the boundary path's door; spells the engine's line out by hand, because the dependency runs `lib/engine` → `lib/core` |
| `lib/exemplars/tier-filter.js` — `splitDeck` *(added #1524)* | its `^---` test decides whether a deck HAS front matter; it was folding `\r\n` (no lone-CR coverage) with no BOM strip |

Deliberate **non**-boundaries: `saveSource` (an editor write, not an ingest — byte-faithful by
contract), `reference-doc.ts` (model grounding context, never spliced into source, never exported),
and pasting (CodeMirror 6 normalizes CRLF *and* lone CR on document creation and on every
transaction).

## Three things this cost to learn

**The BOM is worse than the CRLF.** A UTF-8 BOM is what Notepad, PowerShell `>` / `Out-File` and
Visual Studio emit *alongside* CRLF, and it defeats the same `^---` anchor. Measured: a BOM'd deck
declaring `theme: cuoio` exported in `indaco`, lost its `size:`, and rendered its own front matter
as a visible extra slide. It also diverged **by path** — `Blob.text()` strips a BOM during the
UTF-8 decode, `fs.readFileSync(p, 'utf8')` does not — so the same file rendered correctly in the
Studio and wrong through the CLI.

**Use `\r\n?`, never `\r?\n`, at a boundary.** The first covers CRLF *and* classic-Mac lone CR at
identical cost. A reader-style `\r?\n` structurally cannot match a lone CR — there is no `\n` to
anchor on. That is not academic: a lone-CR deck mis-*split* into slides, so it produced a different
page count, not just a different palette.

**A guard that pre-cleans its own fixtures tests its own regex.** The first cut of
`test/unit/core/line-endings.test.js` normalized its fixtures with a test-local helper *before*
calling the code under test. All four conventions collapsed to one string, the file asserted
`render(x) === render(x)`, and it passed with every shipped boundary reverted. Every guard here is
now mutation-checked: revert the boundary, watch it go red.

## Two positions reconciled

`retitleSource` and `writeFrontMatterLine` **preserve** CRLF, and
`2026-07-29-front-matter-lossless-writers.md` documents that as the design. That is not in tension
with this: normalization happens at **ingest**, so those pure transforms never see CRLF through a
supported path, and what they actually pin is that a transform won't emit a *mixed*-EOL file. It
still guards source persisted to `localStorage` before these boundaries landed, which no ingest
re-crosses.

One related writer defect **was** fixed here rather than filed: `quoteIfNeeded` did not escape a
newline in a front-matter value. A literal CR there used to be inert; normalizing at the ingest
promoted it to a real line break, so one `header:` value spliced three deck-scope directives into
a deck. The defect predates the policy; the policy is what made it fire, so HARD RULE #18 owns it.

## If you are adding a markdown ingest

Normalize at the ingest, add the file to `SANCTIONED_EOL_BOUNDARIES` with a justification, and add
a case to the matching guard that you have **watched fail**. The gate will make you, within its reach: an
unlisted fold fails the build, so does a listed boundary that carries a fold without the matching
BOM strip, so does a fold spelled `\r?\n` or `\r\n`, and so does a `utf8` read that anchors front
matter on `/^---\n/` without normalizing first. What it CANNOT see is an ingest that parses front
matter some other way — so the list is still a discipline, with a machine covering the shapes that
have actually bitten. See `2026-08-24-what-shipped-was-a-claim.md` §What this gate still cannot see. If the ingest is in `docs/src` and can
import TypeScript, call `normalizeSourceText`; if it cannot, carry the pattern inline and say why
in the sanction entry.
