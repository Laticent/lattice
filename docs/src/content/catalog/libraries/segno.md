---
kind: library
name: Segno
order: 6
promise: Turn a short typed instruction into structured data, safely.
intro: Segno reads a snippet like {new-checkout, beta, 25%, [eu, us]} into a typed object, in any word order, and when a word doesn't fit it says exactly which word and what was expected. Every parser it builds reads in one pass, so no pasted string can make your app hang.
group: Drawing and parsing
inLattice: Reads every inline directive, number and date in a deck.
useWhen: People type small structured instructions — a command, a filter, a rule, a cell — and you need each word read correctly, in any order, with errors that point at the problem.
mark: /segno-mark.svg
facts:
  - { k: Package, v: '@laticent/segno' }
  - { k: Status, v: Coming to npm with Lattice 1.0 }
  - { k: Runs in, v: Anywhere JavaScript runs }
  - { k: Dependencies, v: None }
  - { k: License, v: AGPL-3.0 }
reference:
  - label: The README
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/segno/README.md
    note: The notation, slots, every type, the grammar engine and the speed measurements.
  - label: Slots and schemas
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/segno/schema.ts
    note: How a word finds the one field that accepts it.
  - label: The parser bake-off
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-09-28-parser-library-bakeoff.md
    note: Why we built our own engine, with the measurements against five others.
  - label: Why we built it
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-09-28-segno-unified-inline-notation.md
    note: The design note — one notation instead of 27 hand-written ones.
---

## The problem

Lots of products let people type small structured instructions inside ordinary text: a chat command (`/remind me tomorrow 9am`), a filter box (`status:open label:bug`), a spreadsheet cell, a tag in a document. Each one needs a parser.

Picture a feature-flag tool where an engineer types `new-checkout, beta, 25%, eu and us, sticky` and expects the app to know which word is the stage, which is the percentage and which are the regions. The usual ways to read that go wrong:

- **A regular expression or `split(',')`** breaks on the first quoted comma ("Cost, excluding tax"), and every feature grows its own slightly different rules. Lattice itself had grown 27 hand-written mini-languages before Segno.
- **General parser libraries can hang on hostile input.** In Segno's published measurement, crafted 32,000-character inputs took one popular parser library 7.3 seconds, and three others never finished. Segno took 7 milliseconds. One pasted string can freeze a page.
- **Fixed word order makes people memorize.** "Stage first, then percent" fails the moment someone writes them the other way around.
- **Loose parsers guess silently.** A parser that binds `25` to the wrong field fails quietly, and nobody finds out until it ships.

## The idea

- **A tiny notation.** A value, a `[list]` or a `{record}`, with commas between items, `name=value` when you want to be explicit, and double quotes to protect a comma.
- **A slot says what a snippet can hold.** A slot declares the fields a snippet can fill, and the type each field takes. A bare word binds to the *one* field whose type accepts it — so word order doesn't matter. If a word could fit two fields, the schema is refused when you build it, not when a user trips over it.
- **Types for the words people actually write.** `number()` reads `42`, `-$0.8M`, `12%` and `($1.2M)`; `time()` reads `2026-03-15`, `2026 Q1` and `Jan`; `oneOf()` takes a word list with aliases, so `live` can mean `on`.
- **Errors point at the word.** A failed read names the exact characters and lists what was allowed there, often with a fix.
- **A grammar engine that refuses to guess.** Underneath, you can write your own grammar. Segno builds a parser only if it can read the grammar left to right without ever backing up — so its time grows in step with the input, whatever the input. If two choices could start the same way, it refuses and names every rule involved.

## How to use it

Install the package:

```sh
npm install @laticent/segno
```

> Segno publishes to npm with Lattice 1.0. Until then it lives in the Lattice repository at `docs/src/lib/segno`.

Declare what a rollout rule holds, then read what people type:

```ts
import { flag, list, number, oneOf, record, text } from '@laticent/segno';

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
// { ok: true, value: { flag: 'new-checkout', stage: 'beta',
//   percent: { value: 25, signed: false, unit: '%' }, regions: ['eu', 'us'], sticky: true } }

rollout.read('{new-checkout, [eu], 25%, live}');
// any order works, and "live" is an alias, so stage is 'on'

rollout.read('{new-checkout, beta, 25%, mars}');
// { ok: false, diagnostics: [{ code: 'unknown-word', from: 26, to: 30,
//   message: '"mars" is not anything a rollout rule takes — it takes flag (text), stage (one of off, beta, on), …' }] }
```

| Call | What it gives you |
| --- | --- |
| `record(spec)` / `list(of)` / `value(type)` | Build a slot; `slot.read(text)` returns the value or the errors |
| `text`, `number`, `time`, `oneOf`, `flag`, `range` | The field types |
| `readNumber`, `readTime` | Just the number and date readers — also at `@laticent/segno/values`, a few KB |
| `consistency(uses)` | Flags a word spelled differently from the rest of the document |
| `compile(grammar)` | Your own parser from a grammar, or an error naming every ambiguous rule (experimental) |
| `restrict(grammar, drop)` | A smaller grammar for the common shapes, derived from yours so the two cannot disagree (experimental) |
| `slot.refuses(text)` | A cheap "this will not bind", with no error message built (experimental) |

The notation and slots are stable. The grammar engine is marked experimental while the package is at 0.x.

## Where else it fits

- **Feature-flag and rollout rules** typed inline, as above.
- **Chat and command-palette commands** with typed arguments in any order, and errors that name the bad word.
- **Search and filter boxes** like `{owner=ada, 2026 Q1..2026 Q2}`.
- **Config values and spreadsheet-style cells** that need human number and date formats — the `values` entry alone is a few KB.
- **Safe tokenizers for untrusted input** in a browser, a worker, a server or an edge function. `generate()` even writes a parser out as standalone TypeScript.

## How Lattice uses it

Lattice lets authors write small directives inside Markdown: `` `{BETA, tag, c4}` `` is a pill, `` `[x]` `` a checkbox, `` `[{Effort, 0..10}, Reach]` `` a chart's axes. Segno reads all of them, in the renderer and in the deck linter, which also uses it to keep one spelling per deck. Every number and date on a chart goes through its value readers, and every flowchart and state-chart row is read by a grammar written in Segno.

## What it doesn't do

- **It isn't a full language toolkit.** Its grammars split text into labeled pieces; turning those into a full structure takes your own code.
- **It's strict on purpose.** Grammars that would need to look further ahead or back up are refused, unless you opt into one of its limited exceptions.
- **The notation is one line.** It's for inline snippets, not documents.
- **A grammar's character sets don't cover emoji.** Match those as literal text instead.
