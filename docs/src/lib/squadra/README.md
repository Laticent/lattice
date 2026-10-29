# @laticent/squadra

*Squadra* is Italian for the set-square, and *squadrare* is to square something up and to look it
over.

Lint text and fix it, with a library that refuses a rule it cannot prove works. Every rule carries
its own examples. It must fire on its bad ones at the spans they mark, stay quiet on its good ones,
and its fix must turn each bad example into its fixed partner, resolve its own finding, converge
and keep the document's shape. A rule that fails any of those does not load. Framework-free, no
dependencies, no DOM and no `fs`: the core reads text a host hands it and returns findings and new
text, so the same rules run in Node, a browser and a worker.

Lattice is the first user. The design is
[`2026-10-26-squadra-lint-library.md`](../../../../engineering/decisions/2026-10-26-squadra-lint-library.md)
and its [design.md](../../../../engineering/decisions/2026-10-26-squadra-lint-library/design.md).
This package is milestone **M1a**: findings with spans, the edit kernel, the fix driver with its
shape check, the `edits` fix engine, the registration refusals, waivers and ratchets.

## The model

- **A finding has a span**: `{ from, to }` in UTF-16 offsets of the source text, never "the line
  that reads like this". A fix is a list of edits on spans.
- **A language** turns a source into a tree of `{ kind, from, to, kids }` nodes, marks the **inert**
  ranges rules do not see (code fences, comments, strings), and states the document's **shape**:
  its top-level units (slides, rules, keys), its header (front matter) and the text of every inert
  range. Squadra writes no parsers; a language wraps one.
- **A rule** is a function with metadata. `visit` maps a selector to a handler, and the driver
  walks each tree once and dispatches every node to every rule that visits it. `check` gets the
  whole file once instead.
- **A fix engine** turns a fix into edits. The `edits` engine is built in; an engine for a fix
  format Squadra did not design (a migrating linter's line rewrites, a formatter) is a plugin.
- **One fix driver** checks, applies and verifies every fix from every engine, so its guarantees
  hold whatever produced the fix.

## Write a rule

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

Its examples live in a fixtures file, a Markdown file whose fences are the cases. The info string
is `<language-hint> <role> [name] [xN]`. `⟦` and `⟧` mark the spans a `bad` example must be
reported at; `x3` means exactly three findings; a `fixed` fence is what fixing the `bad` fence
before it (or the one it names) must give:

````md
A TODO is fixed by marking it done.

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

Then compile, lint and fix:

```ts
const rules = compileRuleset({ name: 'notes', version: '1', languages: [notes], rules: [noTodo], examples: { 'no-todo.fixtures.md': fixturesText } });
lint(rules, [{ path: 'a.notes', text, language: 'notes' }]).findings;
fix(rules, { path: 'a.notes', text, language: 'notes' }).text;
```

## The guarantee, and its limit

`compileRuleset` collects every problem in every rule. Strict mode (the default, for CI) throws one
`RulesetError` listing them all. Lenient mode (for an editor) drops each refused rule, keeps the
rest, and reports every refusal as a `squadra/rule-refused` finding.

| Code | Refused when |
|---|---|
| `no-examples` | No fixtures file, or no `bad` or no `good` example. |
| `bad-did-not-fire` | A `bad` example gave no finding, a finding off its marked spans, or the wrong count. |
| `good-fired` | A `good` example gave a finding. |
| `good-avoids-selector` | No `good` example holds a node the rule visits, so nothing shows its test works. |
| `fix-mismatch` | Fixing a `bad` example did not give its `fixed` partner. |
| `fix-did-not-resolve` | After its fix, the rule still fires. |
| `fix-grew` | The driver inserted text in more than one pass, or never converged. |
| `fix-changed-shape` | A fix changed the shape without the rule declaring it in `changes`. |
| `fix-missing-fixed` | The rule declares `fixable: true` and a `bad` example has no `fixed` partner. A rule declares it, rather than the compiler inferring it from the examples, so a fix that appears only on inputs the examples do not cover still owes a `fixed` example; at run time a fix from a rule without it is dropped and reported as `squadra/undeclared-fix`. |
| `unknown-kind`, `bad-selector` | A selector names a kind the language does not publish, or does not parse. |
| `unknown-vocab`, `unknown-fact`, `unknown-language` | A reference to something the ruleset does not supply. |
| `undeclared-read`, `undeclared-fix`, `rule-threw`, `budget-exceeded` | On its own examples, the rule read what it did not declare, offered a fix without `fixable: true`, threw, or ran over its budget. |
| `reserved-name`, `duplicate-id`, `no-budget`, `bad-id`, `bad-rule`, `bad-fixtures` | The rule itself is malformed. |
| `not-built` | A declarative manifest (by M4) or a project rule (M3). |

**What it proves:** the rule is alive, precise at its marked spans, quiet on its good examples, and
its fix converges and keeps the shape. **What it does not prove:** that the rule is right on inputs
its author did not write. Fixtures are written by the rule's author. A migration should also diff
each rule against the system it replaces, on inputs nobody wrote for it.

A host that compiles often (an editor) passes `verified`, a stamp per rule from `stampRuleset()`,
and the example run is skipped for every rule whose stamp still matches. The stamp hashes the rule
(its functions by their source), its fixtures, the vocabulary it reads and its language's id and
version. It cannot see modules a rule imports, so the build that writes it must re-stamp when they
change.

## The fix driver

`fix(rules, source, opts)` runs passes until nothing applies:

1. Lint, and take each finding's first fix at or under `opts.safety` (default `safe`). A ruleset
   compiled with `trust: 'untrusted'` has every fix capped at `suggested`. `unsafe` needs `only`.
2. Order fixes by the ruleset's `order`, severity, position and rule id, and accept each one that
   overlaps nothing accepted and edits no inert range its rule did not opt into
   (`inert: 'include'`).
3. Apply every accepted fix in one left-to-right build.
4. Verify. Each fix's shape is checked on its own, so two changes that cancel out (one slide break
   deleted, one added) are both caught; a fix whose rule did not declare its change is reverted
   as `broke-structure`. The pass is then checked as a whole, and two fixes that break the shape
   only together are reverted and retried one at a time. If a fix's own finding is still there
   (same rule, same message, overlapping its mapped span; a finding that merely touches it does not
   count), the fix is reverted, recorded as `did-not-resolve`, and the rule stops for the run. A
   rule that grows the same place three passes running is a fix that never converges even though
   its message keeps changing: the run rewinds to before the first of those passes and stops it.
