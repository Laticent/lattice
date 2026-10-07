---
status: proposed
summary: >
  Segno is an owned grammar engine and ONE inline notation that replaces the 27 inline-code grammars Lattice ships
  today (34 counting list-text and retired ones, 21 sigils, `[…]` meaning six things, `:` five, `,` five, six
  charts parsing numbers with private regexes that disagree on `1,25M`). The notation has three shapes — a
  value, a `[list]`, a `{record}` — one separator (the comma), `name=value` for named arguments, double quotes
  that must close, and one escape. Meaning comes from a declarative SCHEMA per slot (a pill, a quadrant axis, a
  gantt task pill), so a bare word binds to the one parameter whose type accepts it and order stops mattering
  without the parse ever guessing. Aliases and shortcuts (`[x]` = `{done}`) are declared, and a grammar in which
  two could claim the same word does not build. Segno's compiler rejects any grammar that could backtrack or
  scan ahead unboundedly, so linear time on hostile input is a property of the engine rather than of review.
  Owner decisions so far: brace-record spelling, `|` reserved, an owned engine shipped as an @laticent library
  named Segno with a demo page and branding, per-deck alias consistency, and a clean break with no dual-syntax
  period because Lattice is not GA.
---

# Segno: one inline notation, and the engine that reads it

**Date:** 2026-09-28 · **Status:** proposed — owner decisions recorded in § "Decided"; phases in § "Plan"
**Follows:** `2026-09-28-parser-library-bakeoff.md` (why an owned engine, and the harness that will judge it)
**Related:** `2026-09-22-chart-axis-grammar.md` (position confers meaning — kept),
`2026-05-11-inline-code-directives.md` (the first inline-directive design — superseded by this for syntax)

## The problem, measured

An author who learns one chart's inline syntax has learned nothing about the next one's. An inventory
of `lib/` (every place that reads an inline-code span and gives it meaning) found:

- **34 grammars.** 27 read inline code in the render; 4 are list-text syntaxes (flowchart arrows,
  leading `- [x]` markers, the matrix-grid cell marker, `_track`); 1 is position-only; 2 are retired
  and lint-only.
- **21 distinct sigils.** `[…]` means six things (an inline state mark, a label set's outer bracket, an
  axis list's outer bracket, a leading marker, a matrix-grid marker with a DIFFERENT meaning for `[ ]`,
  the `_track` current item). `:` means five (pill modifier, flowchart modifier, `after:` / `today:`,
  journey mood `:4`, `:::` tint). `,` means five, including a thousands separator.
- **One idea, several spellings.** A range is `..` in gantt and quadrant and `–` or `to` in radar. A
  coordinate is ONE pill `` `3, 70` `` in quadrant and THREE pills in scatter.
- **Private parsers that disagree.** Six charts (piechart, funnel, map, progress, radar, word-cloud)
  read numbers with their own regexes. Funnel and map strip commas, so `1,25M` is 125 million there and
  1.25 million on every chart that uses `chart-values.js`.
- **Inconsistent case.** `AT-RISK` is a status in gantt (`chartStatus` folds case) and an unknown word in
  the flowchart (`STATUS_SET.has(w)` does not).

Across the 238 shipped decks there are 5,971 inline-code spans; the grammars above match a few hundred of
them, and the rest are ordinary code that must stay literal.

## Decided

