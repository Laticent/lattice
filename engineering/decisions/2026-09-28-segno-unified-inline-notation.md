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
| 13 | **Segno is a general-purpose library; Lattice is its first user.** It will be published for non-Lattice uses, so nothing in its API, messages or docs may assume Lattice: "per deck" is "per document", examples lead with general cases (a rollout rule, a retry policy), and Lattice is the documented first user. The phase-1 audit and what it left open: § Published, not Lattice's | owner |

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
| 22 | state-chart `` `approve => 2` `` | `` `{approve, to=2}` `` |
| 23 | state `` `start` `` `` `at-risk` `` | unchanged (enum words) |
| 25 | flowchart `` `#api:diamond:c2` `` `` `:dashed:cross` `` | `` `{#api, diamond, c2}` `` `` `{dashed, cross}` `` |
| 26 | QR `` `ssid` `` postfix key | unchanged (an enum key) |
| 27 | radar `` `Scale · 0–100` `` | `` `0..100` `` |

Out of scope for the first cut, because they live in list TEXT rather than inside backticks: flowchart
arrows (`A -> B`), leading `- [x]` markers, the matrix-grid cell marker, and `_track`. They are Segno's
second grammar, not its first.

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

## Published, not Lattice's

Decision 13 makes Segno a library other projects will adopt. Phase 1 audited it for Lattice leaking in:

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
- **Open, for the owner, before the first publish:**
  - **License.** The package carries `AGPL-3.0-only`, copied from its sibling libraries. AGPL
    requires anyone who serves software built on it over a network to publish their source, which
    many companies will not accept in a dependency. A permissive license (MIT, Apache-2.0) is the
    usual choice for a library meant for broad adoption; the choice is the owner's.
  - **`color({ max })`** spells indexed colors `c1…cN`, a Lattice convention. It is harmless as a
    convenience, but a general `indexed(prefix, { max })` would serve other palettes.
  - **`number()`'s rules** (accounting parentheses, `k`/`M`/`B`, European separators) are
    documented as "numbers as people write them". They are opinionated; the parity test that holds
    them to `lib/core/chart-values.js` is Lattice's contract, and belongs on Lattice's side if the
    library moves to its own repository.
  - **Publishing** to npm is external and cannot be taken back; it waits for its own go-ahead.

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
| 2 | Lattice on Segno: the 27 slot schemas in the manifests, the dispatcher, lint rules (including per-deck alias consistency), a codemod over every shipped deck and doc, the old parsers deleted, component docs updated, a `**Breaking:**` changelog fragment | one |
| 3 | The list-text grammars (flowchart arrows, leading markers, `_track`) as Segno's second grammar | one |

Phase 2 changes what every chart reads, which is high blast radius and genuinely novel, so it gets the
full adversarial trio before merge (HARD RULE #25).

## Open questions

The three this note first carried — coordinates, journey sigils, color slots — are decisions 10 to 12.
One is open, found by phase 1's checker, and it only matters from phase 2 on:

- **No-break spaces and newlines.** The notation trims and separates on space and tab only, so a
  pasted `{a,`U+00A0`b}` reads a value with a leading no-break space. Treating U+00A0 as a space is
  kinder to pasted text; keeping the rule to two ASCII characters is simpler to state. A code span
  cannot hold a newline, so only U+00A0 is a real question.

**Phase 1's checker** (one independent agent) confirmed the LL(1) check sound on about 4,800 random
grammars against a brute-force recognizer, the generated parser identical to the closure parser on the
same set, and the number and time readers identical to `chart-values.js` and `gantt-time.js` on 500k
fuzzed cases. It found seven places where a diagnostic's fix, applied, did not parse, or dropped or
changed what the author wrote. All are fixed, and `parse()` now drops any fix that does not move the
error past its own edit, with a property test over 5,000 fuzzed spans.
