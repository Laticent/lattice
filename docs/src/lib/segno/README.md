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

- two `alt` branches that can start with the same character;
- a loop whose body can match nothing, or that could either repeat or stop on the same character;
- a rule that reaches itself without consuming (left recursion).

`lint(spec)` returns the same list without throwing. Nesting is capped at `MAX_DEPTH` (64) so a
deeply nested input is an error, never a stack overflow.

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

[Lattice](../../../../README.md) renders slide decks from Markdown, and its inline code spans carry
directives: `` `{BETA, tag, c4}` `` is a pill, `` `[x]` `` a state mark, `` `[{Effort, 0..10}, Reach]` ``
a chart's axes. Before Segno it had 27 hand-written grammars for them with 21 sigils between them;
it is moving all of them onto the one notation, with one schema per place a span can sit. Why it
built an engine rather than adopting a parser library, and what it measured:
[`engineering/decisions/2026-09-28-parser-library-bakeoff.md`](../../../../engineering/decisions/2026-09-28-parser-library-bakeoff.md).
The design: [`2026-09-28-segno-unified-inline-notation.md`](../../../../engineering/decisions/2026-09-28-segno-unified-inline-notation.md).

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
[`2026-09-28-parser-library-bakeoff.md` § Head to head with Segno](../../../../engineering/decisions/2026-09-28-parser-library-bakeoff.md).
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

Two things to know when reading it. The kernel's axis figure returns strings, which each chart
then re-reads; Segno's returns typed numbers and ranges, so the axis row undercounts today's cost.
And the grammar's own time depends on what V8 has already seen: a pill parses in about 110 ns in a
fresh process and about 280 ns in one that has also parsed lists and failed spans. The table is
the mixed, realistic figure.

Every shape on the hostile-input ladder grows linearly and stays under 3 ms at 32,000 characters.
The `/segno` page runs the same ladder in your browser, and lets you write a grammar and parse with it.

## Build

`npm run segno-lib:build` regenerates `notation.generated.ts` and writes `dist/` (ESM + CJS +
`.d.ts`); `npm run segno-lib:check` fails if either is stale. `npm run check:segno` (in `docs/`)
typechecks the library alone with no DOM and no Node types, which is the mechanical proof it stands
alone. Tests: `cd docs && npx vitest run src/lib/segno` (fuzzing against a brute-force recognizer and
against Lattice's number and time readers, and metamorphic tests of the notation's promises).
`npm run mutate:segno` injects 72 defects one at a time and fails if the suite misses any; it takes
about fifteen minutes and is not a CI gate.