| | decision | by |
|---|---|---|
| 1 | Own the parser; do not adopt a library | owner, after the bake-off |
| 2 | Unify the inline grammars into one notation, inline ones first | owner |
| 3 | **Brace record** spelling: `{BETA, tag, c4}`; where a span sits decides what it means | owner, over call syntax and a kind word |
| 4 | `|` is **reserved**: a parse error inside a record, free to mean something later | owner |
| 5 | **An owned grammar engine**, shipped as an official `@laticent` library | owner, over a fixed-notation-only kernel and a scanner toolkit |
| 6 | **Aliases and shortcuts** are supported | owner |
| 7 | The linter asks for **one spelling per deck** among aliases, with an autofix | owner |
| 8 | The library is named **Segno** ("sign, mark"; also the musical *dal segno* sign), with a **demo page and branding** | owner, after a scored shortlist |
| 9 | **Clean break**: a codemod rewrites every shipped deck and doc, the old parsers are deleted, no dual-syntax period | owner — Lattice is not GA |
| 10 | **Coordinates are one record** for quadrant and scatter alike: `{3, 70, size=12}` | owner |
| 11 | **Journey is a record** `{who=Customer, mood=4, volume=120}`, with `@Customer` kept as a declared shortcut for `who=`; `:4` and `+120` are dropped | owner |
| 12 | **One `color` type**, `c1`–`c12`, and each slot declares its ceiling (the flowchart's is 8), so `c9` on a flowchart is an error that names the limit | owner |
| 13 | **Segno is a general-purpose library; Lattice is its first user.** It is meant for non-Lattice uses too, so nothing in its API, messages or docs may assume Lattice: "per deck" is "per document", examples lead with general cases (a rollout rule, a retry policy), and Lattice is the documented first user. The phase-1 audit and what it left open: § General-purpose, not Lattice's | owner |
| 14 | **The license stays `AGPL-3.0-only`**, as its sibling libraries are, with the adoption cost stated (§ General-purpose, not Lattice's) | owner, over Apache-2.0 and MIT |
| 15 | **`color()` becomes a general `indexed(prefix, { max })`**; Lattice's color slots are `indexed('c', { max: 12, label: 'a color' })`, so decision 12 stands with a general type under it | owner |
| 16 | **No publish plan.** Segno, like every Laticent library, is not scheduled for publishing; the owner will publish the libraries together, deliberately, as its own act. No work plans around a release, and no step publishes anything | owner, correcting an earlier "publish after phase 2" |
| 17 | **The authoring semantics stand; only very strong evidence reopens them.** Decisions 3, 9, 10 and 11 (brace records, the clean break, coordinates as one record, journey as a record) are the better authoring choices, and Lattice is not GA, so they are not held open. Evidence still guides phase 2, but the bar to change one is high: phase 2's corpus binding must show the notation cannot express content the shipped decks hold, or that authors mis-write it in measured, repeated cases, not that a spelling looks unfamiliar. Raised by the trio's inversion | owner |
| 18 | **Both Segno build steps run on every PR.** Measured 2026-09-29: the generated-parser step takes about 0.1 s and is how `npm run build` regenerates `notation.generated.ts`; the library build takes about 1.7 s (it runs in `prepare` and in `npm run build`, so about 3.4 s of wall time in each of about seven CI jobs) and is the only check that catches a broken built package: a planted TS4094 declaration error passed the docs typecheck and failed only here. The rule: a per-PR step must add value and be fast, or it moves to nightly | owner, over moving the library build to nightly |
| 19 | **Sparks join the notation** as a record behind their own opener: `` `~{12 14 17, bar, c3}` ``, `` `~{72/80, bullet}` ``, replacing `` `~{12 14 17}:bar:c3` ``. Sparks shipped (#2453) the day this note was written and were missing from its migration table; they are row 28 now, and the phase-2 codemod rewrites them (211 spans in 10 files on 2026-10-04) under the clean break (decision 9) | owner, 2026-10-04, over keeping the colon syntax as a second grammar |
| 20 | **Segno is Lattice's one parser.** Pills, sparks, axes, labels and every grammar Lattice adds later are Segno grammars with slot schemas, never a new hand-written parser. Recorded here and not as a CLAUDE.md rule; a gate can follow once phase 2 has deleted the old parsers | owner, 2026-10-04, over a HARD RULE and over a gate with a 27-entry allowlist |
| 21 | **The engine takes three additions now, as their own PR**: `greedy()` (longest match, opt-in per loop), `until()` (skip to a literal of at most 64 characters) and a per-grammar `maxDepth` (to 1,000). Each one keeps the linear bound. The README's promise changes from "every ambiguous grammar is refused" to "refused unless a loop is marked greedy". § The engine has the measurements | owner, 2026-10-04, over waiting for phase 3 |
| 22 | **Pills accept 2.0x.** A pill reads in 0.7 µs against today's 0.35 µs; across all 183 pill spans in the repo's Markdown that is about 0.06 ms per full render, so binding off the flat tree is not worth its complexity | owner, 2026-10-04, at the phase-2 check-in |
| 23 | **A no-break space (U+00A0) is a space.** It separates and trims like a space and tab, and is kept inside quotes; text pasted from documents and chat carries it | owner, 2026-10-04, closing the open question |
| 24 | **Our decks are rewritten; nothing else reads the old spellings.** Every shipped deck and doc is rewritten, with no lint rule pointing at an old spelling. Lattice is not GA, so the one-off codemod was deleted before merge and a unit test keeps our own decks current | owner, 2026-10-04, over a retired-spelling lint with an autofix; the codemod dropped 2026-10-05 |
| 25 | **Tagged records live in the grammar.** One tag character directly before a span's `{` — `~` for a spark, `^` for an icon (`2026-09-29-inline-icons.md`) — is a production of the notation, not a check in Lattice's dispatcher. At the start of a span a tag character always opens a tagged record, so the grammar stays LL(1); a top-level bare value cannot start with one, and `~/path` simply fails to parse and stays code. A slot declares the tag it needs (`record({ tag: '~' })`) | owner, 2026-10-04, over a dispatcher check before the parse |

## The notation

### Three shapes, decided by the first character

```
span    := "\" rest              escape: the whole span is literal code
         | shortcut              an exact declared token, e.g. [x]
         | value
value   := record | list | scalar
record  := "{" item ("," item)* "}"      "{" must be followed directly by a non-space
list    := "[" elem ("," elem)* "]"       an empty elem holds its place: [, Reach]
item    := name "=" value | value
name    := letter (letter | digit | "-")*
scalar  := quoted | bare
quoted  := '"' ( char | '\"' | '\\' )* '"'
bare    := every character up to the next , = { } [ ] | or the end, trimmed
```

The first character decides which shape is being read, and every later decision is made by the
character at hand, so a span is read in one left-to-right pass that never goes back.

- **`=` is always a stop character, and names an argument only after a name.** `after=Design` is
  named; a name must be a word (`[A-Za-z][A-Za-z0-9-]*`), and anything else before `=` is an error
  whose fix quotes the item. So a flowchart key that names its heavy arrow quotes it:
  `[{"=>", Main path}]`. An earlier draft let `=>` at the start of an item be bare; that needs two
  characters of lookahead to tell from `=`, which the one-character rule below refuses.
- **Commas are the only separator.** No `:`, no `·`, no `→`.
- **`{` must be followed directly by a non-space.** That rule is what keeps real code literal:
  measured over the 5,971 shipped spans, exactly one non-pill span starts with `{` — `{ ok, scene }`,
  a padded JavaScript object — and the rule excludes it. By contrast 30 shipped spans are CSS calls
  (`var(--bg)`, `color-mix(…)`), which is why call syntax was rejected.

### Quoting and escaping: one way to do each job

- **Double quotes only, and they must close.** `"Cost, excluding tax"` protects a comma. An apostrophe
  is never special, so `Customer's spend` needs no quotes. An unclosed quote is an error with a
  position, not a scan for a partner — the scan the bake-off found every library needing a workaround
  for is not expressible.
- **Quotes force the text type.** `2026` is a number and `"2026"` is text; `Q1` is a quarter and `"Q1"`
  is the word.
- **Inside quotes, two escapes:** `\"` and `\\`. Outside quotes a backslash is an ordinary character.
- **A leading `\` turns the whole span off** (kept from today): `` `\{BETA, tag}` `` shows as written,
  and so does `` `\[x]` ``, so a shortcut can be shown literally too.
  Markdown leaves backslashes in code spans alone, which is why this works identically on both render
  paths (`lib/core/inline-code-directives.js` header).
- **Whitespace** is trimmed around unquoted values and kept exactly inside quotes.

### Value types

A bare scalar has no type until a slot asks for one; the slot's schema says which types it accepts,
and a bare word is read as the first type in that list that accepts its spelling.

| type | spellings | notes |
|---|---|---|
| `number` | `42` `-1.2` `12%` `$4.2M` `-$0.8M` `($1.2M)` `1,25M` `1.234.567` | ONE reader for every chart, `chart-values.js`'s rules (sign, accounting parens, separators, magnitude) |
| `range<T>` | `0..10` `Q1..Q3` `2026-01-01..2026-03-15` | `..` is the only range delimiter, as it already is in gantt |
| `time` | `2026-03-15` `2026 Q1` `Q3` `Jan` `2026 Sept` | `gantt-time.js`'s rules |
| `enum` | `tag` `c4` `lg` `at-risk` | case-insensitive everywhere; values and aliases declared |
| `id` | `#api` | |
| `flag` | `milestone` `total` `dashed` | a declared word that sets a boolean |
| `text` | anything else, or anything quoted | the fallback, and the only type quotes can give |

### Binding a record to a slot's schema

A slot declares its parameters in the component manifest:

```json
"segno": {
  "pill": {
    "primary": { "name": "value", "type": "text" },
    "params": {
      "shape": { "type": "enum", "values": ["pill", "chip", "tag", "tag-bordered", "circle", "chevron-right", "chevron-left", "diamond"] },
      "color": { "type": "enum", "values": ["c1", "…", "c12"] },
      "size":  { "type": "enum", "values": ["sm", "md", "lg"] }
    }
  }
}
```

Binding is deterministic:

1. The first positional item is the **primary** (a pill's label, an axis's name).
2. A `name=value` item binds to that parameter; an unknown name is an error.
3. A bare item binds to **the one parameter whose type accepts it**. If none does, it is an error; if
   two could, the schema does not build (below), so this never has to guess. Where two parameters
   genuinely share a type — journey's `mood` and `volume` are both numbers — the schema wraps them
   in `named(...)`, which takes them out of bare binding: they must be written `mood=4`.
4. A parameter given twice is an error.
5. **Any error leaves the span literal and reports it** with a position and a fix. Nothing is ever
   half-applied — the rule `inline-pills.js` already follows ("never guess, never silently drop").

So `{BETA, tag, c4}`, `{BETA, c4, tag}` and `{BETA, shape=tag, color=c4}` are the same pill, and
`{Effort, 0..10, 5}` binds `0..10` to the range and `5` to the target without either being named.

### Aliases and shortcuts

- **An alias** is an extra spelling for one enum value: `done` also answers to `yes` and `pass`.
- **A shortcut** is an exact whole-span token that expands to a record: `[x]` is `{done}`, `[-]` is
  `{partial}`, `[!]` is `{fail}`, `[?]` is `{unknown}`, `[ ]` is `{todo}`, `[/]` is `{skip}`. The
  checkbox look survives, and a one-character list is never a real axis, so the shortcut cannot
  collide with a list.
- **Ambiguity is a build error.** Segno refuses to compile a schema in which two parameters, two values
  or an alias and a value of one slot could claim the same word. The author never meets an ambiguous
  span, because it cannot be declared.
- **One spelling per deck** (decision 7): a deck that mixes `[x]` and `{done}` gets a lint warning with
  an autofix to the spelling the deck uses most. A word swaps for a word in place; a shortcut stands
  for a whole span, so a swap to or from one rewrites the span, and only when the spelling is alone in
  it (`{done, note=Shipped}` has no shortcut form, so it gets the warning without a fix).

### What every current grammar becomes

| # | today | Segno |
|---|---|---|
| 1 | `` `[x]` `` `` `[-]` `` … | unchanged, as shortcuts for `{done}` `{partial}` … |
| 2 | `` `{BETA}:tag:c4` `` `` `{1}:circle:c5:lg` `` | `` `{BETA, tag, c4}` `` `` `{1, circle, c5, lg}` `` |
| 3 | `` `\{LIVE}` `` | unchanged |
| 4 | `{x}` reserved as a checkbox typo | kept: a pill whose label is `x` `-` `/` or space is refused, and the linter points at `[x]` |
| 5 | `` `[{1, Good}, {2, Better}]` `` | unchanged |
| 6 | `` `[{Effort, 0..10, 5}, Reach]` `` | unchanged; `target=5` also accepted |
| 7 | parts classified by shape | the same, now by the schema's types |
| 8 | `` `[{Timeline, 2026 Q1..2026 Q4, Q3}]` `` | `` `[{Timeline, 2026 Q1..2026 Q4, today=Q3}]` `` |
| 9 | `` `Q1..Q3` `` | unchanged (a `range<time>` value) |
| 10 | `` `after: Design` `` `` `milestone` `` | `` `after=Design` `` `` `milestone` `` |
| 11 | `` `Q1..Q4` `today Q3` `` eyebrow | retired; the bracket axis (row 8) is the one form |
| 12 | status words, case folding varies | one `status` enum, case-insensitive everywhere |
| 13–14 | `chart-values.js` + six private readers | one `number` type everywhere, so `1,25M` means 1.25M on every chart |
| 15 | waterfall `total` / `step` must be last | a flag, order-free |
| 17–18 | scatter: three pills; quadrant: one `` `3, 70` `` pill | `` `{3, 70, size=12}` `` for both (decision 10) |
| 19 | journey `` `@Customer` `:4` `+120` `` | `` `{who=Customer, mood=4, volume=120}` ``, or the `` `@Customer` `` shortcut (decision 11) |
| 20 | heatmap `` `# why` `` | `` `note="why"` `` |
| 21 | kanban `` `XL` `` | unchanged (a `size` enum) |
| 22 | state-chart `` `approve => 2` `` | retired with state chart v1: v2 (#2424) reads the flowchart's rows, `-approve-> Approved`, so its styles are row 25 |
| 23 | state `` `start` `` `` `at-risk` `` | unchanged (enum words) |
| 25 | flowchart `` `#api:diamond:c2` `` `` `:dashed:cross` `` | `` `{#api, diamond, c2}` `` `` `{dashed, cross}` `` |
| 26 | QR `` `ssid` `` postfix key | unchanged (an enum key) |
| 27 | radar `` `Scale · 0–100` `` | `` `0..100` `` |
| 28 | sparks `` `~{12 14 17}:bar:c3:lg` `` `` `~{72/80}:bullet` `` | `` `~{12 14 17, bar, c3, lg}` `` `` `~{72/80, bullet}` `` (decision 19): a tag character before a record, read by the grammar (decision 25); the first item is a `series` (2–48 numbers, space-separated) or a `ratio` (`72/80`, `72%`) — the tag form decided by the owner, 2026-10-04, with icons (`2026-09-29-inline-icons.md` decision 6) |

Out of scope for the first cut, because they live in list TEXT rather than inside backticks: flowchart
arrows (`A -> B`), leading `- [x]` markers, the matrix-grid cell marker, and `_track`. They are Segno's
second grammar, not its first. Phase 3b moved the arrows and phase 3 the other three (§ Phase 3b as
built, § Phase 3 as built: list text).

## The engine

**Segno is a grammar engine, and the inline notation is its first grammar.**

- **Grammars are data.** A small vocabulary — `lit`, character sets, `seq`, `alt`, `many`, `opt`,
  `ref`, and `node` to keep a span — written as TypeScript values. No grammar files. Aliases,
  shortcuts and sigils belong to the schema layer, not the grammar.
- **The compiler rejects anything that is not LL(1) over characters.** Every choice must be decidable
  from ONE character; every loop body must consume, and must not be able to both repeat and stop on
  the same character; no rule may reach itself without consuming. A grammar that fails any of these
  does not build, and `GrammarError` lists every violation with its rule path. The quadratic cases the
  bake-off measured (a forward scan per quote, a speculative arrow per word start) cannot be written.
  Nesting is capped at 64 levels, so deep input is an error rather than a stack overflow.
- **Two runtimes, one proof.** `compile()` builds a parser from closures, for a grammar that arrives at
  runtime (the demo page's). `generate()` writes the same parser as TypeScript source — straight-line
  code, character tests inlined as comparisons and 128-entry ASCII tables, parser state at module
  scope, and the tree written into one reused `Int32Array` (four integers per node) rather than
  allocated. The notation ships generated (`notation.generated.ts`); the build regenerates it,
  `segno-lib:check` fails when it is stale, and a test holds both runtimes to identical output on
  20,000 fuzzed spans.
- **Types come out of the schema.** A slot's bound record is inferred in TypeScript from its
  declaration (`RecordOf<S>`), so a consumer that reads `pill.shape` is checked against the schema that
  defines it. Nothing is emitted; the declaration is the type.
- **Diagnostics are data.** Every error carries a code, a message, a character range and, where one
  exists, a fix — the shape `lint-core` already reports, so the linter, the Studio and the narrator
  read the same errors the renderer acted on (HARD RULE #1, #7).

**Package shape, as its siblings are:** `docs/src/lib/segno/` — `README.md`, `package.json`
(`@laticent/segno`), TypeScript source, zero dependencies, a `dist/` with CJS and ESM that `lib/`
consumes, the way `lib/components/chart/flowchart/` consumes Trama.

**Acceptance, from the bake-off harness:** the notation grammar must read every migrated shipped span
correctly; per-span time must stay within 1.5x of today's kernels on the real corpus; and every shape
on the scaling ladder must grow linearly (32k/8k ratio near 4).

**Measured in phase 1** (`npm run parser:bakeoff:segno`; best of seven long rounds; before and
after run alternately in one session on one machine, the before from the previous commit via
`SEGNO_LIB`):

| job | kernel | Segno first cut | Segno now | now vs kernel |
|---|---|---|---|---|
| inline dispatch, every span | 30 ns | 48 ns | 45 ns | 1.5x |
| ordinary code (99% of spans) | 27 ns | 43 ns | 39 ns | 1.5x |
| state marks `[x]` | 41 ns | 205 ns | 34 ns | **0.8x** |
| pills | 350 ns | 782 ns | 701 ns | 2.0x |
| bracket lists, split into parts | 767 ns | 1.02 µs | 828 ns | 1.1x |
| quadrant axes, typed | 721 ns | 1.73 µs | 1.02 µs | 1.4x |
| error path (non-axis lists bound as axes) | — | 2.86 µs | 1.68 µs | — |

The **1.5x target is met everywhere except pills (2.0x).** What changed between the two columns:

- **Shortcuts bind once.** `[x]` expands to a fixed record, so its bind is computed when the schema
  is built and a read is a lookup (and frozen, so no caller can change the shared result).
- **Numbers take a single pass.** `readNumber` was eight regular-expression passes per token. A
  hand-written pass now reads the shapes decks write (`5`, `$1.2M`, `-$0.8M`, `(12M)`, `62%`)
  and hands the rest (commas, several dots, inner spaces) to the full reader; a 300,000-token fuzz
  holds the two identical.
- **A bare word is read once.** The search for the parameter that accepts a word read the
  winning candidate, then `put` read it again, so every number and range was parsed twice.
- **Each shape is its own grammar rule.** `record`, `list` and `quoted` were expressions embedded in
  both `value` and `item`, so the generator wrote each twice into two functions too large to
  inline. References to rules that cannot recurse no longer spend the nesting cap, which is now 31
  levels of brackets (two references per level); `MAX_NESTING` states it and a test pins it.
- **The error path is cheap.** The reader's internal throw is no longer an `Error` (constructing one
  captured a stack trace), and a slot's "it takes …" text is built once.

**The harness was wrong first, and it mattered.** The first cut bound every bracket list in the
corpus to the axis schema. A quarter of those lists are label sets, gantt timelines, flowchart keys
and CSS selectors that today's shared splitter also reads, so 40% failed and the error path was
reported as the axis cost: "2.7x" there was partly measurement. The arm now compares the same
job — every list split into parts — and the axis job only on lists that are axes, on both sides.

**What is left.** Pills are the one miss. About 280 ns is the grammar and about 300 ns binding, and
the grammar's figure depends on what V8 has seen: 110 ns in a fresh process, about 280 ns once the
same process has parsed lists and failed spans. The trigger reproduces with the real corpus but not
with a handful of inputs, and V8 names no single deoptimization; chasing it further is tuning for
one JIT, so it stops here. In absolute terms a pill costs 0.7 µs, and the shipped decks hold 24
of them. **Check-in:** phase 2 either accepts 2.0x on pills or binds straight off the flat tree,
which removes the tree-to-values step (about 80 ns) and most of the binding allocations.

### Three additions for document-sized grammars (decision 21)

Phase 1's engine is built for short spans, and a probe on 2026-10-04 asked whether it could read
whole CSS, HTML and Markdown files. Written strictly, all three grammars were refused at the same
places: a run of letters next to another run (longest match), `/` against `/*`, and "read until
`</script>`". So three additions landed, each in both runtimes, and the README documents them:

- **`greedy(many|many1|opt)`**: the checker accepts the overlap and the loop goes round. The
  parser was already longest-match, so the runtime is unchanged. A check refuses a greedy loop whose
  successor can never match, and it follows rule references. It is computed as "the characters
  that cannot come next, however the piece matched", because the first version refused valid
  grammars (an `opt` takes at most one character) and missed dead code behind a rule reference.
  That answer always has the shape `a ∪ (b ∩ before)`, so each rule is summarized once, in
  dependency order (a strongly-connected-components pass, so only rules that reach each other
  iterate). Walking references instead cost exponential time on a rule reached by many routes (a
  valid 25-rule grammar took 10 s to compile), and one fixpoint over all rules in source order
  cost a round per rule on a chain written top-down (24.5 s for 4,000 rules; 0.9 s now). The
  engine's older FIRST/FOLLOW fixpoints were quadratic on a chain listed bottom-up (12.4 s for
  4,000 rules), and so was `recursiveRules()`, which searched from every rule. On 2026-10-05 both
  fixpoints became worklists seeded in dependency order (an expression is recomputed only when
  something it reads changed, and outside a cycle it is computed once), and recursion is read off
  the same SCC pass: 43 ms for 4,000 rules in either order, and a checker found `lint()`,
  `generate()` and parses identical to the previous version on 320,000 random grammars. The last
  quadratic step was building the "expected …" text: `expectedAt()` wrote every choice's message
  when `compile()` built it, and on a chain whose FIRST sets grow from rule to rule
  (`r_i = alt(c_i, r_i+1)`) each text lists everything reachable (6.5 s at 2,000 rules, and a
  stack overflow at 4,000). On 2026-10-05 `compile()` began building that text only when a parse
  records an error (an attempt that fails and rewinds counts), at most once per choice for the
  compiled grammar's life; `lint()` stopped building a parser at all (it runs the analysis
  `compile()` and `generate()` share, and the same `maxDepth` check); the left-recursion check
  became one SCC pass over the "can enter before consuming" graph instead of a search from every
  rule; and every analysis walk became iterative. `lint()` on that chain: 1,364 / 6,633 ms /
  RangeError at 1k / 2k / 4k rules before, 64 / 78 / 139 ms after (154 ms at 8k), and 10,000
  levels of nesting in one rule lint in 283 ms where 2,000 overflowed. A differential of 20,000
  random grammars (`greedy`, `until`, attempts, recursion) against the previous engine found the
  same `lint()` problems, the same `generate()` source and the same trees and errors on 479,446
  parses. `generate()` still writes every message, because generated code carries them as
  strings; only shipped grammars are generated. One limit remains: `compile()` builds its
  closures recursively, so one rule nested about 3,000 levels deep still overflows while
  building (as it did before); `lint()` of the same grammar does not.
- **`until(end)`**: one `indexOf` and no re-reading. `end` is capped at 64 characters, because
  `indexOf`'s slow case is input × terminator: the red team measured 1.5 µs per input character
  for a 16,384-character terminator, against 4 ns for 32 characters.
- **`maxDepth`** per grammar, up to 1,000, plus a backstop that turns a stack overflow into an
  error (`STACK_EXHAUSTED`) rather than a throw. It catches only stack overflows, and names no cap,
  because where the stack runs out depends on the engine and on how warm its JIT is. Measured on
  Node 22: `compile()` overflowed at about 2,300 nested references on a thin grammar and about 150
  on one with 30 expressions per level. The generated parser reached about 8,600. On a thick grammar
  the two runtimes can therefore disagree. The shipped engine's `compile()` threw there.

**Nothing Lattice runs changes.** `generate(notationSpec)` is byte-identical, and the generator emits
the backstop only when a grammar raises `maxDepth` above 64.

**Measured on the repository's own files** on 2026-10-04 (fresh process per run, median of five, on
the files both versions read). The right-hand column reproduces with `npm run parser:bakeoff:languages`,
whose grammars are `tools/parser-bakeoff/languages-grammars.mjs`; the strict grammars and the
before/after harness were a one-off probe and are not kept:

| | strict grammars | with the additions |
|---|---|---|
| files read: CSS / HTML / Markdown | 159/159 · 30/31 · 1,898/2,303 | 159/159 · 31/31 · 2,303/2,303 |
| generated parser, CSS / Markdown | 148 / 91 MB/s | 211 / 194 MB/s |
| hostile ladders (12 shapes aimed at the additions) | 6 of 12 refused | all 12 read, about 10x for 10x input |

The inline notation, pills and sparks are unaffected: the bake-off arm measures the same within
noise (pills 764 ns before, 759 ns after, median of three alternating runs). Sparks were also
written as a Segno grammar and raced against `lib/core/inline-sparks.js`: same answers on 211
real spans and 200,000 fuzzed ones. The grammar reads the text in 250 ns where the kernel's split
takes 810 ns, but turning the tree into values costs that back, as it does for pills. Binding
straight off the flat tree is the phase-2 fix for both (the pill row above).

**Review.** One checker and one red team (HARD RULE #25's maker-checker plus an adversary aimed at
the linear bound), then a second checker on the fixes. Neither of the first two found a compiling
grammar that runs superlinearly or an input that throws. Together the three found six defects, all
fixed with tests: the five below, and the exponential cost of the dead-code check's first fix
(above). Its replacement agrees with the walking version on 60,000 random greedy grammars — a
run that also caught a miss in the replacement's first draft, which did not summarize a sequence
nested in a loop body. A seventh came from driving the real `/segno` page: the check counted
PLAIN loops too, so its "greedy, then a quote" preset (a strict grammar) showed a second refusal
calling the loop greedy. Only greedy loops count now, and on 60,000 random strict grammars `lint`
matches `main` exactly (the pre-fix commit differed on 13,054). A fourth checker, on those last
fixes, confirmed the algebra and its soundness (0 false refusals in 16,000 random greedy grammars
against brute-force parsing) and found the round-per-rule cost above. The five: the dead-code check's false refusals and its miss
through rule references, the unbounded terminator, the backstop's invented level count, and its
catching every RangeError. Two limits are pinned as tests rather than fixed: greedy commits (above),
and the runtimes can disagree near the stack limit.

### Generated-parser speed, against real tokenizers (2026-10-07)

The owner asked whether Segno has room to be the fastest JavaScript parser on Markdown, CSS, HTML
and inline code without losing a capability. The `languages` arm compared Segno only with full
parsers, which build trees, so it now also races each parser's tokenizer layer, the like-for-like
job. Before this pass, Segno tied postcss's tokenizer on CSS (112 vs 112 MB/s) and lost to
css-tree's (149).

`generate()` took three changes. `compile()` and the grammar language are unchanged, so no
capability is lost. README § How the generated parser stays fast describes each one:

| change | CSS | HTML | Markdown |
|---|---|---|---|
| `main` | 112 | 117 | 101 |
| + a tested character is not tested again | 184 | 139 | 108 |
| + a shared piece is written once | 181 | 139 | 111 |
| + runs scan on locals, then by regex | **178** | **156** | **207** |
| tokenizer beside it | postcss 103, css-tree 142 | parse5 23 | markdown-it block pass 68 |

The figures are MB/s, best of eleven, and HTML's 0.2 MB corpus moves about ±20% from run to run.
Every tree is byte-identical to `main`'s on all three corpora (a checksum over the flat buffers).
The hostile ladders stay about linear, and several shapes got much cheaper (Markdown unclosed
backticks 18.8 → 2.0 ms, many headings 34 → 4.7 ms).

- **Tried and dropped: a jump table for wide choices.** A 128-entry branch table and a `switch`
  measured +2% on CSS and nothing elsewhere, inside noise, so it did not earn its code.
- **The checker found a quadratic case, now fixed.** A regular expression cannot stop at an
  `attempt()` window's end, so the first version read the rest of a long run on every attempt:
  8.7 s at 160k characters, where `main` takes 0.15 s. The trees were right, so no differential
  could catch it. The regex now runs only with no window open, and `attempt.test.ts` pins the
  timing. With no regex inside a window, an attempt again reads at most `max` characters, so
  the bound holds by construction, the shipped flowchart-row parser included. After the fix, the
  checker's differential found 0 mismatches against `compile()` and `main`'s generator on about
  1.2 million grammar/input pairs, and a planted mutant of the fix was caught 9,486 times.
- **Inline code did not move, and the arm overstates its gap.** These changes leave the inline
  notation within noise. Run on this machine, `parser:bakeoff:segno` reports ordinary code at
  4.5x the kernel (215 vs 47 ns). The same dispatcher timed alone takes 78 ns against the
  kernel's 54 (1.4x), which matches § The engine's 1.5x. So the arm's figure is a property of the
  harness, not of Segno. Followed up in `followups.d/`.

"Fastest" holds for what was measured: among JavaScript tokenizers on Lattice's own files, on one
machine and engine. The tokenizers it beats also classify tokens (css-tree tells a number from a
dimension, parse5 decodes entities). Matching that classification is grammar work, and it is
where an honest race against a full parser would start.

### Flowchart rows need a bounded attempt (the #2462 spike)

Phase 3 moves the flowchart's list text (`Storefront -SEV1-> Payments`) onto Segno, and #2462's
inversion review asked whether Segno can read it at all before phase 2 commits to the engine.
`npm run parser:bakeoff:flow` answers it against `splitRow` in `lib/core/flowchart-grammar.js`
(436 distinct flowchart and state-chart rows from the corpus, plus 200,096 fuzzed rows that
include escapes, long labels and labels at the 61-character cap). Measured 2026-10-05:

| grammar | builds? | agrees with the kernel |
|---|---|---|
| strict: at a word start, an arrow or a word | refused: `branches 0 and 1 can both start with "-", "<"–"="` | — |
| commit: a word may not start with `-` `=` `<` | yes | 433 of 436 corpus rows; 70,928 of 200,096 fuzzed |
| the arrow alone, strict, tried in a 66-character window at each word start | yes | **436 of 436; 200,096 of 200,096** |

- **The arrow is LL(1); the row is not.** Every arrow form (`->`, `<=>`, `-->`, `-label->`, a label
  with spaces and inner shafts, the 61-character cap) compiles as a strict grammar once it is
  followed by a space or the end. What does not compile is the choice at a word start: `-x` in
  `A -x B` is a word and `-x->` in `A -x-> B` is an arrow, and the two only part at the closing
  shaft and the character after it, up to 64 characters past the `-`. `node(kind, x)` fixes its
  kind when it opens, so no strict grammar can open an `arrow` node at the `-` and agree with the
  kernel. (The strings alone could be left-factored into a generic node, with the 61-character
  count spelled out rule by rule, but a second pass would then have to decide which nodes are
  arrows, and that pass is the second reader decision 20 rules out.)
- **`greedy()` from #2510 does not help.** It accepts a loop or an `opt` whose body and successor
  overlap, and it still never goes back: `greedy(opt(arrow))` commits exactly as the next row does.
  The conflict here is between two alternatives, and only one of them is the arrow. The strict way
  out is to commit (a word never starts with a shaft or `<`), and that misreads rows the kernel
  reads: `Raw <b>tag</b> -> A`, `<>`, and every word that starts with a dash, such as `-5%`.
- **What it needs: `attempt(x, { max, then })`**, a bounded ordered choice. Try `x` on at most `max`
  characters, and keep it only if the character after it is in the set `then` (or the input ends);
  otherwise rewind and take the next branch. The `then` check is not optional: without it
  `A ->x B` would commit to the arrow `->` and then fail the row, where the kernel reads `->x` as a
  word. The spike's window grammar does this check (a space or the end must follow the arrow).
  Each attempt reads at most `max` characters, so a parse costs at most `max` × input (per attempt
  tried at a position; "Built" below has the corrected bound), PROVIDED an
  attempt cannot reach another attempt: nested attempts multiply their `max` values, and an attempt
  reached through recursion multiplies once per level. The checker would refuse an attempt inside
  an attempt, and accept an overlap between an attempt's branch and the branches after it, and
  nothing else. The spike stands in for the primitive with a loop around the compiled arrow
  grammar (`tools/parser-bakeoff/flow-segno.mjs`).
- **Its cost, measured with the stand-in** (`compile()`'s closures and a sliced window; best of
  seven rounds): 1,047 ns per corpus row against the kernel's 559 ns (1.9x); on the hostile ladder
  (`-y ` repeated, an attempt every three characters, each running to the cap) 10.3 ms against
  1.45 ms at 8,000 characters and 42 ms against 5.9 ms at 32,000. Both grow linearly (4.1x for 4x
  input); the constant is 7 to 10 times the kernel's across runs, most of it the window slice and
  the closures, which `generate()` and an in-place attempt remove.
- **Checked** by one independent checker (tier 1): the counts above reproduce exactly, and its own
  adversarial fuzz (1.5 million rows: labels of 58 to 64 characters, `<` as the first label
  character, one to four shafts, `\r` `\t` `\n` in and around labels, astral characters, windows
  cut at the cap) found no row where the stand-in and the kernel disagree; planted bugs (a cap one
  short, `\r` not a space, no `<`) each produced thousands of mismatches. The `then` set and the
  nesting rule above are its findings.

**What this decides.** Phase 2 is unchanged: the flowchart's inline spans (row 25) are records, and
the list text was always phase 3. Phase 3 needs `attempt()` as an engine addition with its own
review (it widens what the checker accepts, as `greedy()` did), and the spike's grammar and parity
run are its starting point. The alternative, a hand-written loop around a Segno grammar as the
spike does, is the second reader decision 20 rules out.

**Built (2026-10-05).** `attempt(x, { max, next })` is in both runtimes, as specified above. The
option is `next`, not `then`: Biome's `noThenProperty` refuses an object literal with a `then`
key, because `await` treats such an object as a promise, and every grammar would carry one. Three
choices the spike left open:

- **Where a failed attempt goes.** As an `alt` branch, its character passes to the branches after
  it in order, then to the branch that matches nothing. The checker skips only the pairs whose
  FIRST branch is an attempt, so an ordinary branch still may not overlap anything after it, and
  an attempt may not start what follows a choice that can match nothing: the runtimes try
  attempts before that branch wherever it is listed, so the attempt would shadow it. Anywhere
  else, a failed attempt is a parse error, and it reports why the attempt failed (what its body
  expected, a `next` character, or its end within `max`), from one more read of its body without
  the window, so the reason is about the real input. A nesting cap
  reached inside an attempt is that attempt failing.
- **What `x` is checked against.** Inside the attempt, `x`'s FOLLOW is `next` plus the end, not
  the attempt's context: whatever else comes next, the attempt rewinds. The window's end reads as
  the end of the input (a multi-character literal checks it too, emitted only in grammars that
  hold an attempt, so the notation's generated parser is byte-identical). `max` is capped at
  `MAX_ATTEMPT`, 256. That bounds ONE attempt; a position costs the sum of `max` over the
  attempts tried there, which the grammar sets: several side by side in a choice, or in rules
  entered without consuming, each count (the red team measured 256 chained rules at 65,536
  reads per character). So the parse stays linear in the input with a constant the grammar
  chooses, which is true of every choice already, and unlike `until()`'s cap this is not a
  constant of the engine. Capping the sum was not done: it needs a per-position count across
  rules, and no grammar here comes near it.
- **What the checker refuses.** An attempt that reaches another, directly or through a rule (one
  summary per rule, in the SCC order the other passes use); `until()` inside one, whose
  `indexOf` would search past the window to the end of the input; an attempt whose `x` can
  match nothing; and, for a grammar built by hand rather than by `attempt()`, a `max` outside
  1–256 or a `next` that is not a set.

The row grammar replaces the spike's stand-in loop; it lived in
`tools/parser-bakeoff/flow-row-grammar.mjs`, which the bake-off and a unit test both import, until
phase 3b moved it to `lib/core/flowchart-row-grammar.js`. The
kernel's 61-character label cap counts from the label, not the arrow, so a headed and an unheaded
arrow at the cap differ in length by one, and the grammar spells each as its own attempt: the
headed one first, which requires its `>`, then the rest. Measured with `npm run parser:bakeoff:flow`
(best of seven rounds, one machine):

| | kernel | `compile()` | `generate()` |
|---|---|---|---|
| agrees with `splitRow`: 442 corpus rows | — | 442 | 442 |
| agrees with `splitRow`: 200,096 fuzzed rows | — | 200,096 | 200,096 |
| per corpus row | 528 ns | 936 ns (1.8x) | 827 ns (1.6x) |
| hostile `-y ` ladder, 2k / 8k / 32k characters | 0.28 / 1.16 / 5.2 ms | 3.1 / 12.8 / 44.7 ms | 2.3 / 9.3 / 36.0 ms |
| a label run past the cap, every 66 characters, 2k / 8k / 32k | 0.06 / 0.24 / 1.0 ms | 0.18 / 0.76 / 3.2 ms | 0.17 / 0.68 / 2.7 ms |

Every shape grows about 4x per 4x input, so the bound holds. The constant on the `-y ` ladder,
where every third character opens an arrow that reads to the cap, is 7x the kernel's, and half of
it is the doubled attempt: one attempt at a 64-character window measured 1.06x per row and
20 ms at 32k. The doubled attempt is a workaround, not the intended shape: `max` bounds the whole
arrow while the kernel's cap bounds its label. A `cap(x, max)` that only narrows the window and
never rewinds would let one attempt do both; phase 3 decides whether that constant matters
enough to add it. No corpus row comes near it, and the kernel itself spends 5 ms there.

Tests (`attempt.test.ts`): the checker's acceptances and refusals, rewinding (position, kept
nodes, depth, error), the window, fall-through to an empty branch, and the error reported, all in
both runtimes; a 256,000-character worst case under 1.5 s; and 8,000 random grammars with
attempts, where both runtimes must match a reference interpreter that takes nothing from the
engine's analysis: positions as return values, no shared state, and choices tried in written
order with backtracking (PEG), with Segno's one documented difference, that a branch which can
match nothing is the fallback (seed 2519: 290 compile, 146,745 attempts fail and rewind, 170,786
generated-parser comparisons). Planting a bug in the window, the rewind of kept nodes, the `next`
check, the literal's window check or the generated parser's depth restore each fails it. What it
cannot see is an attempt shadowing that fallback, because the rule that allows it is the one it
copies; reopening that hole passed it and failed a unit test. `test/unit/tools/flow-row-grammar.test.js`
holds the row grammar to `splitRow` on the corpus and 20,000 fuzzed rows on every PR, so an
engine change that breaks it fails CI; when phase 3 deletes `splitRow`, it must freeze the
kernel's outputs first, or the test loses its oracle.

**Review** (HARD RULE #25's adversarial trio, on the first commit). The red team broke no promise:
a 60,000-grammar differential of both runtimes and its own reference found no difference and no
throw, and grammars without attempts lint and generate byte-identically. It, the inversion review
and the checker found, all fixed here: the cost bound stated as `max` × input (above); an attempt
that could shadow an empty branch listed before it; a bare attempt reporting `expected "-", found
"-"`; hand-built `max` and `next` not checked; a reference interpreter that restated the runtimes'
dispatch; parity only in an on-demand script; a typecheck error in `grammar-fuzz.test.ts`; and a
stale header in the bake-off. A second checker, on those fixes, confirmed them (`lint()` identical
on 60,000 random grammars without attempts; both runtimes identical on 4.5M parses with bare
attempts) and found four more, also fixed: a literal cut by the window still gave a contradicting
error, so a failed bare attempt now re-reads its body once without the window (it ends the parse,
so this runs once) and reports what that shows; a hand-built `next` or `set` was checked for
shape but not content (`[null, null]` crashed `compile()`); the CI row test never generated `\r`;
and a stale count. Left as is: a nesting cap reached inside an attempt falls through
(consistent in both runtimes; the arrow grammar does not recurse), and `greedy(opt(attempt(…)))`
fails rather than falling through, as any attempt outside a choice does.

## How it is tested

Passing tests say little until something shows they can fail. Segno is tested three ways, and the
third checks the first two.

- **Fuzzing, against an independent answer.**
  - `grammar-fuzz.test.ts` builds 6,000 seeded random grammars. At seed 2462, 756 compile, 340 of
    them with a language of more than one string, and 5,244 are refused.
  - For every grammar that compiles, the parser must accept exactly its language: the test lists
    every string up to 5 characters and computes the answer by brute force, never with Segno.
  - On half of those grammars, `generate()`'s code must give the same tree or error as
    `compile()`'s closure parser: 413,657 comparisons in all.
  - The number and time readers are fuzzed against `chart-values.js` (100,000 tokens, about 9,800
    of them accepted) and `gantt-time.js` (50,000 tokens, about 2,400 accepted). The single-pass
    number reader is fuzzed against the full one on 300,000 tokens.
  - Floors on each count keep a fuzz from passing on inputs that exercise nothing.
    `SEGNO_FUZZ_STATS=1 npx vitest run src/lib/segno/grammar-fuzz.test.ts --disableConsoleIntercept`
    prints the grammar counts (the docs Vitest setup swallows console output without the flag).
- **Metamorphic tests** (`metamorphic.test.ts`). No oracle says what a span should bind to, but
  the notation promises how related spans relate. These tests check those promises on 2,000
  generated records:
  - item order, spacing, `name=value` versus bare, aliases, letter case and quoting do not change
    the bound value;
  - any string, once quoted, reads back exactly;
  - a shortcut equals its expansion;
  - a leading `\` turns a directive off, and nothing else on;
  - text appended to a valid span never moves an error into the valid part. This is the LL(1)
    prefix property, checked at the grammar level and at the notation level.
- **Mutation testing** (`npm run mutate:segno`, `tools/mutate-segno.mjs`, the house battery pattern).
  - The battery injects realistic defects (62 in its first run, 72 today), one at a time, across the LL(1) proof, the code
    generator, character sets, the reader, binding, the value readers and the spelling check.
    After each one it runs Segno's whole suite.
  - **The first run killed 42 of 62 (68%).** The 20 survivors were real holes:
    - refusals no test isolated (two empty branches; an empty branch clashing with what follows;
      FOLLOW through an empty sibling; a loop body followed by its own start);
    - a left-recursion test whose pattern also matched another check's message, so it passed with
      the check deleted;
    - generated code for non-ASCII ranges, and a nesting count that never unwound, both unreachable
      from the notation's own grammar;
    - reader, binding and spelling edges no test named.
  - One survivor was equivalent (no input can tell it apart) and is left out with a note, as are
    two candidates judged equivalent before the first run (the checker below confirmed all three
    exhaustively). Tests were added for the other 19, and the battery then killed 61 of 61.
    **After the trio's fixes it has 72 mutations and kills all of them** (§ The
    adversarial trio).
  - It is on-demand, not a CI gate. It takes about fifteen minutes and fails on any survivor and on any
    mutation that did not apply.

### The adversarial trio

Before merge, the owner asked for the full trio (HARD RULE #25) on what ships.

- **The red team** broke six promises, each with a reproducer. All six are fixed, with a test and
  a mutation each:
  - a spelling fix could swap `{done}` for a shortcut that expands to `{done, sm}`, adding a size
    the author never wrote. A word is now swapped only for a one-item shortcut;
  - a shortcut rewritten to a word wrote the word bare, and a bare word can bind to another
    parameter (`[x]` = `{state=done}` became `{done}`, a flag). The fix now keeps `name=`;
  - `generate()` accepted a rule named `__proto__`, which the generated `RULES` object literal
    reads as its prototype, so every parse threw. The name is refused;
  - `set()` took any character set, and one holding -1 (the end-of-input code) made the
    generated loop spin forever. Sets are normalized to 0..0xFFFF;
  - `generate()` wrote a `many1` body twice, and called the generator twice for it, so 20 nested
    levels took 33.7 s and 531 MB. It is a do-while now: 14 kB, instantly;
  - a sigil could start a declared word (`@home`) or a number (`$5`), which could then never
    bind bare. The schema refuses both; `flag()` now also refuses an untypeable word.
  - The red team also showed that the bracket-list fix changed how two TYPOS read (an extra
    inner `]`). Both readings were wrong before and after, and no well-formed input changed, so
    the fix stands and a lint warning is a follow-up.
- **The checker** (on the commits after the first review) found no correctness bug. It confirmed
  `readNumberFast` equal to the full reader on every string up to 5 characters over 31 symbols
  plus 2 million random ones. Fixed from its findings:
  - the shortcut cache froze objects a custom type returned. It now freezes a copy;
  - three fuzzes had no floor on how many inputs were accepted. Each has one now, and values are
    compared with `Object.is`;
  - `indexed()` took any ceiling, so a billion allocated a billion words. It is capped at 1,000
    (`MAX_INDEXED`);
  - the counts and the stats command above were corrected.
- **The inversion** found nothing that blocks phase 1 and named the phase-2 risks. Each is a
  gate in `followups.d/`:
  - prove Segno can read flowchart rows before phase 2 starts (P1);
  - lint the old spellings, so the clean break is not also a silent one;
  - bind every migrated corpus span against the old kernels;
  - decide the pill speed bar.
  Its strongest objection is to the direction itself: the bake-off recommended keeping the
  kernels, and the notation, not the engine, is where the user value is.

## General-purpose, not Lattice's

Decision 13 makes Segno a library other projects can adopt. Phase 1 audited it for Lattice leaking in:

- **Code:** clean. Nothing in the source imports outside its folder (`checkSegnoBoundary`), and no
  message or type depends on Lattice.
- **Fixed in phase 1:**
  - `consistency()` said "this deck writes…" to every user; it now says where else the value is
    written, and "document" is whatever the host groups by.
  - An unlabeled list named itself "this list" in errors; it now says what it holds.
  - A list's spellings reported the element type's description as their parameter; they now report
    the parameter.
  - The README, package description and `/segno` page lead with the general engine, with Lattice
    as its first user.
- **Decided with the owner:**
  - **License: `AGPL-3.0-only`** (decision 14). AGPL requires anyone who serves software built on
    it over a network to publish their source, which many companies will not accept in a
    dependency; the owner kept it with that cost stated.
  - **`indexed(prefix, { max })`** replaced `color({ max })`, whose `c1…cN` spelling was a Lattice
    convention (decision 15). It takes any letter prefix, reads without a regular expression, and
    refuses a prefix an author could not type.
  - **No publish plan** (decision 16): the owner publishes the libraries together, deliberately.
- **Still to settle, whenever Segno leaves this repository:** `number()`'s rules (accounting parentheses, `k`/`M`/`B`,
  European separators) are documented as "numbers as people write them" and are opinionated; the
  parity test that holds them to `lib/core/chart-values.js` is Lattice's contract, and belongs on
  Lattice's side if the library moves to its own repository.

## Demo page and branding

Like Trama, Lente, Cadenza and Vetrina: a standalone page at `/segno`, driven by the real library, with
its own mark and palette.

- **The mark**: a drawn SVG after the musical *segno* sign — an S crossed by one stroke with two
  dots, an S that also reads as a scanner's single pass. Drawn, never a typed glyph (HARD RULE #29's
  spirit, and so it renders the same everywhere).
- **The page**:
  - a live editor — type a span, see it tokenized, bound to a chosen slot, and any error with its
    exact range and fix;
  - a before-and-after gallery of the current grammars (phase 1; a gallery of every slot's schema,
    generated from the manifests, follows in phase 2 when the schemas move there);
  - an alias and shortcut playground, including the per-deck consistency check;
  - a speed proof that runs the bake-off's hostile shapes in the visitor's browser and plots the
    growth;
  - **the engine on its own, first**: write a grammar in the page, see it compiled and the parse
    tree for any text, a precise error with a caret for bad text, and the compiler's refusal for a
    grammar that would have to guess (preset: a settings line, a flowchart row, a date range, and
    two refused grammars), plus the straight-line code `generate()` writes for it. The first cut
    showed only the notation and three fixed refusals, which left "Segno parses any grammar you
    define" for the reader to infer — the owner's review caught it.
- **Verified at 390, 820 and 1440 px, light and dark** (QUALITY BAR), and driven in Chromium: an
  error typed and its fix applied, the deck fix applied, a grammar refused, the ladder run. The mark is
  inlined in the page so it follows the page's theme toggle; `public/segno-mark.svg` (the favicon)
  follows the OS setting, as an `<img>` SVG must.

## Plan

| phase | what lands | PR |
|---|---|---|
| 0 | This note, confirmed | with phase 1 |
| 1 | The Segno engine, the notation grammar, schema binding, aliases and shortcuts, typed output and diagnostics; unit tests, fuzz and the scaling ladder; the `/segno` page and mark. No Lattice wiring. | one |
| 1b | `greedy()`, `until()`, per-grammar `maxDepth` (decision 21) | one |
| 2 | Lattice on Segno: the 27 slot schemas plus sparks (row 28, decision 19) in the manifests, binding straight off the flat tree, the dispatcher, lint rules (including per-deck alias consistency), a codemod over every shipped deck and doc, the old parsers deleted, component docs updated, a `**Breaking:**` changelog fragment | one |
| 3a | `attempt()` in both runtimes, and the flowchart-row grammar that uses it, in the bake-off (§ Flowchart rows need a bounded attempt, "Built") | #2519's follow-up |
| 3b | Flowchart rows on Segno: `splitRow` walks a parser generated from 3a's row grammar, and the hand-written scan is deleted (§ Phase 3b as built) | #2545 |
| 3 | The remaining list-text grammars: leading markers, the matrix-grid cell, `_track` (§ Phase 3 as built: list text) | this PR |

Phase 2 changes what every chart reads, which is high blast radius and genuinely novel, so it gets the
full adversarial trio before merge (HARD RULE #25).

### Phase 2 as built

Branch `claude/segno-phase-2`, one commit per slice: plumbing; pills and sparks; one number reader;
axes, label sets and points; gantt dependencies, status words and markers; the per-chart records.
A one-off codemod rewrote the corpus, re-reading every rewrite through the new reader. It was deleted
before merge: Lattice is not GA, so once our own decks were converted nothing needed to read the old
spellings again (owner, 2026-10-05). It is in the branch history if that ever changes.

**Where each slot lives.** A slot that works in any prose is a CORE slot in `lib/core/segno-slots.js`
(`point`, `state`, `pill`, `spark`). A slot one component owns is declared in its manifest's `segno`
field (`journey.step`, `flowchart.style`); the build compiles it, so a slot Segno refuses fails the build.
The rest are one-word readers built in a shared `lib/core` kernel from Segno's types: `gantt-pill.js`,
`cell-note.js`, `chart-status.js`, `kanban-sizes.js`, the waterfall markers and the QR
keys. In every case the transform and the narrator call the same kernel, and lint does too where it
reads the slot.

**Calls made while building, each reversible:**

- **Radar (row 27)** takes the bracketed axis line `[{Scale, 0..100}]`, the form quadrant and gantt
  read, rather than a bare `0..100` pill in the eyebrow. A bare pill would have printed `0..100` on the
  slide. The line is lifted off the slide because the ring ticks already print the scale. The one
  variant that prints no ticks, `small-multiples`, re-shows a pinned scale as its old eyebrow
  (`Scale · 0–10`); the same-machine render against base caught that slide losing it. Three
  shipped eyebrows said more than the scale (`Scale · 0–10, on the criteria we wrote`); they keep their
  words, and the axis line goes in above them.
- **Journey (decision 11).** A record names `who` once, so a second actor is a second `@` pill:
  `{who=me, mood=1}` `@cat`. `mood=2.5` now rounds to 3 in both the chart and the voice, where
  `parseInt` truncated it to 2.
- **Flowchart (row 25).** A single style word stands alone (`doc`, `fail`); two or more go in braces.
  The key's words drop their colons (`{dotted, Informal}`), and a channel color is `fill=c3`.
- **Gantt (row 10).** Two dependencies are a list, `after=[Design, Build]`. The codemod reported, and did
  not guess, any `after: A, B`: the old chart read it as one name and the old lint as two. None shipped.
- **A component can own its list rows' spans** (decision 3, enforced). One notation means a
  flowchart style `{diamond, c2}` is also a valid pill, and the slide-wide pill pass reached it first:
  the chart drew a box named "Triage diamond". A slot that declares `sits: "list-rows"` in its manifest
  (flowchart's `style`) now keeps every inline-code span on that component's list rows out of the
  mark / pill / spark pass, on the engine, the runtime and lint alike
  (`lib/core/resolve-inline-code.js`). The demo deck caught it; no shipped deck had the colliding form.
- **Row 23** moved from the words slice to the per-chart slice, because the parser that reads the
  state keywords is the state chart's own.

**Known limit.** A number written with a thousands comma cannot sit inside a record: the comma separates
items, and a quoted value is text. `{12000, 62%}` works; `{12,000, 62%}` is three items. No shipped deck
had one.

**Measured against decision 24's premise (open for the owner).** Decision 24 was taken on "an old
spelling in someone else's deck renders as literal code". That holds for pills and sparks: the old
form does not parse, and the span stays code. It does not hold for the chart grammars. An old
quadrant pill (`3, 70`) plots at the origin; an old journey `:4` leaves the step at mood 3; an old
state-chart `submit => 2` draws no edge and prints as text; an old heatmap `# why` joins the value;
an old gantt `after: X` joins the bar's label. A record that does not bind (a typo'd name, a
thousands comma) behaves the same way. `lint:deck` is silent in every case. The adversarial trio
found this, and the choice it raises — a data-integrity lint for an unreadable record, which is not a
lint aimed at retired spellings — was put to the owner.

**Settled by the owner, 2026-10-05: no handling.** Lattice is not GA, so the only old spellings that
matter are our own, and they are converted. A unit test
(`test/unit/authoring/segno-decks-current.test.js`) scans every deck we ship for the old shapes that
cannot be mistaken for anything else and fails if one comes back, so a parallel PR written before phase 2 cannot
land an old spelling silently. No data-integrity lint, and no change to how a chart treats a span it
cannot read.

**Not in this PR — decision 7**, the per-deck alias-consistency lint with an autofix. The binder already
reports each spelling an author used (`spellings` on every bind). Building the rule means every reader
must hand those spellings to lint, which is its own change. It is open for the owner at the merge ask.

**Decision 7, as built (2026-10-05, with inline icons phase 1).** `lint:deck` warns `mixed-spelling`
and `--fix` rewrites each minority span to the deck's most-used spelling (a tie goes to the first),
through Segno's own `consistency`, which the reader entry `@laticent/segno/read` now exports (it
reads binds and builds nothing). A survey of the readers found only two that bind a word with other
spellings today: the waterfall's markers (`total` / `subtotal` / `sum` / `level`, `step` / `delta` /
`change`, now one kernel, `lib/core/waterfall-markers.js`, that the chart and lint share) and the
icons plugin's names and aliases (`db` / `database`), whose inline row exports `spellings` — and the
same names in a pill's `icon=`, which the pill kernel reports (`iconSpelling`), so `{Orders, icon=db}`
competes with `^{database}`. A marker counts only where the chart reads one, a trailing pill on a
waterfall's list row; `step` in the prose above the chart is the author's word. No slot
declares a shortcut that a reader binds — the state slot's `[x]` → `{done}` shortcuts are declared,
but marks are read by `lib/core/state-marks.js`, and no component reads `{done}` as a state — so the
`[x]` / `{done}` pair in the example above has nothing to compare yet. A later reader joins by
exporting its spellings; the rule reads the dispatch table, not a hand list. Every alias counts, by
the decision's letter: a waterfall that writes `subtotal` mid-walk and `total` at the end is flagged.

