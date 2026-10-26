# Squadra: the design (2026-10-26)

The design specification for Squadra, the lint library proposed in `../2026-10-26-squadra-lint-library.md`. That note
says why. This file says what: the packages, the API, the language plugins, the fix engine, the manifest files, how it
runs, and how Lattice adopts it. Nothing here is built yet. Every signature is a proposal. M1 can change a signature
when building it shows the signature is wrong, and the change lands in this file in the same PR.

Read it by section. §1 is a two-minute tour. §3 defines every term the rest uses.

## Contents

1. A two-minute tour
2. Packages and entry points
3. Terms
4. The core API
5. Language plugins
6. Rules
7. The fix engine: Rettifica
8. The guarantee: what Squadra refuses
9. Waivers, suppressions, ratchets and baselines
10. Configuration
11. How it runs, and why it is fast
12. Output
13. The command line
14. Usage patterns
15. How Lattice adopts it
16. Security model
17. How the library is tested
18. Stability and versioning
19. Documentation deliverables
20. What Squadra does not do
21. Open decisions

## 1. A two-minute tour

A rule is a JSON file. This one is Lattice's `autosplit-retired`, which today is about 30 lines of regex in
`findRetiredAutosplitDirective` (`lib/authoring/lint-core.js`) with advice text but no machine fix. The manifest below
keeps its four messages and adds the fix:

```json
{
  "$schema": "../../schema/rule.schema.json",
  "format": 1,
  "id": "deck/autosplit-retired",
  "language": "lattice-deck",
  "summary": "`autosplit:` was retired; slides that don't fit split automatically.",
  "select": "front-matter > fm-key[name=autosplit]",
  "cases": [
    {
      "when": { "value": { "in": ["off", "false", "no"] }, "fact": { "deck.family": { "not": "wide" } } },
      "severity": "error",
      "message": "`autosplit: off` no longer works; slides that don't fit still split into more pages.",
      "hint": "To keep one slide whole, add `<!-- stress-slide -->` to that slide.",
      "fix": { "safety": "safe", "delete": "line", "description": "Delete the line." }
    },
    {
      "when": { "value": { "in": ["off", "false", "no"] } },
      "severity": "suggestion",
      "message": "`autosplit: off` no longer does anything.",
      "fix": { "safety": "safe", "delete": "line", "description": "Delete the line." }
    },
    {
      "when": { "fact": { "deck.family": { "not": "wide" } } },
      "severity": "suggestion",
      "message": "`autosplit:` no longer does anything; slides that don't fit split automatically.",
      "fix": { "safety": "safe", "delete": "line", "description": "Delete the line." }
    },
    {
      "severity": "suggestion",
      "message": "`autosplit:` no longer does anything.",
      "fix": { "safety": "safe", "delete": "line", "description": "Delete the line." }
    }
  ],
  "examples": "autosplit-retired.fixtures.md"
}
```

Its examples sit beside it, in a Markdown file whose fences are labeled `bad`, `fixed` and `good`:

`````md
````md bad
---
size: story
autosplit: off
---
# Title
````

````md fixed
---
size: story
---
# Title
````

````md good
---
size: story
---
# Title
````
`````

Running it:

```ts
import { compileRuleset, lint, fix } from '@laticent/squadra';
import { latticeDeck } from 'lattice/lib/authoring/squadra/deck-language.js'; // Lattice's own plugin
import autosplit from './rules/autosplit-retired.rule.json' with { type: 'json' };

const rules = compileRuleset({ languages: [latticeDeck], rules: [autosplit], examples: { /* loaded fixtures */ } });
// compileRuleset ran the rule on its own examples. It would have thrown a RulesetError
// if the bad example did not fire, the good one did, or the fix did not produce `fixed`.

const { findings } = lint(rules, [{ path: 'deck.md', text, language: 'lattice-deck' }]);
const { text: fixedText, applied } = fix(rules, { path: 'deck.md', text, language: 'lattice-deck' });
```

Everything else in this file is the detail behind those three calls.

## 2. Packages and entry points

| Package | Entry | Holds | Depends on |
|---|---|---|---|
| `@laticent/squadra` | `.` | Types, rule compiler and refusals, selector engine, lint driver, fix driver, waivers, reporters | `@laticent/rettifica` |
| `@laticent/squadra` | `./segno` | `fromSegno()`: turns any Segno grammar into a Squadra language | `@laticent/segno` (peer) |
| `@laticent/squadra` | `./node` | The Node host: files, globs, worker pool, disk cache, CLI | Node built-ins |
| `@laticent/squadra` | `./testing` | `testRuleset()`, fixture loader, assertion helpers for rule authors | none beyond the core |
| `@laticent/rettifica` | `.` | Text edits: plan, check for conflicts, apply, diff, map offsets | none |

Both live as workspace packages under `docs/src/lib/` beside Segno and Cadenza. Rules follow the family:

