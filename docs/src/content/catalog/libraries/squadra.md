---
kind: library
name: Squadra
order: 14
promise: Lint and fix text, with rules that have to prove they work.
intro: A lint rule is a small program that is easy to get subtly wrong. It fires on the text it was meant to leave alone, or its fix doesn't remove what it found, or the fix breaks the document it was cleaning up. Squadra makes every rule carry its own examples and runs them before the rule may load, then sends every fix through one driver that checks it kept the document's shape.
group: Writing and editing
inLattice: Applies every fix behind "Fix all" in the Studio and `lint:deck --fix`.
mark: /squadra-mark.svg
useWhen: You write lint rules for a format of your own, and a rule that is quietly wrong costs your authors more than a missing one.
facts:
  - { k: Package, v: '@laticent/squadra' }
  - { k: Status, v: Coming to npm with Lattice 1.0 }
  - { k: Runs in, v: 'The browser, a worker and Node' }
  - { k: Dependencies, v: None }
  - { k: License, v: AGPL-3.0 }
reference:
  - label: The README
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/squadra/README.md
    note: The model, the refusals, the fix driver, waivers and budgets.
  - label: The fix driver
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/squadra/fix.ts
    note: How a pass picks, applies and verifies fixes, in one file.
  - label: The design
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-10-26-squadra-lint-library/design.md
    note: The whole library, including the milestones that aren't built yet.
  - label: Why we built it
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-10-26-squadra-lint-library.md
    note: The lint code it replaces, the libraries we measured first, and the plan.
---

## The problem

You maintain a format of your own: slide decks in Markdown, a config file, a house style for docs. You write lint rules for it, and each rule is a small program with two jobs, finding a problem and, often, fixing it. Either job can be wrong in a way no one notices for months:

- **A rule that fires on good text.** Authors learn to ignore the warning, and then they ignore the real ones too.
- **A fix that doesn't fix.** The finding comes back after the fix, and a "fix all" loop runs until it gives up.
- **A fix that breaks the document.** A rewritten line adds a slide break, or empties the front matter, and the deck that comes out has a different number of slides from the one that went in.
- **A fix that edits an example.** A code fence that shows the wrong form on purpose gets "corrected", and the documentation now teaches nothing.

Tests catch some of this, if someone wrote them. Most rules ship with a test for the case their author had in mind and nothing for the rest.

## The idea

- **A rule carries its own examples.** A fixtures file holds `bad` examples with the exact spans the rule must report, `good` examples it must leave alone, and a `fixed` partner for each bad one that its fix must produce.
- **The compiler refuses a rule it can't show works.** Before a rule loads, Squadra runs it on its examples. A rule that misses a bad example, fires on a good one, or has a fix that doesn't give its `fixed` partner is refused, with a code that says why. Strict mode, for CI, throws; lenient mode, for an editor, drops the rule and reports it.
- **A finding has a span, not a line.** Every finding points at UTF-16 offsets in the source, so a fix is a list of edits on spans and two fixes can be checked for overlap exactly.
- **One driver applies every fix.** It applies every fix that overlaps no other in one pass, then checks each one: the document must keep its number of top-level units, its header and the text of every code fence, unless the rule declared the change. A fix whose finding is still there afterwards is reverted.
- **It knows nothing about your format.** A language plugin parses the text into a tree, names the ranges no rule may edit (code fences, comments) and states the document's shape. Squadra writes no parsers.

## How to use it

Install it:

```sh
npm install @laticent/squadra
```

> Squadra publishes to npm with Lattice 1.0. Until then it lives in the Lattice repository at `docs/src/lib/squadra`.

A rule is a function with metadata. `visit` maps a node kind to a handler; the driver walks each tree once and calls every rule that visits it:

```ts
import { compileRuleset, defineRule, editsFix, fix, lint } from '@laticent/squadra';

const noTodo = defineRule({
	id: 'notes/no-todo',
	language: 'notes',
	severity: 'warning',
	summary: 'A TODO left in the text.',
	examples: 'no-todo.fixtures.md',
	fixable: true,
	budget: { ops: 10_000 },
	visit: {
		line(node, ctx) {
			const i = ctx.text(node).indexOf('TODO');
			if (i < 0) return;
			const span = { from: node.from + i, to: node.from + i + 4 };
			ctx.report({ span, message: 'A TODO is left in.', fixes: [editsFix('Mark it done.', { op: 'replace', span, text: 'DONE' })] });
		},
	},
});
```

