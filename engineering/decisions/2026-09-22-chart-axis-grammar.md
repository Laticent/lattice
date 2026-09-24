---
status: in-progress
summary: >
  FOUR axis grammars ship today and no two agree: `matrix-grid` and `scatter` discriminate an axis
  by COUNTING code spans in a paragraph, `quadrant` by an arrow glyph that needs a HARD RULE #29
  carve-out and advertises an ASCII `->` spelling markdown-it escapes before it ever fires, `gantt`
  by a keyword prefix on order-independent pills, and
  `lift-label-set.js` cannot discriminate at all so it try-parses every one-code paragraph. All
  three collapse onto ONE bracketed list — `[Effort, Reach]`, `[{Effort, 0..10}, {Reach, 0..100}]`
  — with quotes optional (single or double) and protecting commas, and `..` for a range because the
  en-dash it replaces is a typed glyph that goes ambiguous on a negative domain. The load-bearing
  decision is that POSITION confers authority: a bracketed span above the chart body is the AXIS,
  one below it is the LABEL SET. `{Effort, 0..10}` and `{[x], Enacted}` are the same shape, so
  nothing in the grammar could tell them apart and nothing should try — which is what lets one
  tokenizer serve both, with arity declared by the caller (`maxParts`). Defaults derive NUMBERS and
  never WORDS: a range nice-ceils from the data and a threshold takes the midpoint, but no source
  can name an axis, so the semantic default lives in the component's `skeleton` as editable text
  rather than in inference at render time. Parser is single-pass over indices
  (`lib/core/bracket-list.js`); the first cut scanned three times and was SLOWER than the regexes it
  replaced (2202ns vs 1415ns), the rewrite is 2.5x faster on quadrant's eyebrow and cuts per-char
  cost 18.6ns to 3.4ns, and nothing backtracks so the super-linear shape that bit `label-set.js`
  is not expressible.
---

# One grammar for a chart axis, and position decides what a span means

**Date:** 2026-09-22 · **Status:** in progress — kernel and three components landed (quadrant 2026-09-24)
**Refs:** #2258 (the label-set epic this is the sibling of), #2272 (label sets
rolled out to four components)

## Question

`#2272` gave a label set one construct: an inline-code span holding
`[{key, label}, …]`, placed near the chart. Charts also have AXES, and those were
never standardized. The ask: one way to author an axis, defaults that come from
semantics rather than invention, deterministic placement for the inline-code
spans, and our own parser rather than a regex per component.

## The measured ground — four grammars, none agreeing

| Grammar | Components | How it is told apart | What it costs |
|---|---|---|---|
| `` `Wider reach`  `Deeper cognition` `` | `matrix-grid`, `scatter` (a third span names the bubble measure) | by COUNTING code spans in the paragraph | The count IS the grammar, so a label set is forbidden from being two spans — one construct constrains another for no reason a reader could guess |
| `` `Effort 0–10 → Reach 0–100 · targets 5, 50` `` | `quadrant` | by an arrow glyph | Needs a HARD RULE #29 carve-out (`isQuadrantAxisEyebrow`) to pass the typed-glyph gate; packs names, domain and thresholds into one string; its documented ASCII `->` spelling never fires, because markdown-it escapes it to `-&gt;` before `parseEyebrow` sees it |
| `` `2026 Q1 .. 2026 Q4` `today Q3` `` | `gantt` | by a KEYWORD prefix on order-independent pills | A third shape again, and the one closest to right: it already carries a domain and a threshold marker per axis |
| nothing authored — derived from table headers and value pills | `bar`, `line`, `bullet`, `waterfall`, `stacked-bar`, `radar`, `slope`, `gantt`, `heatmap` | — | No way to NAME an axis when the derived one reads wrong |

And placement was never a rule. `lift-label-set.js` scans *every* one-code
paragraph in a section and relies on `parseInlineSet` returning `null` to let
eyebrows through; its own header calls that a hard-won trap. The scaffolder
teaches three different positions: `quadrant` and `scatter` put the axis line
before the heading, `matrix-grid` after the prose.

## Decision 1 — one bracketed list, members positional

```
`[Effort, Reach]`                          names only
`[{Effort, 0..10}, {Reach, 0..100}]`       name + domain
`[{Effort, 0..10, 5}, {Reach, 0..100, 50}]` name + domain + threshold
`[Annual cost, Teams adopting, Seats]`     scatter's third member sizes the bubble
```

Quotes are optional, single or double, and **protect commas** — so
`["Cost, excluding tax", "Value"]` is two axes, not three. Banning commas in a
name fails the first author who measures cost excluding tax.