### Phase 3b as built: flowchart rows

`splitRow` (lib/core/flowchart-grammar.js) no longer scans a row by hand. The grammar moved from
the bake-off into `lib/core/flowchart-row-grammar.js`, unchanged but for one rule;
`tools/build-segno-grammar.js` generates it into `lib/core/flowchart-row.generated.js` (plain
CommonJS, committed, held fresh by build:check); and `splitRow` walks that parser's flat tree.
`readArrow` is gone. What the walk still does by hand is what was never the grammar's job: code
spans, escaped `\{literal}` spans and the name text around them.

- **The rule added.** `splitRow` carries one bit across a row's segments: whether the next text
  starts a word. Text right after an escaped span does not (`\{LIVE}-> B` keeps `->` as text), so
  the grammar has a second entry, `rest`, which reads the rest of a word before the row:
  `seq(greedy(many(wchar)), ref('row'))`. The generated parser takes the entry by name.
- **The oracle, frozen first.** Before the swap, `tools/parser-bakeoff/freeze-flow-rows.mjs`
  recorded what the scan returned, read from a verbatim copy kept in
  `tools/segno-legacy/flowchart-row.js`: the 443 corpus rows and the 251 rows whose segments carry
  state, in full, and a digest per 100 rows of two seeded 20,000-row fuzzes (one of rows, one of
  segment lists). `test/unit/tools/flow-row-grammar.test.js` holds both runtimes to it on every
  PR. Planted defects each fail it: always entering at `row` (1 test), the `<--` Mermaid flag (2),
  the bit after an escape (1), `\&` kept as `&` (4), the bit after an empty text segment (1; the
  checker's plant, which the fuzz missed, so a hand-written case pins it). To change the syntax on
  purpose, `freeze-flow-rows.mjs --from-shipped` re-freezes from the shipped reader and prints every
  row whose output changes, for the PR body.
- **Parity.** `npm run parser:bakeoff:flow`, whose incumbent is now the frozen copy: the shipped
  `splitRow` agrees on 443 of 443 corpus rows and 200,096 of 200,096 fuzzed rows, as does
  `compile()`. The 15 example decks with a flowchart or state chart render byte-identical PDFs
  (`tools/pixel-check.js`, snapshot with the old scan, diff with the new).
- **Speed.** Per corpus row (best of seven rounds), the old scan against the new `splitRow`:
  about 500 ns against 720 to 740 ns (1.4x) in a process that only reads the corpus, and 490 to
  550 ns against 850 ns (1.6x to 1.7x) after both have read the 200,096-row fuzz. The bake-off,
  which runs every candidate in one process, gave 533 against 1,442 ns (2.7x) once and, in the
  checker's two runs, 604 and 620 against 880 and 902 ns (1.45x); its candidates share the JIT,
  so it is the noisiest of the three. Of the new time,
  the generated parser is about 80% and the walk 20%. `npm run bench` does not move beyond its
  noise: `charts` (chart.gallery.md, four flowchart slides) measured 83.4 and 84.0 ms before,
  84.0 and 85.9 ms after, interleaved.
- **`cap()` not added.** A CPU profile puts about 17% of a row's time in the arrow attempts, and a
  grammar with ONE attempt per shaft (what `cap()` would allow; wrong at the cap, kept only to
  time the corpus) is no faster: timed in separate processes, 650 to 667 ns per row against the
  doubled attempt's 641 to 671 (timed in one process, whichever runs second loses about 50 ns,
  which first read as a 6% gap the other way). Only the hostile
  `-y ` ladder would gain. The rest of the cost is the generated parser's per-character loop,
  which every Segno grammar pays.