- **No DOM, no `fs` in the core.** The core runs unchanged in a browser, a worker, Node or an edge function. Only
  `./node` touches the filesystem. That is the property `lib/authoring/lint-core.js` has today ("NO `fs` and NO `require`
  of lib/components, so it bundles cleanly for the browser"), and Squadra keeps it.
- **No runtime dependencies beyond a sibling library.** `@laticent/squadra` depends on `@laticent/rettifica`. The Segno
  adapter is a separate entry with Segno as a peer, so a user who brings a different parser never installs Segno.
- **Each entry is bundled on its own**, as Segno's `.`, `./read` and `./values` are, so the browser bundle carries only
  what it imports.

**Why Rettifica is a separate library.** Applying a set of text edits safely is useful without any linter: codemods,
editor servers, refactoring tools and template engines all need it. Rettifica has no idea what a rule is. It takes edits
and returns text, or refuses with a reason. See §7.

## 3. Terms

| Term | Meaning |
|---|---|
| **Source** | One file's text plus its path and language id: `{ path, text, language }`. The host supplies it. The core never reads a file. |
| **Span** | A range of a source as UTF-16 offsets, `{ from, to }`, half-open. The same unit Segno uses. |
| **Language** | A plugin that turns a source into a tree of nodes and says which parts are inert (§5). |
| **Node** | `{ kind, from, to, kids, attrs? }`. Segno's `Node` shape, with optional `attrs` a language may add. |
| **Kind** | A node's type name, such as `fm-key`, `slide` or `declaration`. A language publishes its kinds, and a selector may name only those. |
| **Inert range** | A span rules do not see unless they opt in: a code fence, a comment, a string. The language marks it once. |
| **Fact** | A value derived from a source (`deck.family`) or from a whole project. Rules read facts. They do not recompute them. |
| **Vocabulary** | Named lists passed in at compile time, such as Lattice's component and modifier names. A rule refers to one as `@components`. |
| **Rule** | A declarative manifest (§6.2) or a code rule (§6.5) that reports findings. |
| **Project rule** | A rule over many files, written as `collect` (per file) and `decide` (across files) (§6.6). |
| **Finding** | What a rule reports: rule id, severity, span, message, optional hint, optional fixes (§12.1). |
| **Fix** | One machine remedy for a finding. It holds an engine id, a safety grade, and the engine's payload. All of a fix's edits apply, or none do. |
| **Edit** | `{ from, to, text }`: replace that span with that text. Every fix lowers to edits. |
| **Fix engine** | A plugin that lowers a fix's payload to edits against the current text (§7.2). |
| **Ruleset** | A compiled, validated set of rules plus their languages, vocabularies and engines. Everything runs against one. |
| **Waiver** | A recorded, reasoned exception to a rule for a named target. Stale waivers fail (§9). |
| **Ratchet** | A per-rule count budget that may only go down (§9.3). |
| **Host** | What supplies sources, writes results and holds a cache: the Node host, the Studio, an editor, a test. |

## 4. The core API

TypeScript signatures. The names are the proposal; the shapes are what M1 builds and tests.

```ts
// ── compile ───────────────────────────────────────────────────────────────────
export function compileRuleset(input: RulesetInput): Ruleset;   // throws RulesetError listing EVERY problem
export function checkRuleset(input: RulesetInput): Problem[];    // the same list, without throwing (like Segno's lint)

export interface RulesetInput {
  readonly languages: readonly Language[];
  readonly rules: readonly (RuleManifest | CodeRule | ProjectRule)[];
  readonly examples?: Readonly<Record<string, string>>;  // fixture path → file text; the host loads them
  readonly vocab?: Readonly<Record<string, readonly string[]>>;
  readonly engines?: readonly FixEngine[];               // `edits` is always present
  readonly defaults?: { readonly budget?: Budget; readonly severity?: Severity };
}

// ── lint ──────────────────────────────────────────────────────────────────────
export function lint(rules: Ruleset, sources: Iterable<Source>, opts?: LintOptions): LintResult;
export function lintProject(rules: Ruleset, project: Project, opts?: LintOptions): Promise<LintResult>;

export interface LintOptions {
  readonly only?: readonly string[];          // rule ids or globs ('deck/*')
  readonly minSeverity?: Severity;
  readonly waivers?: WaiverSet;
  readonly cache?: Cache;                     // §11.3; omit for no caching
  readonly signal?: AbortSignal;
}
export interface LintResult {
  readonly findings: readonly Finding[];      // sorted: path, from, rule id
  readonly stats: Stats;                      // per-rule time, ops, cache hits
}

// ── fix ───────────────────────────────────────────────────────────────────────
export function fix(rules: Ruleset, source: Source, opts?: FixOptions): FixResult;

export interface FixOptions {
  readonly safety?: Safety;                   // highest grade to apply; default 'safe'
  readonly only?: readonly string[];          // rule ids
  readonly maxPasses?: number;                // default 10
  readonly dryRun?: boolean;
}
export interface FixResult {
  readonly text: string;
  readonly applied: readonly AppliedFix[];    // rule, finding span, edits, pass number
  readonly skipped: readonly SkippedFix[];    // with a reason code (§7.4)
  readonly passes: number;
  readonly remaining: readonly Finding[];     // what is left after the last pass
}

// ── author helpers ────────────────────────────────────────────────────────────
export function defineRule(rule: CodeRule): CodeRule;           // identity; gives types
export function defineProjectRule(rule: ProjectRule): ProjectRule;
export function defineLanguage(lang: Language): Language;
export function defineEngine(engine: FixEngine): FixEngine;

// ── errors ────────────────────────────────────────────────────────────────────
export class RulesetError extends Error { readonly problems: readonly Problem[] }  // branded, like Segno's
```

`lint` is synchronous because a file-at-a-time lint has no I/O. `lintProject` is async because a project rule asks the
host for other files. The Node host runs both inside workers (§11.4).

The `Project` a host passes in is three functions. That keeps the core free of `fs`:

```ts
export interface Project {
  files(glob: string): AsyncIterable<string>;   // paths under the project root
  read(path: string): Promise<Source>;
  hash?(path: string): Promise<string>;         // a content hash, for caching without reading
}
```

## 5. Language plugins

### 5.1 The interface

```ts
export interface Language<Tree = Node> {
  readonly id: string;                          // 'lattice-deck', 'css', 'json'
  readonly kinds: readonly string[];            // every kind a selector may name
  readonly comment?: { line?: string; block?: [string, string] };   // for suppressions (§9.2)
  parse(source: Source): ParseOutput<Tree>;
  root?(tree: Tree): Node;                      // when Tree is not Node already (a flat tree, a foreign AST)
  inert?(tree: Tree, source: Source): readonly Span[];
  facts?: Readonly<Record<string, (tree: Tree, source: Source) => unknown>>;
  locate?(tree: Tree, span: Span): Readonly<Record<string, unknown>>;   // extra location fields, e.g. { slide: 3 }
}

export interface ParseOutput<Tree> {
  readonly tree: Tree;
  readonly errors: readonly { span: Span; message: string }[];   // reported as squadra/parse-error findings
}
```

- **One node shape.** Selectors and walkers work on `{ kind, from, to, kids, attrs? }` whatever produced it. Segno
  already produces exactly that (`docs/src/lib/segno/grammar.ts`, `interface Node`). A plugin around another parser maps
  that parser's tree into this shape. It maps once, at parse time, so the cost is paid once per file.
- **Text comes from the span.** A node carries no copy of its text. A rule that needs it reads `source.text.slice(from,
  to)`, and the selector predicate `[text=…]` does the same.
- **Inert is the language's job.** Today every deck rule masks code fences and hidden comments itself
  (`stripFencedCode`, `withoutCodeBlocks`, `withoutCodeCommentMarkers`). In Squadra the language marks those ranges once.
  The driver does not dispatch nodes inside them, and a rule that must look inside one says so with `"inert": "include"`.
- **Facts are memoized per parse.** `deck.family` is computed the first time a rule asks for it and reused by every
  other rule on that file.
- **`locate` keeps domain locations.** Lattice's Studio rail shows findings by slide, not by offset. The deck language's
  `locate` adds `{ slide }`, so nothing downstream loses what `{ slide, line }` findings give it today.

### 5.2 Parse errors

A language that cannot parse a file still returns a tree (the part it read) and a list of errors. The driver reports each
error as a `squadra/parse-error` finding and still runs rules over the partial tree, because a deck with one broken
table still deserves its other findings. A language that cannot produce any tree returns an empty root. Rules then see
nothing, and the parse error is the only finding.

### 5.3 Segno as a language: `fromSegno`

Any Segno grammar becomes a Squadra language in one call:

```ts
import { compile } from '@laticent/segno';
import { fromSegno } from '@laticent/squadra/segno';

const css = fromSegno({
  id: 'css',
  grammar: compile(cssSpec),                 // or the generated parser (Segno `generate`)
  inert: ['comment', 'string'],              // kinds that are inert ranges
  comment: { block: ['/*', '*/'] },
  refine: (root, source) => root,            // optional: a structure layer on top (§5.4)
});
```

- **Why Segno.** A Segno grammar only compiles if it parses in time proportional to its input
  (`docs/src/lib/segno/README.md`). A language built on it inherits that bound, so hostile input cannot make the parse
  phase slow. This is the parse-time half of Squadra's work-budget guarantee (§8).
- **The flat tree.** A generated Segno parser writes its tree into one reused `Int32Array` (`flat.ts`, `FlatTree`).
  `fromSegno` walks that buffer directly, without building `Node` objects, when the grammar ships generated. `toNodes()`
  builds objects only for the nodes a rule actually receives.
- **Kinds come from the grammar.** `fromSegno` reads the grammar's node kinds (Segno's `kindsOf`) and publishes them as
  the language's `kinds`, so a selector naming a kind the grammar never produces is refused at compile time (§8).