5. Stop when a pass applies nothing, when the text repeats (`cycle`), or at `maxPasses` (default
   10, reported as `max-passes`).

The result is `{ text, applied, skipped, passes, remaining }`; every skip names its reason. The
driver never writes: it returns text.

`@laticent/squadra/driver` is the fix path alone, for a browser bundle that fixes findings from a
producer and never compiles a rule: `fix`, `rulesetOf` (a ruleset with languages and engines and
no rules), the edit kernel and the `edits` engine. It is 7.0 KB minified and gzipped, against 13.3 KB
for the whole library (2026-10-29).

### The `edits` engine

`editsFix(description, ops, safety?)` builds a fix from `replace`, `rename`, `delete`,
`deleteLine`, `insertBefore`, `insertAfter` and `wrap`. Several ops are one atomic fix.
`deleteLine` has two guards, because a line is coarser than a node: it skips as `not-alone` when
the line holds more than the span or the next line is indented deeper (a `style: |` block), and it
deletes the whole header when the line was the header's only content, because an empty `---`/`---`
block reads on to the next `---` and swallows the first slide.

### Producers

A migration runs two linters for a while. `LintOptions.producers` and `FixOptions.producers` take
findings from outside the ruleset, `{ id, produce(source) }`, and lower and fix them through the
same driver, so every fix gets the driver's checks. The registration refusals do not apply to
them, because nothing registers them; a migration gains those one rule at a time.

## Budgets

Every `ctx` call costs one op against the rule's `budget.ops`; a selector costs one per new answer.
Past the budget the rule stops on that file with `squadra/budget-exceeded`, and the other rules
still run. A stopped rule stays stopped even if it catches the signal the driver throws. A rule stops after `budget.findings` (default 1,000) with `squadra/findings-capped`. A
rule that throws is reported as `squadra/rule-threw`. An op counter cannot stop a rule that loops
without calling `ctx`: JavaScript cannot preempt a function. The Node host's worker timeout (M3)
is the backstop; in a browser there is none, so rules from a source you do not trust should be
declarative (by M4).

## Waivers and ratchets

```ts
lint(rules, sources, { waivers: { waivers: [{ rule, target, count, match, reason, expires }], ratchets: [{ rule, target, budget, reason }] } });
```

A **waiver** covers `count` findings (default 1) of one rule in one file, optionally only where the
span's text contains `match`. It fails as `squadra/stale-waiver` when it covers fewer, and stops
suppressing after `expires` (`squadra/expired-waiver`, against `opts.now`). A **ratchet** allows a
budget of findings per file; a glob target is one budget per matching file. Over it is
`squadra/ratchet-exceeded`; under it is `squadra/ratchet-down`. Staleness and ratchet-down run only
on a full run (`coverage: 'full'`, the default). Squadra's own findings can never be waived.

## Selectors

Before M4, a selector is node kinds, `*`, the child (`>`) and descendant (space) combinators, and
comma lists: `> item, > list > item`. Matching is memoized across a whole walk, so it costs
O(nodes × steps) at any depth. Design §6.4's full language (attributes, predicates, text
operators) is a superset, so a selector written today keeps its meaning.

## Not checked at compile

A code rule's fix engines are known only when it reports, so an unknown engine shows at fix time as
`engine-missing`, not as `unknown-engine` at compile. `fix()` takes no waivers: a fix is offered
for a waived finding, and the full lint run reports the waiver stale afterwards.

## Output

`reportText(result, sources?)` prints findings by file, with the source line and a caret.
`reportJson(result)` prints `{ format: 1, findings, stats }`; every fix is already lowered to
`{ engine, safety, description, edits }`. Both escape what an author may have typed.

## Cost

Measured by the benchmark's Squadra tier (`npm run bench`, Node 22, cloud sandbox, 2026-10-29):

| Scenario | Work | Median |
|---|---|---|
| Fix 50 findings in one source | 1 pass, 50 fixes | 1.0 ms |
| Lint 1 MB of one repeated line | 3,004 ops; capped at 1,000 findings | 53 ms |
| A mixed selector on a 1,000-level tree | 5,503 ops | 1.7 ms |
| Strict compile, per rule | the rule's examples, linted and fixed | 0.05 ms |

Before the selector memo was shared across a walk, the 1,000-level case cost 42,169,002 ops and
1.5 s; that is the super-linear shape the parser bake-off found in general libraries on hostile
input, and why the bench keeps the case.

## Not yet

M1b brings the reference Markdown language and Lattice's deck language, on the Segno deck
pipeline. M2 adds the reference JSON language and moves Lattice's allowlists onto waivers. M3 adds
CSS, the JS/TS adapter, project rules (`collect` and `decide`), the cache and workers. M4 adds the
declarative selector language and rule manifests, inline suppressions, the SARIF, GitHub and LSP
reporters, and the learn and demo pages. The reference YAML language is the rest of M1a.
