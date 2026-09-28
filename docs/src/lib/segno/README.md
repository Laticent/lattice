# Segno

**A grammar engine that only builds grammars it can prove are linear — and the one inline notation Lattice reads with it.**

Segno turns a grammar written as data into a parser, and refuses the grammar if it cannot be read
left to right with one character of lookahead and no backtracking (LL(1) over characters). That
refusal is the point: a grammar Segno builds parses in time proportional to its input, on any
input, so an author's span — or a hostile one pasted into the Studio — can never make the linter
hang. The properties a hand-written scanner only has by careful review are, here, a condition of
compiling at all.

On top of the engine sits **the inline notation**: three shapes, one separator, one escape.

```
{BETA, tag, c4}                 a record: a primary value, then words and name=value
[{Effort, 0..10, 5}, Reach]     a list; an empty element holds its place: [, Reach]
"Cost, excluding tax"           quoted text: protects separators, forces the text type
after=Design                    a named item on its own
\{BETA}                         a leading backslash turns the whole span off
```

What a span MEANS comes from a **slot** — a declarative schema for the place it sits (a pill, a
quadrant axis, a gantt task). A bare word binds to the one parameter whose type accepts it, so
`{BETA, tag, c4}` and `{BETA, c4, tag}` are the same pill — and a schema in which a word could bind
two ways does not build.

It is **framework-free**, **zero-dependency** and has **no DOM**. The design and the owner's
decisions: [`engineering/decisions/2026-09-28-segno-unified-inline-notation.md`](../../../../engineering/decisions/2026-09-28-segno-unified-inline-notation.md).
Why an owned engine rather than a library: [`2026-09-28-parser-library-bakeoff.md`](../../../../engineering/decisions/2026-09-28-parser-library-bakeoff.md).

(segno, Italian: sign, mark — and the musical *dal segno*, next to Cadenza.)

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

```ts
import { color, list, number, oneOf, range, record, text } from '@laticent/segno';

const pill = record({
  label: 'a pill',
  positional: [{ name: 'value', type: text() }],
  params: {
    shape: oneOf(['pill', 'chip', 'tag', 'circle', 'diamond']),
    color: color({ max: 12 }),
    size: oneOf(['sm', 'md', 'lg']),
  },
});

pill.read('{BETA, c4, tag}');   // { ok: true, value: { value: 'BETA', shape: 'tag', color: 4 } }
pill.read('{BETA, tag, c13}');  // { ok: false, diagnostics: [{ code: 'unknown-word', message: '… color (a color c1–c12) …' }] }

const axes = list(record({
  positional: [{ name: 'name', type: text() }],
  params: { domain: range(number()), target: number() },
}), { max: 3 });
axes.read('[{Effort, 5, 0..10}, Reach]'); // domain 0..10 and target 5, whatever the order
```

Binding, in order: positional items fill `positional`; `name=value` fills that parameter; any other
bare word fills the ONE parameter, in the highest precedence class, whose type accepts it —
`vocab` (declared words) › `id` › `number` › `time` › `range` › `text`. Any error leaves the span
unbound and reports it with a range and, where one exists, a fix. Nothing is half-applied.

`record` throws a `SchemaError` when two parameters of one class could take the same bare word. The
fix is to make one positional, or to wrap it in `named(...)` so it must be written `name=value`
(journey's `mood=4` and `volume=120` are both numbers).

### Types

| type | spellings |
|---|---|
| `text()` | anything; the only type quoted text can be |
| `oneOf(values, { aliases })` | declared words, case-insensitive, with extra spellings |
| `flag(word)` | a word that switches something on: `milestone` |
| `color({ max })` | `c1`…`cN`, the ceiling set per slot |
| `id()` | `#api` |
| `number()` | `42` `-$0.8M` `12%` `($1.2M)` `1,25M` `1.234.567` — Lattice's chart-value rules |
| `time()` | `2026-03-15` `2026 Q1` `Q3` `Jan` — Lattice's gantt rules |
| `range(of)` | `a..b` over another type |

### Aliases, shortcuts, sigils — and one spelling per deck

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
Both are checked when the schema is built. Every successful bind returns the `spellings` it used, and
`consistency(uses)` reports each occurrence written differently from its deck's most common spelling,
with a fix.

## Speed

Measured against the kernels it replaces, on the inline-code spans in the shipped decks
(`npm run parser:bakeoff:segno`; best of seven long rounds, one machine):

| job | kernel | Segno | ratio |
|---|---|---|---|
| inline dispatch, every span (mostly ordinary code) | 31 ns | 49 ns | 1.6x |
| inline dispatch, the spans that are directives | 271 ns | 450 ns | 1.7x |
| axis list (the kernel returns strings; Segno returns typed numbers and ranges) | 0.93 µs | 2.47 µs | 2.7x |

The design target was 1.5x, and these miss it; the decision note keeps the honest figure and the
plan for it. Every shape on the hostile-input ladder grows linearly, and the ones that took the
parser libraries in the bake-off from one second to over sixteen stay under 3 ms at 32,000
characters. The `/segno` page runs the same ladder in your browser.

## Build

`npm run segno-lib:build` regenerates `notation.generated.ts` and writes `dist/` (ESM + CJS +
`.d.ts`); `npm run segno-lib:check` fails if either is stale. `npm run check:segno` (in `docs/`)
typechecks the library alone with no DOM and no Node types, which is the mechanical proof it is
publishable as-is. Tests: `cd docs && npx vitest run src/lib/segno`.