### 5.4 The structure layer

Segno's existing Markdown, CSS and HTML grammars are tokenizers. `tools/parser-bakeoff/languages-grammars.mjs` says so:
"no element tree, no rule-versus-declaration split, no CommonMark block pass — those take code on top". A language
plugin adds that code as `refine(root, source)`. It takes the token tree and returns a richer tree with nesting and
`attrs`. The refine step is part of the language, not of any rule, so it runs once per file.

### 5.5 Lattice's deck language: `lattice-deck`

This lives in the Lattice repo (`lib/authoring/squadra/deck-language.js`), not in the library. It is the first real
consumer of `fromSegno`.

| Layer | Built from | Produces |
|---|---|---|
| Tokens | Segno's Markdown grammar, promoted from `tools/parser-bakeoff/languages-grammars.mjs` into `lib/` | `heading`, `para`, `item`, `olist`, `quote`, `table`, `fence`, `code`, `rule`, `indent` |
| Slides | `separatorLines` from `lib/authoring/slide-split.js`, derived from the engine's own parser (`lib/core/slide-boundaries.mjs`) | `deck` → `front-matter`, `slide` nodes; `slide` carries `attrs.index` |
| Front matter | `lib/core/front-matter-key.js` | `fm-key` with `attrs.name`, `attrs.value` |
| Directives | `scanMetaSource` (`lib/core/meta-record.mjs`), the shared reader `lint-core.js` already imports | `directive` (`_class`, `say`, `track`…) with `attrs.name`, `attrs.tokens` |
| Inline notation | Segno's notation parser | `segno-span` with the bound record in `attrs` |

Facts: `deck.family` (from `deckFamily`), `deck.size`, `deck.plugins`, `deck.mode`, `slide.classes`. Inert: fences and
non-directive HTML comments.