Its examples are fences in a Markdown file. `⟦` and `⟧` mark where a `bad` example must be reported:

````md
```notes bad
call the venue ⟦TODO⟧
```

```notes fixed
call the venue DONE
```

```notes good
call the venue DONE
```
````

Compile once, then lint and fix as often as you like:

```ts
const rules = compileRuleset({ name: 'notes', version: '1', languages: [notes], rules: [noTodo], examples: { 'no-todo.fixtures.md': fixtures } });

lint(rules, [{ path: 'plan.notes', text, language: 'notes' }]).findings;
const out = fix(rules, { path: 'plan.notes', text, language: 'notes' });
out.text;    // the fixed text; the driver never writes a file
out.skipped; // every fix it refused, each with its reason
```

| Refusal | The compiler refuses the rule when |
| --- | --- |
| `bad-did-not-fire` | A `bad` example gave no finding, a finding off its marked spans, or the wrong count |
| `good-fired` | A `good` example gave a finding |
| `fix-mismatch` | Fixing a `bad` example didn't give its `fixed` partner |
| `fix-did-not-resolve` | After its fix, the rule still fires |
| `fix-changed-shape` | A fix changed the document's shape and the rule didn't declare it |
| `fix-grew` | A fix kept inserting text pass after pass, or never converged |
| `budget-exceeded` · `rule-threw` | On its own examples, the rule ran over its op budget or threw |

The README lists all of them. The fix driver makes these promises at run time, and its tests check each one:

| Guarantee | How |
| --- | --- |
| A fix never edits a code fence | The language names inert ranges, and a fix that touches one is skipped unless its rule opted in |
| A fix never changes the document's shape by accident | Each fix is checked on its own, then the pass as a whole; two that break it only together are retried one at a time |
| A fix that doesn't fix is reverted | Its finding is looked for again at the mapped span after the pass |
| A fix all always stops | A pass that applies nothing, a text seen before, or a pass cap ends the run, and the result says which |
| One slow rule can't stall the rest | Every rule has an op budget; past it, that rule stops on that file and the others run |

`@laticent/squadra/driver` is the fix path alone, for a browser bundle that applies fixes and never compiles a rule: 7.7 KB minified and gzipped, against 14.3 KB for the whole library.

## Where else it fits

- **A format of your own**: a config language, a templating syntax or a house Markdown dialect, with rules you want to trust in CI.
- **A migration between linters**: the old linter's findings go through the same driver as a "producer", so every old fix gets the new checks before a single rule is ported.
- **An editor's quick fixes**: lenient mode drops a broken rule instead of crashing the editor, and says which rule and why.
- **Rules from a source you don't control**: a ruleset marked untrusted has every fix capped at "suggested", so nothing it offers applies on its own.

## How Lattice uses it

Every "Fix all" in Lattice goes through Squadra's fix driver: the Studio and the Playground in the browser, and `lint:deck --fix` on the command line. Lattice's own deck rules are not Squadra rules yet; their fixes reach the driver through a producer, so each one gets the driver's checks. The browser loads the driver only when an author presses Fix all.

Before switching, we ran the old fix loop and the driver on the same inputs and compared the decks they produced, measured on 2026-10-29:

| Inputs | Sources | Same result | Different |
| --- | --- | --- | --- |
| Every input the lint unit tests use | 58,431 | 58,431 | 0 |
| Those inputs spliced into real decks | 2,704 | 2,704 | 0 |
| Every deck in the repository, as it is | 486 | 486 | 0 |
| A fenced copy above each fixable line | 99 | 95 | 4, each one the driver fixing a finding the old loop stopped short of |

On the second set the driver took 84 seconds where the old loop took 471, because it applies every fix that doesn't overlap another in one pass. The full report is in the decision note's folder.

## What it doesn't do

- **It can't prove a rule is right everywhere.** The examples prove the rule fires where its author said and stays quiet where they said; they say nothing about text nobody wrote an example for. Diff a migrated rule against the system it replaces, on real inputs.
- **It ships no languages yet.** You write the language plugin for your format. Markdown, YAML and JSON reference languages are the next milestones, with Lattice's deck language built on them.
- **It can't stop a rule that loops forever without calling it.** JavaScript can't interrupt a function, so the op budget only counts calls into Squadra. Run rules you don't trust in a worker you can terminate.
- **It doesn't write files or watch them.** It takes text and returns text and findings; the command-line tool, the cache and editor integration are your app's, or a later milestone's.