- **The 1.5x bar: accepted by the owner (2026-10-06, on #2545).** The bar in § The engine is per
  inline span, a hot path every code span in every deck takes. A flowchart row is under a
  microsecond either way, and only flowchart and state-chart slides read one, so the owner accepted
  the measured 1.4x to 1.7x per row for flowchart rows. The inline-span bar is unchanged.

### Phase 3 as built: list text

Nine hand-written readers of list text now walk one generated parser. The grammar is
`lib/core/list-text-grammar.js`; `tools/build-segno-grammar.js` generates it into
`lib/core/list-text.generated.js` (committed, held fresh by build:check), beside the flowchart row's.
It shipped with nine entry rules, one per shape a reader used, each reading a whole string. `spoken` has since folded into `grid`, and the editor added `edit` and `escaped` (below):

| rule | shape | replaced | read by |
|---|---|---|---|
| `line` | `[m]`, whitespace, text on one line | `LEADING_MARKER_RE` | verdict-grid and pricing badges, status cells (`readLeadingMarker`) |
| `lead` | `[m]`, whitespace, anything | `LEADING_MARKER_PREFIX_RE` | list-item state classes, speech of table cells (`leadingMarkerPrefix`) |
| `cell` | `line` after one opening tag | chart narration's `MARKED_CELL` | `readMarkedCell` |
| `tagged` | `lead` after whitespace and one tag, the tag kept | the roadmap's two `CELL_MARKER` patterns | `cellMarkerPrefix` |
| `bare` | only a marker, `[X]` included | `MARKER_CELL` (with its `i` flag) | the row-label bet (`isMarkerCell`) |
| `grid` | matrix-grid's three markers, a gap of up to 8 | `CELL_MARKER` | `parseCell` |
| ~~`spoken`~~ | the same, any gap, untrimmed | narration's own matrix-grid pattern | folded into `grid`: narration calls `parseCell` |
| `any` | any one character in brackets | narration's bracket strip | `leadingBracketPrefix` |
| `track` | items between pipes | `parseTrackSpec`'s split | `parseTrackSpec` |

The kernels are `leading-marker.js` (new: the six marker readers), `matrix-grid-cells.js` and
`track-spec.js`; the engine, the runtime mirror, narration, speech, lint and the roadmap transform
call them. `state-marks.js` keeps what a marker MEANS and stays require-free, because the Studio's
Compose editor imports it on the docs dev server, whose CommonJS shim serves only a module with no
`require` of its own (the red team found the first cut, with the readers in `state-marks.js`, broke
the Compose view there and failed `vite-cjs-lib-dev.test.ts`). Every consumer that
called a regular expression now calls a function, so the old exports are gone (a `**Breaking:**`
fragment). `MARKER_CLASS` stays, for the three scanners below and the parser bake-off's other
implementations (`tools/parser-bakeoff/shared.mjs`).

- **Parity, not a cleanup.** The rules copy the expressions' quirks on purpose, so no deck changes:
  whitespace is JavaScript's `\s` (U+FEFF and the Unicode spaces included), text on a `line` stops at
  the four characters `.` refuses, `bare` takes `[X]` and nothing else does, `grid` bounds the gap at 8
  and `spoken` does not. `spoken` and `grid` differ only on untrimmed text and a gap past 8, and
  narration trims every cell and label first, so folding them would change nothing a listener hears
  (the inversion review measured 300,000 trimmed cells with no difference). They stay two rules here
  only because this PR's oracle compares each reader's raw output; the fold is a small follow-up.
  **Folded since:** narration now calls `parseCell`, and `spoken` and `readGridMarker` are gone. The
  oracle keeps its `spokenGrid` column, re-frozen from the shipped readers as narration's reading
  (`[marker, label]` from `parseCell`): 242 corpus inputs change in that column and no other. The
  narration and Guide refs (`narrateChartScript`) of the 20 matrix-grid slides in `examples/`, the
  baseline decks, `docs/src` and the component docs are byte-identical before and after, and so are
  13,409 slides of adversarial and random cells the maker-checker review ran; narration only uses a cell's words for a filled cell or an
  unmarked one, and there the two rules agree once the cell is trimmed.
- **`_track`'s current item.** An item is current when, trimmed, it opens with `[` and closes with
  `]`, and the close is only known at the item's end. Rather than an `attempt()` (bounded at 256
  characters, so a long bracketed label would read differently), the grammar marks every run of `]`
  and whitespace after an opening `[` as a `shut` node, each `]` an `rb`; the item is current when its
  last `shut` ends it. That stays strict LL(1) with one greedy loop, and needs no window.