**The render-agreement constraint (HARD RULE #1).** The engine renders with markdown-it. If the lint parse and the render
parse disagree about where a slide or a fence starts, a rule warns about a slide the author never sees. So the structure
layer reuses the kernels the engine uses (slide separators, front-matter reader, heading split) rather than re-deriving
them. M1 adds a conformance test: over every tracked deck (examples, galleries, baseline decks), `lattice-deck`'s slide
and fence spans must equal the engine's. A mismatch fails the test.

### 5.6 Other languages

| Language | Built on | Ships in | When |
|---|---|---|---|
| `json`, `yaml` | a Segno grammar each (small) | the library, as examples and for config | M2 |
| `css` | Segno's CSS grammar + a rule/declaration refine | the library | M3 |
| `js`, `ts` | an adapter for acorn or the TypeScript API, both already used by `tools/check-ownership.js` | Lattice (the adapter carries a dependency the library must not) | M3 |
| outside-domain fixture (Dockerfile or OpenAPI YAML) | a Segno grammar | the library's tests and the learn page | M1 |

## 6. Rules

### 6.1 Where rules live: rulesets

A ruleset is a folder with a manifest and one file per rule:

```
lint/deck/                               ← one ruleset
  squadra.ruleset.json                   ← the ruleset manifest (§6.3)
  rules/
    autosplit-retired.rule.json          ← a declarative rule (§6.2)
    autosplit-retired.fixtures.md        ← its examples (§6.7)
    autosplit-retired.docs.md            ← optional long-form docs, folded into generated docs
    capacity-overflow.rule.js            ← a code rule (§6.5)
    capacity-overflow.fixtures.md
```

The `.rule.json` and `.rule.js` suffixes are how the loader finds rules. The `.fixtures.md` suffix follows Lattice's
existing `video.fixtures.md`. One rule per file keeps a rule's history in its own `git log` and keeps merge conflicts
off a shared file, the problem that moved Lattice's changelog to `changelog.d/`.

### 6.2 The rule manifest

```jsonc
{
  "$schema": "…/rule.schema.json",
  "format": 1,                         // manifest format version (§18)
  "id": "deck/unknown-corners",        // <ruleset>/<rule>; unique; never reused after retirement
  "language": "lattice-deck",
  "summary": "A `corners:` value that no theme defines.",   // one line, used in listings and docs
  "severity": "warning",               // error | warning | suggestion
  "select": "front-matter > fm-key[name=corners]",
  "where": { "value": { "notIn": "@corners" } },             // optional predicate on the selected node
  "message": "`corners: {{value}}` is not a corner style.",
  "hint": "Use one of {{list(@corners)}}.",                  // human advice, shown beside the message
  "fix": {
    "safety": "suggested",
    "replace": "value",                // which part: the node, its value, or a named child
    "with": "{{nearest(value, @corners)}}",
    "description": "Change it to `{{nearest(value, @corners)}}`."
  },
  "examples": "unknown-corners.fixtures.md",
  "docs": "unknown-corners.docs.md",   // optional
  "since": "0.1.0",
  "legacy": "unknown-corners"          // the lint-core id it replaces, for the migration diff (§15.3)
}
```

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | Manifest format version. `1` today. |
| `id` | yes | `ruleset/name`, kebab case. |
| `language` | yes | A language id in the ruleset. |
| `summary` | yes | One line. |
| `severity` | yes, unless every case sets one | `error`, `warning` or `suggestion`. |
| `select` | yes | A selector (§6.4). |
| `where` | no | A predicate (§6.4.3). |
| `cases` | no | An ordered list of `{ when, severity, message, hint, fix }`. The first case whose `when` holds decides. A case without `when` is the default. |
| `message` | yes, unless every case sets one | A template (§6.4.4). |
| `hint` | no | A template. Advice for a person. It replaces lint-core's free-text `fix:` field, which stays useful where no machine fix is possible. |
| `fix` | no | A declarative fix (§7.3), or `null` with a `noFixReason` (below). |
| `noFixReason` | when `fix` is `null` | Why the rule refuses a machine fix, such as Lattice's `bad-render-target-value`, where a guessed fix could switch an export target on. Stated, not implicit. |
| `inert` | no | `"include"` to see inside inert ranges. Default `"skip"`. |
| `examples` | yes | A fixtures file path, or an inline `{ bad, good, fixed }` object. |
| `budget` | no | Overrides the ruleset default (§8.3). |
| `docs`, `since`, `legacy`, `tags` | no | Metadata. |

### 6.3 The ruleset manifest

```jsonc
{
  "$schema": "…/ruleset.schema.json",
  "format": 1,
  "name": "deck",                       // the id prefix for every rule in it
  "version": "1.0.0",
  "summary": "Deck-authoring footguns for Lattice decks.",
  "languages": ["lattice-deck"],        // ids the host must supply
  "rules": ["rules/*.rule.json", "rules/*.rule.js"],
  "vocab": ["components", "modifiers", "corners"],   // names the host must supply
  "defaults": {
    "budget": { "ops": 200000 },
    "safety": "safe"
  },
  "order": ["deck/retired-logo-key"]    // optional: rules whose fixes go first in a pass (§7.4)
}
```

A ruleset declares the languages and vocabularies it needs, but does not contain them. The host supplies them. That is
how one ruleset runs in the CLI (vocab built from manifests on disk) and in the browser (vocab precomputed at docs-build
time), the split Lattice's `lintTextWith(source, vocab)` already makes.

### 6.4 The selector and predicate language

#### 6.4.1 Selectors

CSS-like, because people who write rules already read CSS:

```
fm-key[name=autosplit]                       a front-matter key named autosplit
front-matter > fm-key                        a key directly under front matter
slide directive[name=_class]                 a _class directive anywhere in a slide
slide:has(> heading) para:first              the first paragraph of a slide that has a heading
declaration[property=margin]:not([value=0])  any margin declaration whose value is not 0
item[text^="**"]                             a list item whose text starts with **
```

| Piece | Meaning |
|---|---|
| `kind` | A node of that kind. `*` matches any kind. |
| `[attr=v]`, `[attr!=v]` | Attribute equals / differs. `text` is the node's source text. |
| `[attr^=v]`, `[attr$=v]`, `[attr*=v]` | Starts with, ends with, contains. |
| `[attr~=v]` | A whitespace-separated word list contains `v`. |
| `[attr in @vocab]`, `[attr notIn @vocab]` | Membership in an injected vocabulary. |
| `a b`, `a > b`, `a + b`, `a ~ b` | Descendant, child, next sibling, later sibling. |
| `:has(sel)`, `:not(sel)` | Has a matching descendant (or child, with `> sel`); does not match. |
| `:first`, `:last`, `:nth(n)` | Position among siblings of the same kind. |

There are **no regular expressions** in declarative rules. A regex can backtrack exponentially, and declarative rulesets
are meant to be safe to load from anywhere (§16). Text tests are the literal operators above.

#### 6.4.2 How selectors run

The selector grammar is written in Segno, so a selector parses in linear time and a malformed one is refused with a
position. Compiled selectors are matched right to left, as browsers match CSS: the driver indexes candidate nodes by
the rightmost kind, then checks ancestors. `:has()` results are memoized per node per selector.

The cost target is linear in nodes × selector length. That is a design constraint for M1 to prove with the benchmark
(§11.6), not a property proved here.

#### 6.4.3 Predicates (`where`, `when`)

A predicate is a JSON object over the selected node's attributes, its text and the file's facts:

```jsonc
{ "value": { "in": ["off", "false", "no"] } }                     // an attribute in a literal list
{ "value": { "notIn": "@corners" } }                              // not in a vocabulary
{ "text": { "startsWith": "**", "endsWith": "**" } }
{ "fact": { "deck.family": { "not": "wide" } } }                  // a fact about the file
{ "count": { "of": "> item", "gt": 7 } }                          // how many children match
{ "all": [ … ], "any": [ … ], "not": { … } }                      // combine
```

`count` covers a share of the rules the census calls computed: "more than N items", "a slide with no heading". That is
why the declarative share may end up above the census's 56%. The census is the baseline to measure that against.

#### 6.4.4 Templates

Messages, hints and fix text are templates. `{{name}}` reads an attribute of the selected node (`{{value}}`,
`{{text}}`, `{{name}}`). A small fixed set of pure functions is available:

| Function | Returns |
|---|---|
| `nearest(x, @vocab)` | The closest vocabulary entry by bounded edit distance, or nothing. This is lint-core's `nearestRegion` / `editDistance`, moved into the library. |
| `list(@vocab)` | The vocabulary as `` `a`, `b` or `c` ``. |
| `lower(x)`, `upper(x)`, `trim(x)` | Case and space. |
| `strip(x, prefix)` | `x` without a leading `prefix`. |

A template is parsed when the rule compiles. An unknown name or function is a refusal. A fix whose template yields
nothing (no near match) is skipped for that finding and recorded as `no-candidate`, which is what lint-core's
`withTokenSuggestion` does today.

### 6.5 Code rules

When a rule needs more than a selector and a predicate, it is a function. The census says this is 44% of deck rules
today.

```js
// rules/capacity-overflow.rule.js
import { defineRule } from '@laticent/squadra';

export default defineRule({
  id: 'deck/capacity-overflow',
  language: 'lattice-deck',
  severity: 'warning',
  summary: 'A slide holds more elements than its layout can show.',
  reads: { facts: ['slide.capacity'], vocab: ['capacity'] },   // declared, so caching is exact (§11.3)
  budget: { ops: 50000 },
  examples: './capacity-overflow.fixtures.md',
  visit: {
    slide(node, ctx) {
      const cap = ctx.fact('slide.capacity', node);
      if (!cap) return;
      const items = ctx.select(node, '> item, > olist');
      if (items.length <= cap.hard) return;
      ctx.report({
        span: items[cap.hard],                          // point at the first item past the limit
        message: `This slide shows ${cap.hard} items; it has ${items.length}.`,
        hint: 'Split the slide, or use a denser layout.',
      });
    },
  },
});
```

- **`visit`** maps selectors to handlers. The driver merges every rule's `visit` keys into one dispatch table and walks
  each tree once (§11.2). A rule never walks the tree itself.
- **`check(root, ctx)`** is the alternative for a rule that needs the whole file at once. It costs one call per file.
- **`ctx`** is the only way out: `ctx.text(span)`, `ctx.select(node, sel)`, `ctx.fact(name, node?)`,
  `ctx.vocab(name)`, `ctx.report(finding)`. Each call counts against the rule's budget (§8.3).
- **`reads`** declares the facts and vocabularies the rule uses. The cache key includes exactly those (§11.3). A rule
  that reads one it did not declare gets an error from `ctx` in development and a `squadra/undeclared-read` finding in
  production. Without that, a stale cache would hide findings.

### 6.6 Project rules: `collect` and `decide`

The census says 75 of the 104 ownership checks read other files. A project rule splits that work into a per-file part
and a cross-file part:

```js
// tools/rules/repo/unique-selectors.rule.js — "no top-level selector defined by two components"
export default defineProjectRule({
  id: 'repo/unique-selectors',
  scope: 'lib/components/**/*.styles.css',
  language: 'css',
  severity: 'error',
  summary: 'Two components define the same top-level selector; the later one silently wins.',
  examples: './unique-selectors.fixtures.md',   // fixtures for a project rule hold several files (§6.7)

  // Runs per file, in parallel, cached by the file's hash. Returns small, serializable data.
  collect(root, ctx) {
    return ctx.select(root, 'rule > selector').map((n) => ({ selector: ctx.text(n), span: n }));
  },

  // Runs once over every file's collected data. Cheap: it never parses.
  decide(byFile, ctx) {
    const seen = new Map();
    for (const [path, items] of byFile) {
      for (const { selector, span } of items) {
        const first = seen.get(selector);
        if (first) ctx.report({ path, span, message: `\`${selector}\` is also defined in ${first}.` });
        else seen.set(selector, path);
      }
    }
  },
});
```

- **Why the split.** `collect` output is cached per file. Change one CSS file and only that file is re-collected;
  `decide` re-runs over cached data. Today `tools/check-ownership.js` re-reads and re-parses every file on every run
  (about 120 `readFileSync` calls, 21.8 s in one run on 2026-10-26).
- **`collect` output must be serializable** (plain JSON plus spans), because it is cached on disk and moved between
  workers. The compiler checks this on the rule's own fixtures.
- **Allowlist checks are waivers, not rules.** The 35 `SANCTIONED_*` lists become waiver entries (§9), and the stale-entry
  logic each list re-implements becomes one built-in check.

### 6.7 Fixtures files

A fixtures file is Markdown. Each fence's info string is `<language-hint> <role> [name]`:

| Role | Meaning |
|---|---|
| `bad` | Must produce at least one finding from this rule. `bad x3` means exactly three. |
| `fixed` | The result of applying the rule's fixes to the `bad` fence just before it. Required when the rule has a fix. |
| `good` | Must produce no finding from this rule. |
| `file=<path>` | For project rules: groups fences into one multi-file case. A blank line plus `---case---` separates cases. |

Use a fence longer than any fence inside the example (```` ```` ```` for a deck that contains ```` ``` ````), as
CommonMark allows. The file is otherwise free prose: write the explanation of the rule around its examples, and the
generated docs render it.