Ranges are `..`, and that is the HOUSE spelling rather than a new one. `gantt`
already ships it for every task span and its docs are explicit — "`..` is the
ONLY span delimiter — a hyphen or en-dash is not recognized" — with `lint:deck`
flagging the en-dash as a *retired delimiter*. So `quadrant`'s `Effort 0–10` is
the outlier against a rule a sibling component already enforces. The en-dash is
also a typed glyph (HARD RULE #29) and goes ambiguous on a negative domain:
`-5–10`.

`gantt` corroborates the defaults rule too, in its own words: its window and
`today` pills are "both optional; the axis derives from the data without them."


**Per-axis thresholds are a modeling fix, not a respelling.** `· targets 5, 50`
is a trailing blob detached from the axes it constrains, so a reader counts
positions to learn which `5` belongs to which axis. A threshold belongs to its
axis and now sits in it.

## Decision 2 — POSITION confers authority

```
`[ … ]`     above the chart body   →  AXIS
<chart body>
`[ … ]`     below the chart body   →  LABELS
```

This is the load-bearing decision and everything else follows from it.
`{Effort, 0..10}` and `{[x], Enacted}` are the same shape; nothing in the
grammar distinguishes them and nothing should try. The three grammars above are
all deformed by the job of self-identifying — a span count, an arrow glyph, a
try-parse-and-hope. Give position the authority and the parser never has to
out-guess anything: it looks at two known slots instead of scanning a section.

That is also why the tokenizer can be shared. One scanner, two readings, chosen
by where the author put the span.

## Decision 3 — derive numbers, never words

The engine computes what the data can answer and refuses to invent the rest.

| | Source | When |
|---|---|---|
| axis **range** | the author's own values, nice-ceiled | render time |
| axis **threshold** | midpoint of the range | render time |
| axis **name** | the skeleton the author edits | authoring time |
| a name the engine guessed | **never** | — |

Range and threshold already work this way in `quadrant` and in `gantt`, and are
kept. A NAME is
different in kind: nothing in the data knows an axis is called "Effort", and two
candidate sources both fail on inspection.

- **Value-pill affixes** (`$`, `%`, `kg`) give a UNIT, not a name. The axis is
  "Annual cost", not "Dollars".
- **`matrix-grid`'s table header** — `| Verb | Self | Team | Org | Field |` —
  does name the row axis with `Verb`, but `Self/Team/Org/Field` are the column
  axis's TICK labels, not its name; "Wider reach" appears nowhere in the table.
  Deriving names one axis and leaves the other blank, which reads as a fault.

**Where the semantic default actually lives: the `skeleton`.**
`manifest.schema.json` already carries one per component — "markdown emitted by
the scaffolder" — and that is the template an author starts from and edits. The
default wording is editable text on the slide, not inference at render time. No
magic. `scatter`'s skeleton hands the author `` `X measure` `Y measure` ``,
which is exactly the placeholder this rule rejects, and it is replaced.

## Decision 4 — our own parser, single-pass

`lib/core/bracket-list.js`. A left-to-right character scan recording each part
as a pair of indices, so a character is read once and a string is allocated only
for a part that survives. Arity is the CALLER's (`maxParts`): an axis wants
three parts, a label set two, because a label is prose and
`{1, Good, better, best}` keeps its commas.

**What actually shipped is TWO readers, and the note should not pretend
otherwise.** A label set is still parsed by `parseInlineSet`; `maxParts` has no
production caller. That is deliberate — `parseInlineSet` is what `lint:deck`
validates against and what the browser bundle carries, so replacing it is a
change to that gate rather than a rider on an axis feature. A test pins that at
`maxParts: 2` the scanner reproduces `parseInlineSet` member-for-member on the
shipped strings, which makes the convergence a demonstrated path rather than a
claim. Until someone walks it, one grammar is served by two parsers.

**The range and threshold parts are honored by `quadrant` only.** `matrix-grid`
and `scatter` read `parts[0]` only, so on those two `[{Effort, 0..10, 5}]`
renders exactly as `[Effort]`. `quadrant` reads all three (see "Quadrant,
migrated" below).

Nothing backtracks, so the super-linear blowup that bit `label-set.js` (3000
characters, 10.9s, reachable from the browser linter under HARD RULE #22) is not
expressible rather than merely fixed.

### Measured, and the first cut was wrong

The first implementation split into members, then split each member into parts,
then tidied each part — three full scans of the same characters — and it was
SLOWER than the regexes it replaced. Recorded because the module header already
claimed "linear" while the thing was losing:

| case | old grammar | first cut | shipped |
|---|---|---|---|
| quadrant axis | 1537 ns | 2202 ns | **776 ns** |
| label set | 1282 ns | 1995 ns | **860 ns** |
| pass-through eyebrow (the common case) | 109 ns | 104 ns | **91 ns** |
| adversarial 3000-char | 17424 ns | 53617 ns | 24815 ns |
| per character | — | 18.6 ns | 5.7 ns |

**The adversarial row went the wrong way and is reported rather than dropped.**
The shipped scanner is SLOWER than the regex it replaces on a pathological
input, and slower than its own mid-work state, because two correctness fixes
cost per-character work: `tidy` now normalizes every whitespace form the regex
does (it was diverging on 50,955 of 300k fuzzed inputs), and the parser refuses
to read structure out of a stray brace. Growth is flat-linear out to 27,000
characters (~4.8 ns/char, 130 us), so the property that matters — no
backtracking — holds; against an old failure mode of 10.9 SECONDS, 25 us on
input no author writes is not worth buying back with cleverness. Real axis
lines are ~40 characters, where the scanner is 2x faster.

### Whole-deck: no measurable change, which is the honest result

`npm run bench` on this box, same tree, before and after. The portable signal is
`index` (dataset ms divided by a markdown-it calibration probe, so clock speed
divides out); this machine runs ~50% slower than the blessed one, so absolute ms
is not comparable to `baseline.json`.

| dataset | before | after |
|---|---|---|
| charts (23 slides) | 17.25 | 16.35 |
| normal (jargon, 58) | 19.90 | 19.62 |
| math (16) | 18.77 | 18.59 |
| stress (jargon x6, 348) | 71.77 | 73.70 |

**All four are inside the committed 12% variance band and they move in BOTH
directions, so this is run-to-run scatter rather than a win.** Parsing is
microseconds against an ~80ms render, so a 2x parser cannot show up at deck
scale and does not. Recording it because the alternative — quoting the 5% on
`charts` and omitting the 3% the other way on `stress` — would be picking the
number that flatters the change. `bench:bless` is NOT re-run here: nothing
moved beyond the band, so the committed baseline still describes the engine.

## What this does NOT decide

- **The register (front-matter) form.** Still has no caller, for the reason
  `#2272` recorded: a chart transform receives `{cls, classTokens, orientation,
  utils}` and front matter never arrives. Reaching it means changing
  `transformChartSection`'s signature on both render paths — a coordinated pass
  of its own (HARD RULE #1), not a rider on this one.
- **Whether the nine derive-only charts gain an authored axis.** The grammar
  admits them; whether each SHOULD is per-component and not settled here.
- **`gantt`'s migration.** Its pills are keyword-tagged and order-independent
  (`today Q3` means the same wherever it sits), which is a genuinely different
  reading from a positional list. The grammar can express it —
  `[{Timeline, 2026 Q1..2026 Q4, Q3}]` — but whether the keyword form should
  survive alongside is not settled here.
- **`[x]` as a one-member list.** `` `[x]` `` is a state mark to
  `inline-code-directives.js` and parses as a one-member list here. Dispatch
  order is what keeps them apart, and it needs an arm pinning it.

## Quadrant, migrated (2026-09-24)

`quadrant` now declares `axisSet` (`members: [x, y]`, `body: list`,
`keyBelow: false` because it claims a trailing coda) and reads its axis through
the shared lift. What it took, and what was decided along the way:

- **One reading of a member's parts, shared.** `lib/core/axis-member.js`
  decides what `{Effort, 0..10, 5}` means: the first part is the name, a part
  with `..` is the domain, a bare number is the threshold. The transform, the
  narrator and `lint:deck` all call it, so they cannot disagree about which
  parts were honored. **Domain and threshold are told apart by shape, not by
  slot.** `parseBracketList` drops an empty part, so `{Effort, , 5}` cannot
  hold the domain's place; a threshold without a domain is written
  `{Effort, 5}`. The NAME stays positional: it is always the first part.
- **The list is consumed.** The old eyebrow printed on the slide AND named the
  axes, so every quadrant said its axes twice. This is the same call scatter
  made. A plain eyebrow beside the list survives, which the demo deck shows.
- **Loss-free, measured.** All 17 decks that authored the old eyebrow were
  rendered on `main` and on this branch, and the `quadrant-figure` SVGs were
  compared with render-sequence ids stripped: **53 of 54 are byte-identical**.
  The one that differs is `examples/adaptive-sweep.md`, which used the ASCII
  `->`. That spelling never worked, so on `main` its x-axis read
  "Effort 0-10 -&gt; Reach" on a 0–100 domain; it now reads "Effort" on 0–10.
- **One threshold is enough to turn the lines on.** The old `targets` blob
  needed both numbers. Now either axis's threshold turns them on, and the other
  axis takes its midpoint, which is the "derive numbers" rule from Decision 3.
- **The migration is the linter's autofix.** `quadrant-retired-axis` rewrites
  the old eyebrow, so the migrator was that fix applied to every tracked `.md`.
  It is class-aware by construction: it fires only on a code-only line above
  the list on a `quadrant` slide, so gantt's `2026 Q1 .. 2026 Q4` lines
  (same shape, not positional) were never candidates. It is an ERROR rather
  than coaching, like gantt's retired delimiter, because the unmigrated deck
  still renders, only with its points moved.
- **The HARD RULE #29 carve-out is deleted.** `isQuadrantAxisEyebrow` and both
  callers are gone, and `checkTypedGlyphs` passes at budget 0 without them.
- **A lint fix the migration forced.** `parseInlineSet` accepts
  `[{Effort, 0..10}, {Reach, 0..100}]` as a label set, so `label-set-above-body`
  and `label-set-unbound` fired on the documented axis form: 22 warnings on
  the quadrant gallery. The same happened, unnoticed, on any braced
  scatter or matrix-grid axis. Above the body a list is a misplaced KEY only
  when it names one of the component's key members; otherwise it is the axis
  and the rule says nothing.