- **The oracle, frozen first.** Before the swap, `tools/parser-bakeoff/freeze-list-text.mjs` recorded
  what the expressions returned, read from a verbatim copy in `tools/segno-legacy/list-text.js`: every
  candidate string in the shipped decks and docs and in the readers' own tests that some reader
  answered (609, all nine outputs in full), every near miss that leads with a bracket or a tag and no
  reader answered (1,760, input only), and a digest per 100 inputs of a seeded fuzz (20,000 random
  inputs plus 104 at each matrix-grid gap from 0 to 12).
  `test/unit/tools/list-text-grammar.test.js` holds the shipped kernels and, through a second walk of
  its own, `compile()` to it on every PR. Nine planted defects each fail it: U+2028 read as text, a gap
  of 9, U+FEFF not whitespace, `bare` without `[X]`, an empty tag, a `_track` item current on any
  `shut`, its label cut at the first `]`, the roadmap dropping its tag, and `spoken` bounded at 8.
- **Pixels.** `tools/pixel-check.js` on the 56 example decks that carry a marker, a status cell, a
  roadmap, a matrix-grid, a pricing or verdict grid, or `_track`, snapshotted before the swap: 55 are
  byte- or pixel-identical. The 56th, `system-design-foundations`, also differs from its own
  snapshot when rendered with the UNCHANGED code, on different pages each run, so it is a flaky deck
  and not this change (recorded in `followups.d/`).