Small rules may put examples inline instead:

```json
"examples": { "bad": ["autosplit: off"], "good": ["size: story"], "fixed": [""] }
```

## 7. The fix engine: Rettifica

**Rettifica** (Italian: rectification, and in machining the grinding pass that brings a part to tolerance after it has
been measured). The square, *squadra*, measures; *rettifica* corrects. The name is a proposal and is listed in §21.

### 7.1 The model

Every fix, from every engine, ends as a list of edits against the current text. One driver then checks, applies and
verifies those edits. So the safety properties (no overlap, atomic fixes, idempotence, the file still parses) are
enforced in one place whatever produced the fix. An engine only decides what the edits are.

```
finding.fixes[]  ──engine.lower()──▶  Edit[] per fix  ──Rettifica.plan()──▶  non-conflicting set
      ▲                                                                              │
      │                                                     Rettifica.apply() ◀──────┘
      └──── re-lint ◀── reparse + verify ◀── new text
```

### 7.2 The engine interface

```ts
export interface FixEngine<Payload = unknown> {
  readonly id: string;                         // 'edits', 'lattice-line', 'biome'
  readonly exclusive?: boolean;                // rewrites the whole file: runs in a pass of its own
  lower(source: Source, fix: Fix<Payload>, ctx: LowerContext): readonly Edit[] | null;
}

export interface Fix<Payload = unknown> {
  readonly engine: string;
  readonly safety: Safety;                     // 'safe' | 'suggested' | 'unsafe'
  readonly description: string;
  readonly payload: Payload;
}

export interface LowerContext {
  readonly tree: Node;                         // the current parse
  readonly finding: Finding;
  text(span: Span): string;
}
```

`lower` returns `null` when the fix no longer applies to the current text, for example because an earlier fix in the
same run already removed the line. The driver records that as `stale` and moves on.

**Shipped engines:**

| Engine | Where | Payload | Lowers to |
|---|---|---|---|
| `edits` | Rettifica, always present | `{ edits: Edit[] }`, or the declarative ops of §7.3 | itself |
| `lattice-line` | the Lattice repo, during migration only | today's finding fields: `line`, `slide`, `chunkLine`, `replace`, `replaceLine`, `autofixable` | one edit replacing the located line, found by the chunk walk `applyFix` uses today |
| `whole-file` (example) | the library's docs | a function from text to text, such as an external formatter | one edit over the whole file; `exclusive: true` |

**Lattice's current fixers are one implementation.** `lattice-line` wraps the logic in `applyFix` and `fixReplacement`
(`lib/authoring/lint-core.js`) behind `lower`. Every rule that has not migrated keeps its fix behavior exactly, and gains
the driver's checks: overlap detection, the passes cap, reparse. When the last legacy rule migrates, `lattice-line` is
deleted.

### 7.3 Declarative fix operations

The `fix` block of a rule manifest lowers through the `edits` engine:

| Op | Example | Edits |
|---|---|---|
| `delete` | `"delete": "node"` or `"line"` | Remove the node, or the whole line holding it, including its line ending |
| `replace` + `with` | `"replace": "value", "with": "{{nearest(value, @corners)}}"` | Replace the node, its value, or a named child, with the template's text |
| `insertBefore`, `insertAfter` | `"insertAfter": "node", "text": "\n---"` | Insert at the node's start or end |
| `wrap` | `"wrap": "node", "before": "**", "after": "**"` | Two insertions, atomic |
| `rename` | `"rename": "name", "to": "say"` | Replace an attribute's span (the key, not the whole line) |
| `edits` | `[{ "replace": …, "with": … }, { "delete": … }]` | Several ops in one atomic fix |

A fix's edits apply together or not at all. That is how ordering dependencies stop being implicit. Today
`retired-logo-key` only works because one pass rewrites the merge line before a later pass deletes the old lines
(`lib/authoring/lint-core.js:8915`). In Squadra it is one fix with both edits.

### 7.4 The driver

For one source, each pass:

1. **Lint** the current text and collect fixes at or below the requested safety grade.
2. **Lower** each fix through its engine. A `null` result is recorded as `stale`.
3. **Plan** with Rettifica:
   - Order fixes by the ruleset's `order` list, then severity (errors first), then position, then rule id.
     Deterministic, so the same input always yields the same output.
   - Take each fix in order. Accept it if none of its edits overlap an accepted edit. Two insertions at the same offset
     from different fixes also conflict, because their order would be a guess.
   - A rejected fix is recorded as `conflict` and retried next pass, against the new text.
   - An `exclusive` fix runs only in a pass with nothing else accepted.
4. **Apply** all accepted edits in one left-to-right build of the new string: O(text length + edits).
5. **Verify:**
   - Reparse. If the new text has a parse error the old text did not, find the culprit by re-applying the pass's fixes
     in halves (at most log₂ of the fix count extra applies), revert that fix, and record `broke-parse`.
   - If an applied fix's own finding is still present at its mapped position, record `did-not-resolve`. The fix stays
     applied, but the rule is reported as defective.
6. **Stop** when a pass applies nothing, when the text hash repeats an earlier pass (`cycle`), or at `maxPasses`.

`lattice-line`'s current loop applies one fix per pass with a 500-pass cap. The driver applies every non-conflicting fix
per pass. On a deck with ten fixable findings, that is one or two passes instead of ten.

**Skip reasons**, all reported in `FixResult.skipped`: `safety` (above the requested grade), `stale`, `conflict` (never
placed by the last pass), `no-candidate`, `broke-parse`, `cycle`, `engine-missing`.

### 7.5 Safety grades

| Grade | Applied by | Use for |
|---|---|---|
| `safe` | `fix()` and `--fix` by default | Changes that cannot change meaning: deleting a retired key, a pure rename with one answer |
| `suggested` | `--fix=suggested`, or one click in an editor | A likely answer that a person should glance at: a did-you-mean |
| `unsafe` | `--fix=unsafe --only <rule>`, never in bulk | Changes that may alter what renders |

A rule that must never be fixed by machine says `"fix": null` with a `noFixReason`.

### 7.6 Rettifica's own API

