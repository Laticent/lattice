# Segno

**A grammar engine that only builds grammars it can prove are linear — and a small inline notation, with typed values, built on it.**

Segno turns a grammar written as data into a parser, and refuses the grammar if it cannot be read
left to right with one character of lookahead and no backtracking (LL(1) over characters). That
refusal is the point: a grammar Segno builds parses in time proportional to its input, on any
input, so a hostile string pasted into your editor, form or config can never make it hang. The
properties a hand-written scanner only has by careful review are, here, a condition of compiling
at all.

It is **general-purpose**, **framework-free**, **zero-dependency** and has **no DOM**: it runs in
the browser, Node, a worker or an edge function. [Lattice](#first-user-lattice) is its first user.

Two layers, usable apart:

1. **The engine** — write any grammar, get a parser: a tree of the pieces you marked, or an error
   with a position and what was expected. [Write a grammar](#write-a-grammar).
2. **The notation** — for short directives that live inside other text (a code span, a table
   cell, a config value, a chat command): three shapes, one separator, one escape, and a schema
   per place that says what each word means. [Declare a slot](#declare-a-slot).

```
{new-checkout, beta, 25%, [eu, us], sticky}   a record: a primary value, then words and name=value
[eu, us, apac]                                a list; an empty element holds its place: [, us]
"Cost, excluding tax"                         quoted text: protects separators, forces the text type
attempts=3                                    a named item on its own
\{beta}                                       a leading backslash turns the whole span off
```

What a span MEANS comes from a **slot** — a declarative schema for the place it sits. A bare word
binds to the one parameter whose type accepts it, so `{new-checkout, beta, 25%}` and
`{new-checkout, 25%, beta}` mean the same thing — and a schema in which a word could bind two ways
does not build.

(segno, Italian: sign, mark — and the musical *dal segno*.)

## Install

```sh
npm i @laticent/segno
```

## What is stable

This is 0.x: a minor version may break the API. Within that, two halves move at different speeds.

- **Stable for 0.x:** declaring a slot (`record`, the types, `read`, `values`), `parse` for the
  inline notation, `readNumber` / `readTime`, and `SchemaError`. Lattice reads every deck through
  these.
- **Experimental:** the grammar engine (`compile`, the combinators, `lint`, `generate`) and the
  notation's own grammar (`notationSpec`, `TAGS`). Their names and shapes may change in any minor
  version. The notation itself is specified in LFM 1.1 §3.6
  ([`spec/LFM-1.1.md`](https://github.com/Laticent/lattice/blob/main/spec/LFM-1.1.md)), which wins
  where it and this package disagree.

The notation is one line: a newline inside a span is an ordinary character, not whitespace. That
matches Markdown inline code, which folds a line break into a space before Segno sees it.

`SchemaError` and `GrammarError` are branded, so `instanceof` holds across the package's entry
points (`.`, `./read`, `./values`), each of which is bundled on its own.

## Write a grammar

```ts
import { compile, chars, many, many1, node, opt, ref, seq } from '@laticent/segno';

const digit = chars('0123456789', 'a digit');
const g = compile({
  start: 'list',
  rules: {
    list: seq('[', opt(seq(ref('num'), many(seq(',', ref('num'))))), ']'),
    num: node('num', many1(digit)),
  },
});

g.parse('[12,3]'); // { ok: true, node: { kind: 'list', kids: [{ kind: 'num', from: 1, to: 3 }, …] } }
g.parse('[12;3]'); // { ok: false, error: { at: 3, expected: '"]"', found: ';' } }
```

The vocabulary is `lit`, `set` (`chars`, `noneOf`, `charRange`, `any`), `seq`, `alt`, `many`,
`many1`, `opt`, `ref`, and `node` to keep a span in the tree. `compile` throws a `GrammarError`
listing EVERY violation with its rule path:

- two `alt` branches that can start with the same character (unless the first is an `attempt`,
  below);
- a loop whose body can match nothing, or that could either repeat or stop on the same character
  (unless the loop is marked `greedy`, below);
- a rule that reaches itself without consuming (left recursion).

`lint(spec)` returns the same list without throwing. On a wide alternation it names the first ten
overlapping pairs and counts the rest, so a grammar built at run time cannot stall it. Nesting is
capped at `MAX_DEPTH` (64), so a deeply nested input returns an error instead of overflowing the
stack.

A set holds characters one UTF-16 unit long: `chars()` and `charRange()` throw on an emoji or any
other character outside the Basic Multilingual Plane, and on a range that runs backwards. Match such
a character with `lit()`.

### Longest match, skip-to, and deeper nesting

Four additions are for grammars beyond strict LL(1): a stylesheet, a page, a Markdown file, a
flowchart row. Three never let a parse go back over what it read; `attempt()` goes back at most
`max` characters. So the linear bound holds for every grammar that compiles.

- **`greedy(many(x))`**, also `greedy(many1(x))` and `greedy(opt(x))`, takes the longest match.
  When the next character could either go round the loop again or start what follows, it goes
  round. This is the rule every lexer uses, and the parser already worked this way: the mark only
  tells the checker that the overlap is intended. A run of letters next to another run of letters
  is refused without it. The checker still refuses a greedy loop whose successor could **never**
  match, such as `seq(greedy(many(letter)), 's')`, and it follows rule references to find one.

  **Greedy means commit.** The check cannot see a successor that is optional but that some inputs
  needed: `seq(greedy(many(seq(word, '\n'))), opt(word))` takes the last word as a line and then
  fails on the missing newline. A test pins this.
- **`until(end, { orEnd })`** reads up to and including the literal `end`, such as `*/`, `-->` or
  `</script>`. It runs one `indexOf` search and never re-reads. When `end` never appears, the parse
  fails at the end of the input, unless `orEnd` reads to the end instead (an unclosed comment at
  the end of a file). The terminator is capped at `MAX_UNTIL` (64) characters, because the search
  costs about input length × terminator length. Any character can start the text before `end`, so
  an `alt` branch beside `until` is ambiguous. Put a consumed character first.
- **`attempt(x, { max, next })`** is a bounded ordered choice, the one place the parser goes
  back. It reads `x` on at most `max` characters (up to `MAX_ATTEMPT`, 256) and keeps it only if
  the next character is in `next` or the input ends; otherwise it rewinds as if it had never been
  tried. As an `alt` branch it may start with the same characters as the branches **after** it,
  which get the character when it fails. That is the only overlap it opens, and an attempt may not
  start what follows a choice whose other branch can match nothing (the runtime tries attempts
  first, so it would shadow that branch). Each attempt reads at most `max` characters, so a
  position costs at most the sum of `max` over the attempts tried there (several side by side, or
  in rules entered without consuming, each count): still linear in the input, with a constant the
  grammar sets. The checker keeps it that way: it refuses an attempt that can reach another attempt (nested attempts multiply their
  `max`; one reached through recursion multiplies once per level), an `until()` inside one (its
  search would run past the window), and one whose `x` can match nothing. Inside `x`, the end of
  the window reads as the end of the input, and `x` is checked as strict LL(1) against `next`.
  Elsewhere than an `alt` branch, a failed attempt is an ordinary parse error, and it reports why
  the attempt failed: what its body expected, a `next` character, or its end within `max`. Flowchart rows need
  it: at a word start `-x->` is an arrow and `-x` a word, and the two part only at the closing
  shaft. Lattice reads every flowchart and state-chart row this way: its grammar is
  `lib/core/flowchart-row-grammar.js`, generated into `lib/core/flowchart-row.generated.js`.
  So a change to the code generator (`codegen.ts`) regenerates a Lattice render kernel:
  `npm run segno-lib:build` rewrites that file, and the change owes its tests
  (`test/unit/tools/flow-row-grammar.test.js`) and a checker, as any render-path change does.
- **`maxDepth`** on the spec raises the nesting cap for one grammar, up to `MAX_DEPTH_LIMIT`
  (1,000). If the JavaScript stack runs out first, the parse returns an error with
  `code: 'stack'` instead of throwing. Test `error.code`, not the wording of `error.expected`. That happens in `compile()`, which spends a stack frame per expression, on
  grammars with many expressions per level. The generated parser gets further on the same input,
  so on such a grammar the two can disagree.

```ts
import { alt, charRange, chars, compile, greedy, many, node, opt, ref, seq, until } from '@laticent/segno';

// A tiny stylesheet: words, spaces, blocks that nest, and /* comments */.
const letter = charRange('a', 'z');
const sheet = compile({
  start: 'run',
  maxDepth: 200,
  rules: {
    run: many(alt(
      node('word', seq(letter, greedy(many(letter)))),          // the whole word, not a prefix
      chars(' \n'),
      node('block', seq('{', ref('run'), '}')),
      seq('/', greedy(opt(node('comment', seq('*', until('*/')))))),   // after "/", a "*" opens a comment
    )),
  },
});
```

Lattice's own CSS, HTML and Markdown grammars, written with these pieces, read every tracked file
of each type (160, 31 and 2,332 on 2026-10-04; `npm run parser:bakeoff:languages`). They are a
tokenizer layer: there is no element tree, no rule-versus-declaration split, and no CommonMark
block pass. Those take code on top.

**Two outputs.** `compile` builds a parser from closures, for a grammar that arrives at runtime.
`generate(spec)` writes the same parser as TypeScript source — straight-line code, character tests
inlined, the tree in one reused integer buffer (`flat.ts`) — for a grammar that ships. The inline
notation ships generated (`notation.generated.ts`), and a test holds the two to identical output on
20,000 fuzzed spans.

## Declare a slot

A feature-flag rollout rule, written inline:

```ts
import { flag, list, named, number, oneOf, record, text } from '@laticent/segno';

const rollout = record({
  label: 'a rollout rule',
  positional: [{ name: 'flag', type: text() }],
  params: {
    stage: oneOf(['off', 'beta', 'on'], { aliases: { on: ['live', 'ga'] } }),
    percent: number(),
    regions: list(oneOf(['eu', 'us', 'apac'])),
    sticky: flag('sticky'),
  },
});

rollout.read('{new-checkout, beta, 25%, [eu, us], sticky}');
// { ok: true, value: { flag: 'new-checkout', stage: 'beta', percent: { value: 25, unit: '%', … },
//                      regions: ['eu', 'us'], sticky: true } }
rollout.read('{new-checkout, [eu], 25%, live}');   // any order; `live` is an alias of `on`
rollout.read('{new-checkout, beta, 25%, mars}');
// { ok: false, diagnostics: [{ code: 'unknown-word', message: '"mars" is not anything a rollout rule
//   takes — it takes flag (text), stage (one of off, beta, on), percent (a number), …', from: 26, to: 30 }] }

// Two numbers could claim the same bare word, so they must be named: {attempts=3, backoff=250ms}
const retry = record({ label: 'a retry policy', params: { attempts: named(number()), backoff: named(text()) } });
```

Binding, in order: positional items fill `positional`; `name=value` fills that parameter; any other
bare word fills the ONE parameter, in the highest precedence class, whose type accepts it —
`vocab` (declared words) › `id` › `number` › `time` › `range` › `text`. Any error leaves the span
unbound and reports it with a range and, where one exists, a fix. Nothing is half-applied.

`record` throws a `SchemaError` when two parameters of one class could take the same bare word. The
fix is to make one positional, or to wrap it in `named(...)` so it must be written `name=value`
(the retry policy's `attempts` above).

### Types

| type | spellings |
|---|---|
| `text()` | anything; the only type quoted text can be |
| `oneOf(values, { aliases })` | declared words, case-insensitive, with extra spellings |
| `flag(word)` | a word that switches something on: `milestone` |
| `indexed(prefix, { max })` | `c1`…`c12`, `step1`…`step5`: a prefix and a number, the ceiling set per slot (`max` at most 1,000) |
| `id()` | `#api` |
| `number()` | numbers as people write them: `42` `-$0.8M` `12%` `($1.2M)` `1,25M` `1.234.567` |
| `time()` | dates as people write them: `2026-03-15` `2026 Q1` `Q3` `Jan` |
| `range(of)` | `a..b` over another type |

### Aliases, shortcuts, sigils — and one spelling per document

```ts
const state = record({
  params: { state: oneOf(['done', 'partial', 'fail'], { aliases: { done: ['yes', 'pass'] } }) },
  shortcuts: { '[x]': '{done}', '[-]': '{partial}', '[!]': '{fail}' },
});
state.read('[x]');   // { state: 'done' }
state.read('{yes}'); // { state: 'done' }
```

A **shortcut** is an exact whole-span token that stands for a record; a **sigil** is a leading
character that names a parameter (`sigils: { '@': 'who' }` makes `@Customer` mean `who=Customer`).
Both are checked when the schema is built, and a sigil that starts one of the schema's declared
words or could start a number (`$`, `-`, a digit) is refused, because that word or number could
then never bind bare. A shortcut is bound once, at build time, and every read of it returns the
same **frozen** result: treat bound values as read-only. Every successful bind returns the `spellings` it used, and
`consistency(uses)` reports each occurrence written differently from the most common spelling in
the same document (whatever you group by: a file, a config, a slide deck), with a fix.

## First user: Lattice

[Lattice](https://github.com/Laticent/lattice/blob/main/README.md) renders slide decks from Markdown, and its inline code spans carry
directives: `` `{BETA, tag, c4}` `` is a pill, `` `[x]` `` a state mark, `` `[{Effort, 0..10}, Reach]` ``
a chart's axes. Before Segno it had 27 hand-written grammars for them with 21 sigils between them;
it is moving all of them onto the one notation, with one schema per place a span can sit. Why it
built an engine rather than adopting a parser library, and what it measured:
[`engineering/decisions/2026-09-28-parser-library-bakeoff.md`](https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-09-28-parser-library-bakeoff.md).
The design: [`2026-09-28-segno-unified-inline-notation.md`](https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-09-28-segno-unified-inline-notation.md).

## Speed

**Against parser libraries.** Segno beside six popular JavaScript parser libraries and the
hand-written parsers it replaces, each in its own process on identical inputs (the 64 bracket
lists and 4,645 inline spans in Lattice's decks); run 2026-09-29, Node 22:

| parser | style | bracket list | inline span | worst hostile input, 32k chars |
|---|---|---|---|---|
| **Segno** | LL(1), proven at compile time | 734 ns | 45 ns | 7 ms |
| hand-written (Lattice) | recursive descent | 942 ns | 33 ns | 7 ms |
| Peggy | PEG | 6,577 ns | 882 ns | 7.3 s |
| Chevrotain | LL(k), tokens | 4,723 ns | 24,605 ns | 776 ms |
| Parsimmon | PEG combinators | 54,267 ns | 1,073 ns | did not finish |
| Nearley | Earley | 66,000 ns | 12,644 ns | did not finish |
| Ohm | PEG, memoized | 107,161 ns | 24,597 ns | did not finish |

Reproduce with `npm run parser:bakeoff:versus`; the method and caveats are in
[`2026-09-28-parser-library-bakeoff.md` § Head to head with Segno](https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-09-28-parser-library-bakeoff.md).
Absolute times move with the machine; the ratios carry.

**Against the parsers it replaces, in detail:**

Measured against the hand-written parsers it replaces in Lattice, on the inline-code spans and
bracket lists in Lattice's shipped decks (`npm run parser:bakeoff:segno`; best of seven long rounds, one machine):

| job | kernel | Segno | ratio |
|---|---|---|---|
| inline dispatch, every span | 30 ns | 45 ns | 1.5x |
| &nbsp;&nbsp;ordinary code (99% of spans) | 27 ns | 39 ns | 1.5x |
| &nbsp;&nbsp;state marks `[x]` | 41 ns | 34 ns | **0.8x** |
| &nbsp;&nbsp;pills `{BETA, tag, c4}` | 350 ns | 701 ns | 2.0x |
| bracket lists, split into parts (the kernel's job) | 767 ns | 828 ns | 1.1x |
| quadrant axes, typed numbers and ranges | 721 ns | 1.02 µs | 1.4x |

**Against the dispatcher Lattice ships.** The table above times the arm's own copy of the
dispatcher. Lattice renders with `lib/core/inline-code-directives.js`, so the arm times that too:
the escape, then `dispatches` ("does any kind render this?"). That is the decision, not the render;
the markdown-it path then calls `renderHtml`, which builds the result. Run 2026-10-13 on Node 22 in
a cloud sandbox, so the absolute figures are about half what a laptop gives:

| job | kernel (retired) | arm's dispatcher | shipped | shipped/kernel |
|---|---|---|---|---|
| inline dispatch, every span both read alike | 26 ns | 50 ns | 32 ns | 1.2x |
| &nbsp;&nbsp;ordinary code (code to both) | 23 ns | 42 ns | 27 ns | 1.2x |
| &nbsp;&nbsp;state marks `[x]` | 42 ns | 22 ns | 71 ns | 1.7x |
| &nbsp;&nbsp;pills `{BETA, tag, c4}` | 166 ns | 496 ns | 482 ns | 2.9x |
| Segno syntax the kernel reads as code (482 spans) | — | 987 ns | 2.10 µs | — |

This is the middle of five runs. The every-span ratio read 1.21x, 1.22x, 1.21x, 1.18x and 1.37x, so
it sits under the design note's 1.5x bar with room. The bakeoff times the three columns of a row
alternately, round by round, and keeps each column's fastest round. Timed one column after another,
as it used to be, a slow stretch of the sandbox landed on one column: the kernel's own figure for the
same 4,766 spans read 27 and 32 ns across runs of unchanged code, and the every-span ratio read
anywhere from 1.0x to 1.65x. A different timer function per column (so each call site sees one
target) moved the ratio by about 0.05, inside that noise, and is kept only because it costs nothing.
The 35 pills (and 18 other directives) of 4,742 spans are about 0.13 of the ratio: halving a pill's
cost would move it by less than the run-to-run spread. They are still the slowest thing per span,
and the design note accepts pills above the bar (§ The engine). A pill's grammar stage went from
about 270 ns to about 225 ns (`parse()` no longer allocates a result and a tree object per call, and
skips the rule-table lookup for the default rule), and the shipped decision from about 500 ns to
about 480 ns. The grammar's own time also depends on what V8 has already seen: a pill's parse reads
166 ns in a fresh process and 230 to 370 ns after the process has parsed the shipped decks' other
spans, because the generated rule functions are re-optimized with the wider type feedback.
Before the first-character table the same run read 174 ns for every span and 149 ns for ordinary
code (5.2x the kernel), because every kind ran its own check on every span.

What moved it:

- **A first-character table.** Ordinary code (a letter, `-`, `/`) is asked of no kind. Two
  cheaper-looking shapes lost: a `row.lead` test inside the loop cost 103 ns (the rows are
  different object shapes, so the property load went megamorphic), and indexing the table with
  `NaN` cost 8 ns a span.
- **Indexed loops.** A `for…of` over the list cost 12 ns a span for the iterator alone.
- **A flag, not a second function.** `resolve(text, off, probe)` and `diagnose(text, off, explain)`
  let a kind answer yes or no without building its fields or its reason. The backslash escape used
  to build the reason: a mistyped icon name (`\^{databse}`) ran an edit-distance search over the
  whole set, 173 µs, to decide whether to strip a backslash; it now takes about 1.6 µs.
- **A record binds from the parser's tree.** See "How a record binds fast" below: a pill's bind went
  from about 355 ns to 260 ns, and the dispatcher's decision for it from about 480 ns to 370 ns
  (interleaved runs on one machine).
- **One parse per span.** `dispatches` then `diagnose` on a broken pill or spark parsed the same
  text two or three times; each reader keeps its last result.

The bakeoff column does not show where most of the real gain is. The markdown-it path calls the
escape, then `renderHtml`, then `offPlugin`, and with one plugin switched off every ordinary span
used to be filtered through every kind twice. Per ordinary span on that path (escape, `renderHtml`,
`offPlugin`, same machine): 112 ns to 18 ns with every plugin on, 1,426 ns to 58 ns with the icons
plugin off. Over the whole corpus with icons off, 3,227 ns to 870 ns.

The last bakeoff row covers spans that the decks already write in Segno's notation (`{icon=mail}`,
chart points, sparks, avatars). The retired kernel reads them as plain code, so they have no kernel
figure.

Two things to know when reading it. The kernel's axis figure returns strings, which each chart
then re-reads; Segno's returns typed numbers and ranges, so the axis row undercounts today's cost.
And the grammar's own time depends on what V8 has already seen: a pill parses in about 110 ns in a
fresh process and about 280 ns in one that has also parsed lists and failed spans. The table is
the mixed, realistic figure.

**Whole files, against real tokenizers.** Lattice's CSS, HTML and Markdown grammars
(`tools/parser-bakeoff/languages-grammars.mjs`) beside the tokenizer layer of each real parser,
over every tracked file of each type. This is the like-for-like race: both sides tokenize and
neither builds a tree. Run 2026-10-07 on Node 22 in a cloud sandbox, so the absolute figures are
about half what a laptop gives; the ratios carry:

| | Segno (generated) | tokenizer beside it |
|---|---|---|
| CSS, 3.1 MB | 178 MB/s | postcss 103 · css-tree 142 · @csstools 36 |
| HTML, 0.2 MB | 156 MB/s | parse5 `Tokenizer` 23 |
| Markdown, 22 MB | 207 MB/s | markdown-it block pass alone 68 |

The tokenizers classify more than the grammars do: css-tree's tells a number from a dimension,
and parse5's decodes entities. So the table shows a generated Segno grammar running at
hand-written tokenizer speed. It does not show that Segno does those jobs too. Reproduce with
`npm run parser:bakeoff:languages` (its `tokenizers` block). Three generator changes on
2026-10-07 took the three grammars from 112, 117 and 101 MB/s to these figures (§ How the
generated parser stays fast).

Those figures are V8. In Firefox and WebKit the same three changes made every grammar faster too:
1.24x–1.56x in Firefox and 1.21x–1.55x in WebKit, and 1.29x–1.45x on a real iPhone, with identical trees (the table is in the decision
note's § Generated-parser speed; `npm run parser:bakeoff:languages:browsers` reproduces it).

Every shape on the hostile-input ladder grows linearly and stays under 3 ms at 32,000 characters.
The `/segno` page runs the same ladder in your browser, and lets you write a grammar and parse with it.

### How the generated parser stays fast

`generate()` does three things a grammar author never sees. None changes a tree or an error,
and a differential of about 1.2 million grammar/input pairs held them identical to `compile()`
and to the previous generator:

- **A tested character is not tested again.** When a choice or a loop has read the next character
  to pick its way, the piece it picked reuses that variable and skips the test the choice already
  made. CSS gained most from this (112 → 184 MB/s).
- **A shared piece is written once.** A sub-expression the grammar uses in several places (one JS
  value, reused) becomes one function when its code is large (600 characters or more). Copied
  into every place instead, the Markdown grammar's inline-text loop made one 860-line rule, and V8
  kept deoptimizing and rebuilding it.
- **A run of like characters scans on locals, then by regular expression.** A loop over one
  character set copies the parser's position and input into local variables, so V8 keeps them in
  registers. A run still going after 16 characters is finished by a regular expression that finds
  the first character outside the set. V8 compiles that to native code, and on long runs (prose,
  comments) it is about 1.6x a JS loop. Inside an `attempt()` window the regex is not used,
  because it cannot stop at the window's end: there, reading past it turned a linear grammar
  quadratic, and a test pins that.
- **A set with many ranges above ASCII is searched, not chained.** Up to 16 ranges above U+007F,
  a character test is one comparison per range. Past that, both runtimes binary-search a table of
  range bounds. A set of every other code unit (32k ranges) read 256k characters inside attempt
  windows in 11.4 s generated and 1.6 s compiled; it now takes about 6 ms in each. No shipped
  grammar has more than 9 such ranges, so their parsers are unchanged.

### How a record binds fast

A plain `{…}` span of bare words and `name=bare` items (a pill, a chart point, a state) is bound
straight from the parser's flat tree. The full bind builds an `Item` and a `Scalar` per item, a
`Binding`, and a result; the fast read builds only the result. It is the same rules as the full
bind (§ Write a grammar): positionals first, a declared name, a bare word to its one owner. It
only ever succeeds. On anything else it returns null and the full bind runs, and the full bind
alone words an error: a quote, a nested record or list, an unknown name or word, a repeat, a
missing required value, a tag, a sigil, a sub-slot. So an error reads as it always did, and
`schema.test.ts` holds a success equal to the full bind's on every span of one to three items
built from a pool that reaches each of those branches.

One more condition keeps it correct. The parser writes one reused buffer, and the fast read walks
it while it calls each parameter's `read`. A type of your own may parse a span inside its `read`,
which would overwrite the buffer under the walk. So a slot takes the fast read only when every
type it declares was built by Segno (`text()`, `oneOf()`, `indexed()`, `number()`, and a `range()`
or `named()` of one); a type you wrote, or a copy of a built-in with a new `read`, keeps the full
bind. A built-in is frozen, so it cannot be changed in place to add a `read`. The `.` and `./read`
entries each carry their own mark, so a slot built with `record` from one entry and `text` from the
other takes the full bind: the results are the same and the saving is lost.

## Build

`npm run segno-lib:build` regenerates `notation.generated.ts` and writes `dist/` (ESM + CJS +
`.d.ts`); `npm run segno-lib:check` fails if either is stale. Three entries: `@laticent/segno`;
`@laticent/segno/values` — `readNumber` and `readTime` alone, a few KB against the full library's
80, for a consumer that only reads values and cannot tree-shake a CommonJS `require`; and
`@laticent/segno/read` — `parse`, the schema builders and the types without the grammar compiler
(10KB gzipped against 23KB), which Lattice's `lib/` takes so its live lint does not carry the
whole engine onto the Studio's startup path. `npm run check:segno` (in `docs/`)
typechecks the library alone with no DOM and no Node types, which is the mechanical proof it stands
alone. Tests: `cd docs && npx vitest run src/lib/segno` (fuzzing against a brute-force recognizer and
against Lattice's number and time readers, and metamorphic tests of the notation's promises).
`npm run mutate:segno` injects 77 defects one at a time and fails if the suite misses any; it takes
about fifteen minutes and is not a CI gate.

## License

AGPL-3.0-only. The full text ships as `LICENSE` in the package.