- **Speed.** Per call, the expression against the generated parser (`npm run
  parser:bakeoff:list-text`, each side in its own process, best of seven): 50 to 100 ns against 80 to
  330 ns for the marker rules (2x to 5x), 0.8 to 1.2 µs against 1.1 to 1.9 µs for `_track` (1.35x to
  1.56x), and level for narration's two. Most of the gap is the generated parser's fixed cost per
  call, which an expression that fails on its first character does not pay. A whole `npm run bench`
  run makes about 16,400 of these calls across all its datasets, so the gap is about 3 ms per bench
  run, under 0.05 ms per render; three interleaved pairs against `main` stay inside the bench's
  ±10% noise. The 1.5x bar in § The engine is per inline span, and these are not inline spans; the
  owner accepted the same trade for flowchart rows (§ Phase 3b as built).
- **The Studio's editor, moved after.** Phase 3 left seven patterns built from `MARKER_CLASS`: five
  in the Compose editor and two in tools. A follow-up moved the four that READ a marker at the start
  of a cell onto two new rules, `edit` (`[m]` and at most one whitespace character, the one the
  picker inserts and replaces) and `escaped` (the serializer's `\[m\]`). The readers live in
  `lib/core/cell-marker-edit.mjs`, an ES module that imports only the generated parser, so the docs
  dev server's CommonJS shim still serves the chain and `state-marks.js` stays require-free. They
  replace `table-commands.ts` `CELL_MARKER` and `CELL_MARKER_BARE`, `ComposeView.tsx`
  `CELL_MARKER_RE` and `deck-markdown.ts` `ESCAPED_LEADING_MARKER_RE`. Their old outputs were frozen
  first, as three oracle columns (`edit`, `editBare`, `unescape`); the `spokenGrid` column left,
  since narration reads `grid` now. A fixed block of every marker, `X` and a non-marker in each
  editor shape joined the fuzz, after a planted `\[X\]` passed the first freeze unnoticed; three
  planted defects (`X` in `escaped`, `X` in `edit`, a space-only gap in `edit`) each fail it, and
  the checker's brute force found no difference from the old patterns over 10,092,550 inputs.
  `state-marks.test.js` now holds the grammar's marker set to `MARKERS`, since the editor no longer
  builds from `MARKER_CLASS`.
  `compose-state-markers.spec.ts` drives the real Compose editor: six badges, a pick that keeps the
  cell's words, and a source that holds all six markers unescaped.
- **Not moved, on purpose: three SCANNERS.** `deck-source.ts` locks a slide when any list line
  in the whole slide leads with a marker. Its pattern is multi-line: `^` matches after every line
  break, and its `\s` runs may cross one. It reads Markdown's list syntax and only then a marker.
  `tools/build-component-docs.js` `DECK_MARKER_SPAN_RE` finds every backticked `` `[m]` `` span
  and `tools/audit-capacity-basis.js` `STATE_MARKER_RE` every `[m]`, anywhere in text, and both
  replace every match. A list-text rule reads one
  WHOLE string from its start. Running one at every position would turn a single regex pass into a
  parse at each offset, to re-derive what one character class already says. All three still take the
  marker set from `MARKER_CLASS`, so the set cannot drift; only its placement differs, and that is
  the scanner's own business.

## Open questions

The three this note first carried — coordinates, journey sigils, color slots — are decisions 10 to 12.
Two are open, and both only matter from phase 2 on:

- **Editor tooling.** Segno stops at the first error and has no incremental parsing or
  highlighting. If the Studio editor needs highlighting of Segno spans, is the path a display-only
  Lezer grammar, with Segno as the authority? (Raised by the trio's inversion.)
- ~~**No-break spaces and newlines.**~~ Settled by decision 23: U+00A0 is a space. A code span
  cannot hold a newline, so nothing else was open.

**Phase 1's checker** (one independent agent) confirmed the LL(1) check sound on about 4,800 random
grammars against a brute-force recognizer, the generated parser identical to the closure parser on the
same set, and the number and time readers identical to `chart-values.js` and `gantt-time.js` on 500k
fuzzed cases. It found seven places where a diagnostic's fix, applied, did not parse, or dropped or
changed what the author wrote. All are fixed, and `parse()` now drops any fix that does not move the
error past its own edit, with a property test over 5,000 fuzzed spans.