```ts
export interface Edit { readonly from: number; readonly to: number; readonly text: string }
export interface EditGroup { readonly id: string; readonly edits: readonly Edit[] }    // one atomic fix

export function plan(groups: readonly EditGroup[], opts?: { order?: (a, b) => number }): Plan;
export function apply(text: string, plan: Plan): string;
export function mapOffset(plan: Plan, offset: number, bias?: 'before' | 'after'): number;  // old → new position
export function diff(before: string, after: string, opts?: { context?: number }): string; // unified diff
export class EditError extends Error { readonly code: 'out-of-range' | 'inverted' | 'overlap-in-group' }
```

It has nothing to do with linting, and it is documented as a library of its own: "apply many text edits at once, safely".

## 8. The guarantee: what Squadra refuses

Segno refuses a grammar it cannot prove linear. Squadra refuses a rule it cannot show works. `compileRuleset` collects
every problem in every rule and throws one `RulesetError` listing them all, each with the rule id and a code:

| Code | Refused when |
|---|---|
| `no-examples` | A rule has no `bad` example, or no `good` example. |
| `bad-did-not-fire` | A `bad` example produced no finding from the rule (or the wrong count, for `bad xN`). |
| `good-fired` | A `good` example produced a finding from the rule. |
| `fix-mismatch` | Applying the rule's fixes to a `bad` example did not give its `fixed` example. |
| `fix-not-idempotent` | Fixing the `fixed` example again changed it. |
| `fix-broke-parse` | The fixed example does not parse. |
| `fix-missing-fixed` | The rule has a fix but a `bad` example has no `fixed` after it. |
| `unknown-kind` | A selector names a kind the language does not publish. |
| `bad-selector`, `bad-template`, `bad-predicate` | Syntax errors, with the position. |
| `unknown-vocab`, `unknown-fact`, `unknown-engine`, `unknown-language` | A reference to something the ruleset does not supply. |
| `duplicate-id` | Two rules share an id. |
| `no-budget` | A code rule declares no budget and the ruleset sets no default. |
| `unserializable-collect` | A project rule's `collect` returned something that is not plain data, on its own fixtures. |

`checkRuleset` returns the same list without throwing, for editors and for `squadra test`.

### 8.1 What this replaces

Lattice proves Biome still has teeth from the outside: `tools/check-lint-coverage.js` writes a violating file into
every directory and checks that Biome flags it. Lattice's own rules have no equivalent. With Squadra, every rule proves
it fires and fixes before it can load, on every compile.

### 8.2 What it costs

Each compile runs every rule on its fixtures. For Lattice's ~260 rules and checks, with a few small examples each, that
is expected to cost tens of milliseconds. This is an estimate. M1 measures it. If it is too slow for the browser,
`compileRuleset` accepts a precomputed `verified` stamp (a hash of each rule plus its fixtures) and skips the check for
rules whose hash matches. The build produces that stamp, the same way the browser gets a precomputed vocabulary today.

### 8.3 Work budgets

- **Parse:** a language built on Segno is linear by construction (§5.3). Other parsers are the plugin author's
  responsibility, and the docs say so.
- **Declarative rules:** a selector and predicate do bounded work per node (§6.4.2). Their budget is derived, not
  declared.
- **Code rules:** every `ctx` call counts as an op. Past the budget, the driver stops the rule on that file and reports
  `squadra/budget-exceeded` naming the rule. It does not throw, and other rules still run.
- **The honest limit:** an op counter cannot stop a code rule that loops without calling `ctx`. JavaScript has no
  preemption inside one thread. The Node host runs rules in workers and terminates a worker past a wall-clock limit
  (default 10 s per file), reporting `squadra/timeout`. In the browser there is no such backstop. That is why rules from
  a source you do not trust should be declarative (§16).

## 9. Waivers, suppressions, ratchets and baselines

### 9.1 Waivers

A waiver is a recorded exception: this rule does not apply to this target, for this reason.

```jsonc
// squadra.waivers.json
{
  "$schema": "…/waivers.schema.json",
  "format": 1,
  "waivers": [
    {
      "rule": "repo/no-margin",
      "target": "lib/components/inventory/checklist/checklist.styles.css",
      "match": "margin-inline-start:auto",       // optional: the finding's text must contain this
      "reason": "Flex push; no padding or gap equivalent. HARD RULE #20.",
      "since": "2026-06-27",
      "expires": null                        // or a date; past it, the waiver stops applying and is reported
    }
  ]
}
```

- A waiver suppresses findings that match its rule, target (path or glob) and optional `match`.
- **A waiver that suppresses nothing fails** as `squadra/stale-waiver`, an error. This is built in, and it replaces the
  stale-entry logic that the census found re-implemented in 33 checks (covering the 35 `SANCTIONED_*` lists), and missing from 8 other allowlists and constants.
- `reason` is required and must be non-empty. The tool cannot judge a reason, as `biome.jsonc` notes about its own
  exclusions. It can require one, and pull requests review it.
- An expired waiver stops suppressing and is reported as `squadra/expired-waiver`.

### 9.2 Inline suppressions

```md
<!-- squadra-ignore deck/typed-shape-glyph -- this deck is about the glyph -->
```
```css
/* squadra-ignore repo/no-margin -- flex push; see HARD RULE #20 */
```

- The syntax uses the language's own comment form (§5.1). A suppression covers the next node; `squadra-ignore-file` covers
  the whole file.
- `--` and a reason are required. A suppression without one is itself reported as `squadra/suppression-without-reason`.
- A suppression that suppresses nothing is reported as `squadra/stale-suppression`.

### 9.3 Ratchets

A ratchet allows a known number of findings and fails if the number grows:

```jsonc
{ "rule": "deck/typed-shape-glyph", "target": "examples/**", "budget": 12, "reason": "Pre-dates HARD RULE #29." }
```

Above the budget is an error. Below it is reported as `squadra/ratchet-down` with the new number, so the budget only
moves down. This is the shape of Lattice's `TYPED_GLYPH_BUDGET`, made generic.

### 9.4 Baselines

Adopting Squadra on an existing codebase: `squadra baseline` writes a ratchet entry per rule and target for today's
findings, each with reason `baseline <date>`. New findings fail, and existing ones can only go down.

## 10. Configuration

One file at the project root, read by the Node host. The core never reads it; the host turns it into a ruleset input.

```jsonc
// squadra.config.json
{
  "$schema": "…/config.schema.json",
  "format": 1,
  "rulesets": ["lint/deck", "tools/rules/repo"],
  "languages": {
    "lattice-deck": ["examples/**/*.md", "**/*.gallery.md", "test/integration/baseline-decks/*.md"],
    "css": ["lib/**/*.css", "themes/**/*.css"]
  },
  "ignore": [
    { "glob": "dist/**", "class": "build-output" },
    { "glob": "lib/plugins/*/vendor/**", "class": "vendor" }
  ],
  "rules": { "deck/unknown-class": "error", "deck/collage-hint": "off" },
  "overrides": [
    { "include": ["test/**"], "rules": { "deck/capacity-overflow": "off" } }
  ],
  "waivers": "squadra.waivers.json",
  "fix": { "safety": "safe", "maxPasses": 10 },
  "cache": ".cache/squadra"
}
```

- **Every `ignore` entry carries a class**, the convention `biome.jsonc` adopted after 29 exclusions carried no reason.
  The classes are the same: `dependency`, `build-output`, `transient`, `vendor`, `not-code`, `generated`, `unparseable`.
- **`squadra coverage`** lists tracked files that no language claims and files that are claimed but ignored. It does
  for Squadra's languages what `tools/check-lint-coverage.js` does for Biome.
- Severity overrides can turn a rule off or change its severity. They cannot turn on a rule the ruleset does not have.

## 11. How it runs, and why it is fast

### 11.1 The pipeline

```
sources ─▶ parse once per (file, language) ─▶ mark inert ranges ─▶ one walk, dispatching to every rule
        ─▶ project collect (per file) ─▶ decide (once) ─▶ waivers/suppressions/ratchets ─▶ sort ─▶ report
```

### 11.2 One walk

At compile time the driver merges every rule's selectors into a table keyed by node kind. Walking a tree visits each
node once and calls only the handlers whose rightmost kind matches. Adding a rule adds table entries, not a walk.
Today's 156 deck rules each scan the source themselves.

### 11.3 Caching

| Cache entry | Key | Holds |
|---|---|---|
| Parse | content hash + language id + language version | the tree (in memory only) |
| File findings | content hash + rule hash + hashes of the facts and vocabularies the rule declared it reads | that rule's findings on that file |
| Collect | content hash + project-rule hash | that rule's `collect` output for that file |
| Ruleset | rule-file hashes + fixture hashes | the `verified` stamp (§8.2) |

A rule's hash covers its manifest or source and its fixtures, so editing a rule invalidates only that rule's entries.
The host supplies the store through `{ get(key), set(key, value) }`. The Node host keeps it on disk; the Studio keeps it
in memory. With no store, nothing is cached and results are identical.

### 11.4 Workers

The Node host shards files across a worker pool sized to the CPU count, largest files first. A worker loads the compiled
ruleset once. Project `decide` runs on the main thread after every `collect` returns.

### 11.5 Determinism

Findings are sorted by path, then `from`, then rule id. Fix plans are ordered as §7.4 says. The same inputs give
byte-identical output in any worker count and any cache state. A test runs the corpus at 1 and N workers, cold and warm,
and compares bytes.

### 11.6 Measuring it (HARD RULE #19)

Squadra ships a benchmark, run with `squadra bench` and in Lattice through `npm run bench`. M1 records the baseline, and
targets are set from that measurement, not from this document. The numbers to beat, single runs on 2026-10-26:

| Today | Wall clock |
|---|---|
| `tools/check-ownership.js` | 21.8 s |
| `npx biome check` | 7.2 s |
| `npm run lint:deck:all` | 3.9 s |

The scenarios: cold full repo; warm full repo with no changes (should be close to a cache read); one changed deck; one
changed CSS file with project rules; the fix driver on a deck with 50 fixable findings; and a hostile input per language
(a 1 MB file of one repeated token).

## 12. Output

### 12.1 The finding

```jsonc
{
  "rule": "deck/autosplit-retired",
  "severity": "error",
  "path": "examples/pricing.md",
  "span": { "from": 12, "to": 27 },
  "start": { "line": 3, "column": 1 },          // 1-based, computed once per file from a line index
  "end": { "line": 3, "column": 16 },
  "where": { "slide": 1 },                      // from the language's locate()
  "message": "`autosplit: off` no longer works; slides that don't fit still split into more pages.",
  "hint": "To keep one slide whole, add `<!-- stress-slide -->` to that slide.",
  "fixes": [
    {
      "engine": "edits",
      "safety": "safe",
      "description": "Delete the line.",
      "edits": [{ "from": 12, "to": 28, "text": "" }]
    }
  ],
  "data": {}                                    // rule-specific, for tools
}
```

The finding format is versioned with the package (§18) and published as a JSON Schema.

### 12.2 Reporters

| Reporter | For |
|---|---|
| `text` | People: grouped by file, with the source line and a caret |
| `json` | Tools: `{ format, findings, stats }` |
| `sarif` | SARIF 2.1.0: GitHub code scanning and other CI viewers |
| `github` | `::error file=…,line=…::` lines for workflow annotations |
| `lsp` | Diagnostics plus code actions, one per fix, for an editor integration |

### 12.3 Exit codes

| Code | Meaning |
|---|---|
| 0 | No finding at or above `--fail-on` (default `error`) |
| 1 | At least one such finding |
| 2 | Usage or configuration error |
| 3 | A `RulesetError`: a rule was refused |
| 4 | An internal error |

## 13. The command line

```
squadra check [paths…]        lint; --format text|json|sarif|github; --changed (vs git HEAD); --fail-on <severity>
squadra fix [paths…]          apply fixes; --safety safe|suggested|unsafe; --only <rule>; --dry-run (prints the diff)
squadra test [rules…]         compile the rulesets and run every rule on its fixtures; exit 3 on any refusal
squadra rules [--json]        list every rule: id, severity, summary, fixable, language
squadra explain <rule>        print the rule's summary, docs and examples
squadra baseline              write ratchets for today's findings (§9.4)
squadra coverage              files no language claims, and files claimed but ignored (§10)
squadra bench                 the benchmark scenarios (§11.6)
```

## 14. Usage patterns

1. **Lint a string in a browser.** The Studio lints the deck in the editor: `lint(rules, [{ path, text, language }])`,
   with an in-memory cache, on each debounced edit. "Fix all" is `fix(rules, source, { safety: 'safe' })`.
2. **An editor.** An LSP integration maps findings to diagnostics and each fix to a code action. `suggested` fixes appear
   as actions and are never applied on save.
3. **CI.** `squadra check --format sarif` uploads to code scanning; `--format github` annotates the diff.
4. **A git hook.** `squadra check --changed`. Per-file rules run on changed files only. Project rules re-collect changed
   files and re-decide.
5. **Adopting it on an old codebase.** `squadra baseline`, then ratchet down.
6. **Writing a rule.** Start declarative. Write the fixtures first, then the selector. `squadra test <rule>` until it
   compiles. Move to a code rule only when a predicate cannot say it.
7. **Migrating another linter.** Wrap each existing detector as a code rule whose fixes use a custom engine that speaks
   the old fix format, as `lattice-line` does (§7.2). Move rules to declarative one at a time, diffing against the old
   output (§15.3).
8. **A different domain.** Supply a language (a Segno grammar is the short path) and a ruleset. The learn page's worked
   example is a ruleset for a non-Lattice format (§5.6), so this path is exercised from M1.

## 15. How Lattice adopts it

### 15.1 What maps to what

| Lattice today | In Squadra |
|---|---|
| A detector function in `lib/authoring/lint-core.js` | A declarative rule, or a code rule (§6) |
| `{ slide, rule, severity, classToken, line, message, fix }` | A finding with a span, `where.slide`, `hint` (§12.1) |
| The `fix:` advice string (214 of them) | `hint` |
| `autofixable` / `replace` / `replaceLine` / the `fixReplacement` switch | A declarative fix (§7.3), or the `lattice-line` engine until the rule moves |
| `applyFix` / `applyAllFixes` (one fix per pass, 500-pass cap) | `fix()` (§7.4) |
| Vocabulary built from manifests in `lib/authoring/lint.js` | `vocab` passed to `compileRuleset` |
| The Studio's Architect panel and "Fix all" | The core plus `lattice-deck` plus Rettifica, bundled for the browser |
| A `checkX(…, errors)` function in `tools/check-ownership.js` | A project rule (§6.6), or a per-file rule when its core detector is declarative |
| 35 `SANCTIONED_*` allowlists | Entries in `squadra.waivers.json` |
| `TYPED_GLYPH_BUDGET` and other budget tables | Ratchet entries (§9.3) |
| `tools/check-lint-coverage.js` (Biome) | Unchanged. `squadra coverage` covers Squadra's own languages |
| Biome | Unchanged |

### 15.2 Where Lattice's rules live

- **Deck rules:** `lib/authoring/rules/` as the `deck` ruleset. They must stay browser-safe, so this folder keeps
  lint-core's no-`fs` rule.
- **Repo checks:** `tools/rules/repo/` as the `repo` ruleset. Node only.
- **The deck language and the `lattice-line` engine:** `lib/authoring/squadra/`.

### 15.3 The migration is a strangler, and a diff keeps it honest

During migration both systems run. For every rule with a `legacy` id, a test runs the lint-core rule and the Squadra rule
over every tracked deck and requires:

- the same findings, matched on rule, slide and line;
- the same fixed text, byte for byte.

Each difference is either fixed or written down as an intended improvement in the PR that migrates the rule. When a
rule's diff is clean, its lint-core detector is deleted in the same PR. When the last detector is gone, so are
`lattice-line` and the diff test.

### 15.4 What does not change without the owner

These need the owner's explicit sign-off, per CLAUDE.md's second filter:

- **The CI and hook contract.** Squadra replaces commands that already run (`lint:deck`, `lint:deck:all`,
  `check:ownership` inside `build:check`). Any new job, step or hook is put to the owner first.
- **HARD RULE #7's wording.** The proposal is in the parent note, §9.
- **The Studio's route budget.** The browser bundle's size against `docs/route-budget.json` is measured in M1.
  Exceeding it is put to the owner.

## 16. Security model

- **Declarative rulesets are data.** No `eval`, no regex, selectors parsed by an LL(1) grammar, templates limited to a
  fixed set of pure functions, and bounded work per node. A declarative ruleset from an untrusted source can produce
  wrong findings. It cannot run code, read files, or hang the process. The docs say this plainly, because it is the
  reason to prefer declarative rules.
- **Code rules are code.** Loading one is the same trust decision as installing a dependency. The docs say so.
- **The core never writes.** `fix()` returns text. The Node host writes files, refuses paths outside the project root,
  and writes atomically (temp file plus rename).
- **Fixes never touch inert ranges** unless the rule opted into them, so a fix cannot rewrite an example inside a code
  fence by accident.

## 17. How the library is tested

| Layer | Tests |
|---|---|
| Rettifica | Property tests: random non-overlapping edit sets give the same result in any order; `plan` never accepts an overlap; `mapOffset` round-trips; `apply` on an empty plan is the identity |
| Selectors | A fuzzer feeds random selectors to the Segno-built selector parser; parse time stays linear; matching agrees with a naive reference matcher |
| Driver | Idempotence (fixing twice equals fixing once) over every fixture; determinism at 1 and N workers, cold and warm cache |
| Languages | `fromSegno` over Segno's own fuzz corpus; `lattice-deck` render-agreement test over every tracked deck (§5.5) |
| Rules | `squadra test` over every ruleset; for Lattice, the migration diff (§15.3) |
| Speed | The benchmark scenarios (§11.6), with a committed baseline |

## 18. Stability and versioning

- **0.x** until Lattice has fully migrated. A minor version may break the API, as with Segno.
- **Manifest files carry `format`**, as Lattice's plugin manifests carry `format` and `api`. A loader refuses a format
  it does not know, with a message naming the version it supports.
- **Stable first:** the finding format, the manifest formats, `lint`, `fix` and `compileRuleset`.
  **Experimental first:** project rules, the selector extensions beyond §6.4.1, and the LSP reporter.
- **Retired rule ids are never reused,** the convention Lattice applies to HARD RULE numbers.

## 19. Documentation deliverables

Squadra and Rettifica each get the set every library in the family has:

| Deliverable | Where | Contents |
|---|---|---|
| README | `docs/src/lib/squadra/README.md` | Install, what is stable, write a rule, write a language, fix engines, the guarantee, speed (with measurements), first user: Lattice, build, license. The Italian etymology under the title. |
| Learn page | `docs/src/content/catalog/libraries/squadra.md` | The catalog fields (`promise`, `intro`, `group`, `inLattice`, `useWhen`, `facts`, `reference`) and the sections the other entries use: The problem · The idea · How to use it · Where else it fits · How Lattice uses it · What it doesn't do |
| Demo page | `docs/src/pages/libraries/squadra/index.astro` | Live sections: write a rule and watch it refuse until its examples pass; fix all, with conflicting fixes shown and resolved; try to make it slow (a hostile input, timed in the browser); first user: Lattice |
| Mark | `docs/public/squadra-mark.svg` | A set-square |
| Rettifica | the same three, smaller | "Apply many edits at once, safely": the conflict rules, atomic groups, offset mapping |
| Generated rule docs | built from each ruleset | One page per rule: summary, docs, the fixtures rendered as examples, fixable or not and why |

The demo and learn pages are website changes, so each ships with `tools/screenshot.js` evidence at 1440, 820 and 390 px
(CLAUDE.md quality bar).

## 20. What Squadra does not do

- **Format code.** A formatter can be a `whole-file` fix engine. Squadra is not one.
- **Type-check.** A rule may read the TypeScript API through a language adapter. Squadra does not model types.
- **Replace Biome** for JavaScript style. Biome stays.
- **Write parsers.** Languages wrap Segno grammars or existing parsers.
- **Run untrusted code safely.** Code rules are trusted code (§16).
- **Ship an LSP server in M1.** M1 ships the `lsp` reporter format. A server comes later, if an editor integration
  needs it.

## 21. Open decisions

| # | Decision | Options | Recommendation | Default if no answer |
|---|---|---|---|---|
| 1 | The fix engine's name | **Rettifica** (rectification; the machining pass after measuring) · Ritocco (retouch) · Rammendo (mending) · Restauro (restoration) | Rettifica: it pairs with Squadra, measure then correct | Rettifica |
| 2 | Rettifica as its own package, or a module inside Squadra | own package · `@laticent/squadra/fix` | Own package: it is useful without a linter, and it has no dependencies | Own package |
| 3 | Manifest format | JSON with `$schema` · YAML | JSON: Lattice's component and plugin manifests are JSON, it needs no parser in the browser, and the schemas give editors completion | JSON |
| 4 | Selector syntax | CSS-like (§6.4) · a JSON tree pattern · ast-grep-style code patterns | CSS-like: people already read it, and it parses LL(1) | CSS-like |
| 5 | Whether a code rule's fixtures may live inline in the `.rule.js` | yes · fixtures file only | Fixtures file only: one format to load, and the examples double as docs | Fixtures file only |
