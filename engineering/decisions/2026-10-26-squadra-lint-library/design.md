# Squadra: the design (2026-10-26, revised 2026-10-28)

The design specification for Squadra, the lint library proposed in `../2026-10-26-squadra-lint-library.md`. That note
says why. This file says what: the packages, the API, the language plugins, the fix engine, the manifest files, how it
runs, and how Lattice adopts it. Nothing here is built yet. Every signature is a proposal. M1 can change a signature
when building it shows the signature is wrong, and the change lands in this file in the same PR.

Read it by section. §1 is a two-minute tour. §3 defines every term the rest uses. §4.1 defines every type. §22 records
what the adversarial review of 2026-10-26 changed.

## Contents

1. A two-minute tour
2. Packages, interfaces and implementations
3. Terms
4. The core API (4.1: every type)
5. Language plugins
6. Rules
7. The fix engine
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
22. What the adversarial review changed

## 1. A two-minute tour

A rule is a JSON file. This one is Lattice's `autosplit-retired`. Today it is about 30 lines of regex in
`findRetiredAutosplitDirective` (`lib/authoring/lint-core.js`), with advice text but no machine fix. The manifest below
keeps its four messages and its case-insensitive match, and adds the fix:

```json
{
  "$schema": "../schema/rule.schema.json",
  "format": 1,
  "id": "deck/autosplit-retired",
  "legacy": "autosplit-retired",
  "language": "lattice-deck",
  "summary": "`autosplit:` was retired; slides that don't fit split automatically.",
  "select": "front-matter > fm-key[name=autosplit i]",
  "cases": [
    {
      "when": { "all": [
        { "value": { "in": ["off", "false", "no"], "case": "insensitive" } },
        { "fact": { "deck.family": { "ne": "wide" } } }
      ] },
      "severity": "error",
      "message": "`autosplit: off` no longer works; slides that don't fit still split into more pages.",
      "hint": "To keep one slide whole, add `<!-- stress-slide -->` to that slide.",
      "fix": { "safety": "safe", "delete": "line", "description": "Delete the line." }
    },
    {
      "when": { "value": { "in": ["off", "false", "no"], "case": "insensitive" } },
      "severity": "suggestion",
      "message": "`autosplit: off` no longer does anything.",
      "fix": { "safety": "safe", "delete": "line", "description": "Delete the line." }
    },
    {
      "when": { "fact": { "deck.family": { "ne": "wide" } } },
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

Its examples sit beside it, in a Markdown file whose fences are labeled `bad`, `fixed` and `good`. `⟦` and `⟧` mark
the span a `bad` example must report:

`````md
````md bad
---
size: story
⟦autosplit: off⟧
---
# Title
````

````md fixed
---
size: story
---
# Title
````

````md bad only-key
---
⟦autosplit: off⟧
---
# Title
````

````md fixed only-key
# Title
````

````md good
---
size: story
---
# Title
````
`````

The `only-key` pair is there on purpose. When the deleted key is the only one, the fix removes the whole front-matter
block; leaving an empty `---`/`---` pair would turn the title slide into front matter (§7.3). The structure check
(§7.4 step 5) refuses any fix that changes the slide count, so a rule without that pair would still be caught.

Running it:

```ts
import { compileRuleset, lint, fix } from '@laticent/squadra';
import { latticeDeck } from '../lib/authoring/squadra/deck-language.js';   // Lattice's own plugin, by relative path
import autosplit from './rules/autosplit-retired.rule.json' with { type: 'json' };

const rules = compileRuleset({ languages: [latticeDeck], rules: [autosplit], examples: { /* loaded fixtures */ } });
// compileRuleset ran the rule on its own examples. It would have refused the rule if a bad example did not fire
// at the marked span, a good one fired, or the fix did not produce `fixed`.

const { findings } = lint(rules, [{ path: 'deck.md', text, language: 'lattice-deck' }]);
const { text: fixedText, applied } = fix(rules, { path: 'deck.md', text, language: 'lattice-deck' });
```

Everything else in this file is the detail behind those three calls.

## 2. Packages, interfaces and implementations

### 2.1 One package

Squadra is one package, `@laticent/squadra`, with an entry point per part:

| Entry | Holds | Depends on |
|---|---|---|
| `.` | The interfaces, the rule compiler and its refusals, the selector engine, the lint driver, the fix driver and its edit kernel, waivers, the reference `edits` fix engine, the reference reporters | nothing |
| `./segno` | `fromSegno()`: turns any Segno grammar into a Squadra language | `@laticent/segno` |
| `./languages/markdown` | The reference Markdown language, read from the Segno deck pipeline's document model (§5.6) | the pipeline package (`docs/src/lib/segno-markdown/`, decision `2026-10-22-segno-deck-pipeline.md` D4) |
| `./languages/css`, `./languages/json`, `./languages/yaml` | The other reference languages, built with `fromSegno` | `@laticent/segno` |
| `./node` | The reference Node host: files, globs, worker pool, disk cache, CLI | Node built-ins |
| `./testing` | `testRuleset()`, the fixture loader, assertion helpers for rule authors | nothing beyond the core |

It lives as a workspace package at `docs/src/lib/squadra/`, beside Segno and Cadenza, and follows the family's rules:

- **No DOM, no `fs` in the core.** The core runs unchanged in a browser, a worker, Node or an edge function. Only
  `./node` touches the filesystem. That is the property `lib/authoring/lint-core.js` has today ("NO `fs` and NO `require`
  of lib/components, so it bundles cleanly for the browser"), and Squadra keeps it.
- **The core has no run-time dependencies.** Its selector parser is generated by Segno at build time and committed into
  the core, the way Segno's own notation parser ships generated (`notation.generated.ts`). The language entries depend
  on Segno or on the pipeline package, sibling libraries, the way Cadenza depends on `@laticent/ltt`. A user who brings
  their own parser imports `.` only and never loads Segno.
- **Each entry is bundled on its own**, as Segno's `.`, `./read` and `./values` are, so the browser bundle carries only
  what it imports.

### 2.2 Extension points and who implements them

Squadra defines four interfaces and ships a reference implementation of each. A user can replace any of them.
Lattice uses the reference implementations where its needs are generic, and adds its own where they are not.

| Interface | What it does | Squadra's reference implementation | Lattice's own implementation |
|---|---|---|---|
| `Language` (§5) | Turns a source into a tree, marks inert ranges, supplies facts | Markdown (on the Segno deck pipeline), CSS, JSON, YAML (on Segno) | `lattice-deck`, which extends the reference Markdown with slides, directives, front matter and Segno notation; a JS/TS adapter over acorn or the TypeScript API |
| `FixEngine` (§7) | Turns a fix into text edits | `edits`: the declarative operations (delete, replace, insert, wrap, rename) | `lattice-line`: today's line-based fixers, for the migration only |
| Host (`Project` + `Cache`, §4, §11.3) | Supplies sources, stores the cache, writes results | Node: files, globs, workers, disk cache, CLI | The Studio: the editor's text, an in-memory cache |
| `Reporter` (§12.2) | Turns findings into output | text, JSON; and by M4, SARIF, GitHub annotations, LSP | The Studio's findings panel; a legacy-shape adapter for today's consumers (§15.4) |

**The reference implementations are the ones Lattice needs that are not about decks.** The census counts which
languages Lattice's rules read: deck markdown 111, YAML front matter 43, JS 37, CSS 36, JSON 22. So the reference set
is Markdown, YAML, CSS and JSON. Lattice exercises every one of them, so none ships untested. Lattice's own
implementations are the domain-specific ones, plus JS/TS, whose parser is a dependency the library should not carry.

**Lattice tests the interfaces.** `lattice-deck` extends the reference Markdown language instead of standing alone. So
the `Language` interface has to support building one language on another, or Lattice cannot use it. `lattice-line`
wraps an existing fixer rather than starting from declarative ops. So the `FixEngine` interface has to accept a fix
format it did not design. If either needs a special case in the core, the interface is wrong.

**What is not an extension point.** The fix *driver* (plan, apply, verify, §7.4) and the rule compiler's refusals (§8)
are not pluggable. They are where Squadra's guarantees live, so every engine and every language goes through them.

### 2.3 What gets built when

The owner decided on 2026-10-28 that the whole surface stays designed now, and that M1-M3 build what Lattice uses
while the generic extras land by M4:

| Built in M1-M3, because Lattice uses it | Built by M4, generic surface |
|---|---|
| Core, fix driver, `edits` engine, refusals, waivers, ratchets | The outside-domain fixture (§5.6) |
| `lattice-deck`, reference Markdown and YAML; then JSON, CSS | Inline suppressions in languages that have comments (§9.2) |
| Node host, `text` and `json` reporters, the CLI commands Lattice runs | SARIF, GitHub and LSP reporters (§12.2) |
| Code rules, project rules, the declarative *fix* operations (§7.3) | The declarative *selector* language (§6.4), unless about 15 migrated rules repeat one shape sooner, in which case it lands then |

## 3. Terms

| Term | Meaning |
|---|---|
| **Source** | One file's text plus its path and language id: `{ path, text, language }`. The host supplies it, after the ingest boundary: no BOM, LF line endings (§5.7). The core never reads a file. |
| **Span** | A range of a source as UTF-16 offsets, `{ from, to }`, half-open. The same unit Segno uses. |
| **Language** | A plugin that turns a source into a tree of nodes and says which parts are inert (§5). |
| **Node** | `{ kind, from, to, kids, attrs?, parts? }`. Segno's `Node` shape, with optional `attrs` (values) and `parts` (the span of each named part, such as a key's name and value). |
| **Kind** | A node's type name, such as `fm-key`, `slide` or `declaration`. A language publishes its kinds, and a selector may name only those. |
| **Inert range** | A span rules do not see unless they opt in: a code fence, an indented code block, a comment, a string. The language marks it once. |
| **Fact** | A value a language derives from a source or from one node of it (`deck.family`, `slide.capacity`). Rules read facts. They do not recompute them. Project-wide values are not facts; they are what `collect` returns (§6.6). |
| **Vocabulary** | Named lists passed in at compile time, such as Lattice's component and modifier names. A rule refers to one as `@components`. |
| **Rule** | A declarative manifest (§6.2) or a code rule (§6.5) that reports findings. |
| **Project rule** | A rule over many files, written as `collect` (per file) and `decide` (across files) (§6.6). |
| **Finding** | What a rule reports: rule id, severity, span, message, optional hint, optional fixes (§12.1). |
| **Fix** | One machine remedy for a finding. It holds an engine id, a safety grade, a description and the engine's payload. All of a fix's edits apply, or none do. |
| **Edit** | `{ from, to, text }`: replace that span with that text. Every fix lowers to edits. |
| **Fix engine** | A plugin that turns a fix's payload into edits against the current text (§7.2). |
| **Ruleset** | A compiled, validated set of rules plus their languages, vocabularies and engines. Everything runs against one. |
| **Waiver** | A recorded, reasoned exception to a rule for a named file, covering a counted number of findings. Stale waivers fail (§9). |
| **Ratchet** | A per-rule, per-file count budget that may only go down (§9.3). |
| **Host** | What supplies sources, writes results and holds a cache: the Node host, the Studio, an editor, a test. |
| **Strangler migration** | Replacing a system piece by piece while both run, until the old one can be deleted; named for the strangler fig, which grows around a tree until it stands alone. |

## 4. The core API

TypeScript signatures. The names are the proposal; the shapes are what M1 builds and tests. Every type used here is
defined in §4.1.

```ts
// ── compile ───────────────────────────────────────────────────────────────────
export function compileRuleset(input: RulesetInput): Ruleset;   // strict: throws RulesetError listing EVERY problem
export function checkRuleset(input: RulesetInput): Problem[];    // the same list, without throwing (like Segno's lint)

// ── lint ──────────────────────────────────────────────────────────────────────
export function lint(rules: Ruleset, sources: Iterable<Source>, opts?: LintOptions): LintResult;
export function lintProject(rules: Ruleset, project: Project, opts?: LintOptions): Promise<LintResult>;

// ── fix ───────────────────────────────────────────────────────────────────────
export function fix(rules: Ruleset, source: Source, opts?: FixOptions): FixResult;

// ── author helpers ────────────────────────────────────────────────────────────
export function defineRule(rule: CodeRule): CodeRule;           // identity; gives types
export function defineProjectRule(rule: ProjectRule): ProjectRule;
export function defineLanguage(lang: Language): Language;
export function defineEngine(engine: FixEngine): FixEngine;

// ── errors ────────────────────────────────────────────────────────────────────
export class RulesetError extends Error { readonly problems: readonly Problem[] }  // branded, like Segno's
```

- **`lint` is synchronous**, because linting text already in memory has no I/O.
- **`lintProject` is async only in its first step.** It asks the host for the files in each project rule's `scope`,
  reads them, and from then on runs the same synchronous `collect` and `decide` as everything else (§6.6). A host that
  already holds the files can pass them to `lint` instead.
- **Strict or lenient compile.** `compileRuleset` with `mode: 'strict'` (the default, used by `squadra test` and CI)
  throws on any problem. With `mode: 'lenient'` (for the Studio and editors) it drops each refused rule, keeps the rest,
  and reports every refusal as a `squadra/rule-refused` finding. One stale fixture then costs one rule, not the whole
  ruleset.

The `Project` a host passes in is three functions. That keeps the core free of `fs`:

```ts
export interface Project {
  files(glob: string): AsyncIterable<string>;   // paths under the project root, in sorted order
  read(path: string): Promise<Source>;
  hash?(path: string): Promise<string>;         // a content hash, for caching without reading
}
```

### 4.1 Every type

```ts
export type Severity = 'error' | 'warning' | 'suggestion' | 'info';   // `info` exists because lint-core emits it today
export type Safety = 'safe' | 'suggested' | 'unsafe';
export type Trust = 'trusted' | 'untrusted';

export interface Span { readonly from: number; readonly to: number }
export interface Source { readonly path: string; readonly text: string; readonly language: string }
export interface Node {
  readonly kind: string; readonly from: number; readonly to: number; readonly kids: readonly Node[];
  readonly attrs?: Readonly<Record<string, string | number | boolean | readonly string[]>>;
  readonly parts?: Readonly<Record<string, Span>>;   // e.g. fm-key: { name, value }; a fix can name a part
}

export interface RulesetInput {
  readonly name: string;                              // the id prefix, from the ruleset manifest
  readonly version: string;
  readonly languages: readonly Language[];
  readonly rules: readonly (RuleManifest | CodeRule | ProjectRule)[];
  readonly examples?: Readonly<Record<string, string>>;   // fixture path (relative to the ruleset root) → file text
  readonly vocab?: Readonly<Record<string, readonly string[]>>;
  readonly engines?: readonly FixEngine[];            // `edits` is always present
  readonly order?: readonly string[];                 // rule ids whose fixes go first in a pass (§7.4)
  readonly defaults?: { readonly budget?: Budget; readonly severity?: Severity; readonly safety?: Safety };
  readonly trust?: Trust;                             // default 'trusted'; §16
  readonly mode?: 'strict' | 'lenient';               // default 'strict'
  readonly verified?: VerifiedStamp;                  // §8.2
}

export interface Budget { readonly ops: number; readonly findings?: number }   // findings cap per rule per file; default 1000

export interface RuleManifest { /* the JSON of §6.2, parsed */ readonly format: 1; readonly id: string; /* … */ }

export interface CodeRule {
  readonly id: string; readonly language: string; readonly severity: Severity; readonly summary: string;
  readonly reads?: { readonly facts?: readonly string[]; readonly vocab?: readonly string[] };
  readonly budget?: Budget;
  readonly examples: string;                          // fixtures file path
  readonly inert?: 'skip' | 'include';
  readonly suppressible?: 'inline' | 'waiver' | 'none';
  readonly changes?: readonly ShapeChange[];          // §7.4: shape changes this rule's fixes may make
  readonly legacy?: string;
  readonly visit?: Readonly<Record<string, (node: Node, ctx: RuleContext) => void>>;
  readonly check?: (root: Node, ctx: RuleContext) => void;
}

export interface ProjectRule<C = unknown> extends Omit<CodeRule, 'visit' | 'check'> {
  readonly scope: string | readonly string[];         // globs
  collect(root: Node, ctx: RuleContext): C;           // plain JSON only (§6.6)
  decide(byFile: ReadonlyMap<string, C>, ctx: DecideContext): void;   // map iterates in path order
  readonly probe?: ProjectProbe;                       // §8: mutation probe instead of synthetic fixtures
}

export interface RuleContext {
  text(span: Span): string;                           // inert ranges masked with spaces (§5.1)
  raw(span: Span): string;                            // unmasked; counts as reading inert content
  select(from: Node, selector: string): readonly Node[];
  fact<T = unknown>(name: string, node?: Node): T | undefined;
  vocab(name: string): readonly string[];
  measurement<T = unknown>(name: string, node?: Node): T | undefined;   // host-supplied, §4: LintOptions.measurements
  report(finding: ReportInput): void;
}
export interface DecideContext { report(finding: ReportInput & { readonly path: string }): void }
export interface ReportInput {
  readonly span: Span; readonly message: string; readonly hint?: string;
  readonly severity?: Severity; readonly fixes?: readonly Fix[]; readonly data?: Readonly<Record<string, unknown>>;
}

export interface LintOptions {
  readonly only?: readonly string[];                  // rule ids or globs ('deck/*')
  readonly minSeverity?: Severity;
  readonly waivers?: WaiverSet;
  readonly cache?: Cache;                             // §11.3; omit for no caching
  readonly measurements?: Readonly<Record<string, unknown>>;   // values only a renderer knows, e.g. Lattice's spark fit
  readonly coverage?: 'full' | 'partial';             // §9.1: staleness and ratchets run only on 'full'
  readonly now?: string;                              // ISO date for waiver expiry; deterministic output (§11.5)
  readonly signal?: AbortSignal;
}
export interface LintResult { readonly findings: readonly Finding[]; readonly stats: Stats }
export interface Stats {
  readonly files: number;
  readonly perRule: Readonly<Record<string, { readonly ms: number; readonly ops: number; readonly cacheHits: number }>>;
}

export interface FixOptions {
  readonly safety?: Safety;                           // highest grade to apply; default 'safe'
  readonly only?: readonly string[];                  // rule ids; required when safety is 'unsafe'
  readonly maxPasses?: number;                        // default 10
  readonly dryRun?: boolean;
}
export interface FixResult {
  readonly text: string;
  readonly applied: readonly AppliedFix[];
  readonly skipped: readonly SkippedFix[];
  readonly passes: number;
  readonly remaining: readonly Finding[];
}
export interface AppliedFix { readonly rule: string; readonly span: Span; readonly edits: readonly Edit[]; readonly pass: number }
export interface SkippedFix { readonly rule: string; readonly span: Span; readonly reason: SkipReason; readonly detail?: string }
export type SkipReason =
  | 'safety' | 'stale' | 'conflict' | 'no-candidate' | 'inert' | 'not-alone'
  | 'broke-structure' | 'did-not-resolve' | 'cycle' | 'engine-missing' | 'engine-threw' | 'invalid-edit' | 'max-passes';

export interface Problem { readonly rule?: string; readonly code: string; readonly message: string; readonly at?: string }

export interface Cache { get(key: string): unknown; set(key: string, value: unknown): void }
export interface WaiverSet { readonly waivers: readonly Waiver[]; readonly ratchets: readonly Ratchet[] }
export interface Waiver {
  readonly rule: string; readonly target: string; readonly match?: string; readonly count?: number;   // count default 1
  readonly reason: string; readonly since?: string; readonly expires?: string | null;
}
export interface Ratchet { readonly rule: string; readonly target: string; readonly budget: number; readonly reason: string }
export interface VerifiedStamp { readonly [ruleId: string]: string }   // ruleId → hash (§8.2)
export interface ShapeChange { readonly kind: 'slide-count' | 'front-matter' | 'inert'; readonly reason: string }
export interface ProjectProbe { readonly mutate: string; readonly expect: number }   // §8
```

`Language`, `FixEngine`, `Fix`, `Edit`, `EditGroup`, `Plan` and `Finding` are defined where they are used: §5.1, §7.2,
§7.6 and §12.1.

## 5. Language plugins

### 5.1 The interface

```ts
export interface Language<Tree = Node> {
  readonly id: string;                          // 'lattice-deck', 'css', 'json'
  readonly version: string;                     // part of every cache key (§11.3)
  readonly kinds: readonly string[];            // every kind a selector may name
  readonly comment?: { line?: string; block?: [string, string] };   // for inline suppressions (§9.2); omit to have none
  parse(source: Source): ParseOutput<Tree>;
  root?(tree: Tree): Node;                      // when Tree is not Node already (a flat tree, a foreign AST)
  inert?(tree: Tree, source: Source): readonly Span[];
  shape(tree: Tree, source: Source): Shape;     // what a safe fix must not change (§7.4 step 5)
  facts?: Readonly<Record<string, (tree: Tree, source: Source, node?: Node) => unknown>>;
  locate?(tree: Tree, span: Span): Readonly<Record<string, unknown>>;   // extra location fields, e.g. { slide: 3 }
  extends?: Language;                           // the language this one builds on (§5.5)
}

export interface ParseOutput<Tree> {
  readonly tree: Tree;
  readonly errors: readonly { span: Span; message: string }[];   // reported as squadra/parse-error findings
}

export interface Shape {
  readonly units: number;                       // top-level units: slides in a deck, rules in a stylesheet, keys in JSON
  readonly header?: Span | null;                // front matter or equivalent, if present
  readonly inert: readonly string[];            // the text of every inert range, in order
}
```

- **One node shape.** Selectors and walkers work on `{ kind, from, to, kids, attrs?, parts? }` whatever produced it.
  Segno already produces the first four fields (`docs/src/lib/segno/grammar.ts`, `interface Node`). A plugin around
  another parser maps that parser's tree into this shape once, at parse time.
- **Parts have spans.** An attribute's value is often cleaned (quotes and comments stripped), so a fix cannot find it
  in the text from the value alone. `parts` gives the span of every piece a fix may name: `fm-key` has `name` and
  `value`, a declaration has `property` and `value`.
- **Inert is the language's job.** Today every deck rule masks code fences and hidden comments itself
  (`stripFencedCode`, `withoutCodeBlocks`, `withoutCodeCommentMarkers`). In Squadra the language marks those ranges once.
  The driver does not dispatch nodes inside them, `ctx.text()` returns them masked with spaces, and the fix driver
  refuses edits inside them (§7.4). A rule that must look inside one says so with `"inert": "include"` and reads with
  `ctx.raw()`.
- **Facts are memoized per parse, and may be per node.** `deck.family` is computed once per file; `slide.capacity` once
  per slide node.
- **`locate` keeps domain locations.** Lattice's Studio rail shows findings by slide, not by offset. The deck language's
  `locate` adds `{ slide }`, so nothing downstream loses what `{ slide, line }` findings give it today.

### 5.2 Parse errors

A language that cannot parse a file still returns a tree (the part it read) and a list of errors. The driver reports each
error as a `squadra/parse-error` finding and still runs rules over the partial tree, because a deck with one broken
table still deserves its other findings. Its severity is `error` by default; a ruleset may lower it for a language
where partial input is normal. A language that cannot produce any tree returns an empty root. Rules then see nothing,
and the parse error, at `error`, is the finding, so an unreadable file can never pass a gate silently.

### 5.3 Segno as a language: `fromSegno`

Any Segno grammar becomes a Squadra language in one call:

```ts
import { compile } from '@laticent/segno';
import { fromSegno } from '@laticent/squadra/segno';

const json = fromSegno({
  id: 'json',
  version: '1',
  grammar: compile(jsonSpec),                // or the generated parser (Segno `generate`)
  inert: ['string'],                         // kinds that are inert ranges
  refine: (root, source) => root,            // optional: a structure layer on top (§5.4)
  shape: (root) => ({ units: root.kids.length, inert: [] }),
});
```

- **Why Segno.** A Segno grammar only compiles if it parses in time proportional to its input
  (`docs/src/lib/segno/README.md`). A language built on it inherits that bound for its grammar. A `refine` step is hand
  code and states its own bound, the way the deck pipeline's stage drivers do (decision `2026-10-22-segno-deck-pipeline.md`
  G5).
- **The flat tree.** A generated Segno parser writes its tree into one reused `Int32Array` (`flat.ts`, `FlatTree`).
  `fromSegno` walks that buffer directly, without building `Node` objects, when the grammar ships generated. `toNodes()`
  builds objects only for the nodes a rule actually receives.
- **Kinds come from the grammar.** `fromSegno` reads the grammar's node kinds (Segno's `kindsOf`) and publishes them as
  the language's `kinds`, so a selector naming a kind the grammar never produces is refused at compile time (§8).

### 5.4 The structure layer

A Segno grammar on its own is a tokenizer: `tools/parser-bakeoff/languages-grammars.mjs` says of its CSS, HTML and
Markdown grammars "no element tree, no rule-versus-declaration split, no CommonMark block pass — those take code on
top". A language plugin adds that code as `refine(root, source)`. It takes the token tree and returns a richer tree
with nesting, `attrs` and `parts`. The refine step is part of the language, not of any rule, so it runs once per file.

For Markdown, Squadra does not write that layer. The Segno deck pipeline does (§5.6).

### 5.5 Lattice's deck language: `lattice-deck`

This lives in the Lattice repo (`lib/authoring/squadra/deck-language.js`), not in the library. It extends the reference
Markdown language (§5.6) with Lattice's own semantics, so it is the first test of building one language on another.

**It reads the Segno deck pipeline's document model.** The owner decided on 2026-10-22 that Segno grows into the one
parser of a whole deck, a document model "every consumer reads", and on 2026-10-25 that the end state is a renderer
that reads that model instead of markdown-it (decision `2026-10-22-segno-deck-pipeline.md`, D1-D4 and P7). The owner
confirmed on 2026-10-28 that `lattice-deck` builds on it. So the linter, the renderer, the narrator and the Studio read
one parse, and lint and render agree by construction rather than by a test that compares two parsers.

| Layer | Built from (pipeline stage) | Produces |
|---|---|---|
| Ingest | S0: BOM, line endings, line index | the Source text and its line index (§5.7) |
| Blocks and slides | S1: the block pass, which yields slide boundaries as a by-product | `deck` → `front-matter`, `slide`; inside a slide the CommonMark blocks (`heading`, `para`, `list`, `item`, `quote`, `table`, `fence`, `code-block`, `html-block`, `hr`) |
| Rendered slides | `lib/core/heading-split-core.js`, the kernel lint-core's `bakeHeadingChunks` uses | `rendered-slide` nodes under a `slide` when the deck splits on headings, so a capacity rule counts per rendered slide |
| Front matter | S3 island: the register grammar | `fm-key` with `attrs.name`, `attrs.value` and `parts.name`, `parts.value` |
| Directives | S3 island: the directive grammar for HTML comments | `directive` (`_class`, `say`, `track`…) with `attrs.name`, `attrs.tokens` |
| Inline notation, fence records, chart rows | S3 islands: `lib/core/segno-slots.js`, the chart-row and list-text grammars | `segno-span`, `fence-record`, `chart-row` with their bound records in `attrs` |

Facts: `deck.family` (from `deckFamily`), `deck.size`, `deck.plugins`, `deck.mode`, `slide.classes`, `slide.capacity`.
Inert: fences, indented code blocks, and HTML comments that are not directives. `shape`: the slide count, the front-matter
span, and the text of every inert range.

**Render agreement (HARD RULE #1).** The pipeline's own acceptance holds its block structure to markdown-it as Lattice
configures it, on every deck in the corpus, and its slide boundaries to `slide-boundaries.mjs` exactly (pipeline note
§Acceptance). `lattice-deck` adds nothing to that test and does not re-derive structure. When the pipeline reaches P7
and the renderer reads the same model, the question disappears.

**It depends on the pipeline's progress.** `lattice-deck` needs the pipeline's S1 (phase P2) for slides and blocks, and
its S3 islands (phase P3) for directives and front matter. As of 2026-10-28, `main` carries the pipeline's census
harness (P0) and the native-run code generation (G6); `deckModel` itself is not there yet. So Squadra's M1 splits
(§15.5): the core, the fix driver and the reference YAML language do not need the pipeline and can start now;
`lattice-deck` and the first deck-rule migrations start when P2 lands.

**No inline suppressions in decks.** An HTML comment in a deck that is not a directive is a speaker note
(`lib/authoring/notes-core.js`): it reaches the PPTX notes pane, the HTML export's notes and the presenter view. A
`<!-- squadra-ignore … -->` comment would therefore ship in the export. `lattice-deck` declares no `comment` syntax, so
inline suppressions do not exist in decks, and a deck exception is a waiver (§9.1). Changing that would change export
bytes, which needs the owner's sign-off under CLAUDE.md's export rule.

### 5.6 The reference languages, and the rest

| Language | Built on | Ships in | When | Lattice uses it for |
|---|---|---|---|---|
| `markdown` | The Segno deck pipeline's CommonMark document model (S0-S2), adapted to Squadra's node shape | Squadra (`./languages/markdown`) | with `lattice-deck`, once pipeline P2 lands | the base of `lattice-deck`; `*.docs.md` and `engineering/` docs |
| `yaml` | a Segno grammar | Squadra (`./languages/yaml`) | M1 | workflow files; the shape `lattice-deck`'s front-matter island reads |
| `json` | a Segno grammar | Squadra (`./languages/json`) | M2 | component, plugin and theme manifests (22 ownership checks) |
| `css` | the pipeline's CSS dialect when its P5 lands ("one CSS tokenizer on the spine"); a Segno grammar plus a rule/declaration refine until then | Squadra (`./languages/css`) | M3 | themes and component styles (36 ownership checks) |
| `js`, `ts` | an adapter over acorn or the TypeScript API, both already used by `tools/check-ownership.js` | Lattice | M3 | the 37 ownership checks that read JS |
| outside-domain fixture (Dockerfile or OpenAPI YAML) | a Segno grammar | Squadra's tests and the learn page | by M4 | nothing: it proves the interfaces are not shaped only by Lattice |

### 5.7 Line endings and the BOM

Squadra's `Source.text` is the text after the ingest boundary that `2026-08-04-line-endings-lf-boundaries.md` defines:
no BOM, LF line endings. Every span, edit and line number refers to that text. The host is responsible for the boundary:

- On read, the Node host strips a BOM and converts CRLF and lone CR to LF, and records what it removed.
- On write, it restores the file's original line endings and BOM, so a fix never rewrites a whole file's line endings.
- The deck pipeline's S0, once built, does the same normalization for the renderer, so lint and render see the same text.

The conformance fixtures include CR, CRLF, mixed and BOM variants of every structure test.

## 6. Rules

### 6.1 Where rules live: rulesets

A ruleset is a folder with a manifest and one file per rule:

```
lib/authoring/rules/                     ← Lattice's deck ruleset (§15.2)
  squadra.ruleset.json                   ← the ruleset manifest (§6.3)
  schema/                                ← the JSON Schemas, copied from the package
  autosplit-retired.rule.json            ← a declarative rule (§6.2)
  autosplit-retired.fixtures.md          ← its examples (§6.7)
  autosplit-retired.docs.md              ← optional long-form docs, folded into generated docs
  capacity-overflow.rule.js              ← a code rule (§6.5)
  capacity-overflow.fixtures.md
```

The `.rule.json` and `.rule.js` suffixes are how the loader finds rules. The `.fixtures.md` suffix follows Lattice's
existing `video.fixtures.md`. One rule per file keeps a rule's history in its own `git log` and keeps merge conflicts
off a shared file, the problem that moved Lattice's changelog to `changelog.d/`. Paths inside a manifest (`examples`,
`docs`) are relative to the manifest's own folder.

**In the browser there are no globs.** The build bundles each ruleset into one module (manifests, code rules and the
`verified` stamp), and the Studio imports that module. The Node host reads the folder directly.

### 6.2 The rule manifest

```jsonc
{
  "$schema": "./schema/rule.schema.json",
  "format": 1,                         // manifest format version (§18)
  "id": "deck/unknown-corners",        // <ruleset>/<rule>; unique; never reused after retirement
  "legacy": "unknown-corners",         // the lint-core id it replaces (§15.3)
  "language": "lattice-deck",
  "summary": "A `corners:` value that no theme defines.",
  "severity": "warning",               // error | warning | suggestion | info
  "select": "front-matter > fm-key[name=corners]",
  "where": { "value": { "notIn": "@corners" } },
  "message": "`corners: {{value}}` is not a corner style.",
  "hint": "Use one of {{list(@corners)}}.",
  "fix": {
    "safety": "suggested",
    "replace": "value",                // a part (§5.1): the node, or a named part such as `value`
    "with": "{{nearest(value, @corners)}}",
    "description": "Change it to `{{nearest(value, @corners)}}`."
  },
  "suppressible": "waiver",            // inline | waiver | none (§9)
  "examples": "unknown-corners.fixtures.md",
  "docs": "unknown-corners.docs.md",
  "since": "0.1.0"
}
```

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | Manifest format version. `1` today. |
| `id` | yes | `ruleset/name`, kebab case. |
| `language` | yes | A language id in the ruleset. |
| `summary` | yes | One line. |
| `severity` | yes, unless every case sets one | `error`, `warning`, `suggestion` or `info`. |
| `select` | yes | A selector (§6.4). |
| `where` | no | A predicate (§6.4.3). |
| `cases` | no | An ordered list of `{ when, severity, message, hint, fix }`. The first case whose `when` holds decides. A case without `when` is the default. |
| `message` | yes, unless every case sets one | A template (§6.4.4). |
| `hint` | no | A template. Advice for a person. It replaces lint-core's free-text `fix:` field, which stays useful where no machine fix is possible. |
| `fix` | no | A declarative fix (§7.3), or `null` with a `noFixReason`. |
| `noFixReason` | when `fix` is `null` | Why the rule refuses a machine fix, such as Lattice's `bad-render-target-value`, where a guessed fix could switch an export target on. |
| `changes` | no | The shape changes this rule's fix is allowed to make, each with a reason (§7.4 step 5). |
| `inert` | no | `"include"` to see inside inert ranges. Default `"skip"`. |
| `suppressible` | no | `inline`, `waiver` or `none`. Default `waiver` for every rule in a ruleset whose `kind` is `gate`, `inline` otherwise (§6.3). |
| `examples` | yes | A fixtures file path, or an inline object (§6.7). |
| `budget` | no | Overrides the ruleset default (§8.3). |
| `docs`, `since`, `legacy`, `tags` | no | Metadata. |

### 6.3 The ruleset manifest

```jsonc
{
  "$schema": "./schema/ruleset.schema.json",
  "format": 1,
  "name": "deck",                       // the id prefix for every rule in it
  "version": "1.0.0",
  "kind": "authoring",                  // authoring | gate: a gate ruleset's rules default to waiver-only (§9)
  "summary": "Deck-authoring footguns for Lattice decks.",
  "languages": ["lattice-deck"],        // ids the host must supply
  "rules": ["*.rule.json", "*.rule.js"],
  "vocab": ["components", "modifiers", "corners", "capacity"],
  "defaults": {
    "budget": { "ops": 200000, "findings": 1000 },
    "safety": "safe"
  },
  "order": ["deck/retired-logo-key"]
}
```

A ruleset declares the languages and vocabularies it needs, but does not contain them. The host supplies them. That is
how one ruleset runs in the CLI (vocab built from manifests on disk) and in the browser (vocab precomputed at docs-build
time), the split Lattice's `lintTextWith(source, vocab)` already makes.

### 6.4 The selector and predicate language

The selector language is designed now and built by M4, or sooner if about 15 migrated rules repeat one shape (§2.3).
Until then, rules are code rules using `ctx.select` with the same syntax, so nothing written early has to change.

#### 6.4.1 Selectors

CSS-like, because people who write rules already read CSS:

```
fm-key[name=autosplit]                       a front-matter key named autosplit
fm-key[name=autosplit i]                     the same, case-insensitive
front-matter > fm-key                        a key directly under front matter
slide directive[name=_class]                 a _class directive anywhere in a slide
slide:has(> heading) para:first              the first paragraph of a slide that has a heading
declaration[property=margin]:not([value=0])  any margin declaration whose value is not 0
item[text^="**"]                             a list item whose text starts with **
> item, > list                               (relative, inside ctx.select) child items or lists
```

| Piece | Meaning |
|---|---|
| `kind` | A node of that kind. `*` matches any kind. |
| `[attr=v]`, `[attr!=v]` | Attribute equals / differs. `text` is the node's source text with inert ranges masked. |
| `[attr^=v]`, `[attr$=v]`, `[attr*=v]` | Starts with, ends with, contains. |
| `[attr~=v]` | A whitespace-separated word list contains `v`. |
| `[… i]` | Any attribute test, compared case-insensitively. |
| `[attr in @vocab]`, `[attr notIn @vocab]` | Membership in an injected vocabulary. |
| `a b`, `a > b`, `a + b`, `a ~ b` | Descendant, child, next sibling, later sibling. |
| `a, b` | Either. |
| `> a` | Relative to the node passed to `ctx.select` (code rules and `:has` only). |
| `:has(sel)`, `:not(sel)` | Has a matching descendant (or child, with `> sel`); does not match. |
| `:first`, `:last`, `:nth(n)` | Position among siblings of the same kind. |

There are **no regular expressions** in declarative rules. A regex can backtrack exponentially. Text tests are the
literal operators above.

#### 6.4.2 How selectors run

The selector grammar is a Segno grammar, generated into the core at build time (§2.1), so a selector parses in linear
time and a malformed one is refused with a position. Compiled selectors are matched right to left, as browsers match
CSS: the driver indexes candidate nodes by the rightmost kind, then checks ancestors. Results are memoized per (node,
selector suffix), so mixing `>` and descendant combinators does not re-walk the same ancestors, and `:has()` and
`count` reuse each other's work.

The cost target is linear in nodes × selector length, with text operators adding the length of the text they read.
That is a design target for M1 to measure with the benchmark (§11.6), including deep trees and many text operators on
`*`; it is not a property proved here.

#### 6.4.3 Predicates (`where`, `when`)

A predicate is a JSON object over the selected node's attributes, its text and its facts:

```jsonc
{ "value": { "eq": "off" } }                                       // equals
{ "value": { "ne": "on" } }                                        // differs
{ "value": { "in": ["off", "false", "no"], "case": "insensitive" } }
{ "value": { "notIn": "@corners" } }                               // not in a vocabulary
{ "text": { "startsWith": "**", "endsWith": "**" } }
{ "fact": { "deck.family": { "ne": "wide" } } }                    // a fact about the file or node
{ "count": { "of": "> item", "gt": 7 } }                           // how many matches under the node
{ "all": [ … ], "any": [ … ], "not": { … } }                       // combine predicates
```

Value operators are `eq`, `ne`, `in`, `notIn`, `startsWith`, `endsWith`, `contains`, `gt`, `gte`, `lt`, `lte`, each
with an optional `"case": "insensitive"`. `not` combines predicates; it is not a value operator.

`count` covers a share of the rules the census calls computed: "more than N items", "a slide with no heading". That is
why the declarative share may end up above the census's 56%. The census is the baseline to measure that against.

#### 6.4.4 Templates

Messages, hints and fix text are templates. `{{name}}` reads an attribute of the selected node (`{{value}}`,
`{{text}}`, `{{name}}`). A small fixed set of pure functions is available:

| Function | Returns |
|---|---|
| `nearest(x, @vocab)` | The closest vocabulary entry by bounded edit distance, or nothing. This is lint-core's `nearestRegion` / `editDistance`, moved into the library. |
| `list(@vocab)` | The vocabulary as `` `a`, `b` or `c` ``. |
| `lowercase(x)`, `uppercase(x)`, `trim(x)` | Case and space. |
| `strip(x, prefix)` | `x` without a leading `prefix`. |

Templates are evaluated when the finding is made, at lint time, so a finding's fixes already hold their final text. A
template is parsed when the rule compiles; an unknown name or function is a refusal. A fix whose template yields nothing
(no near match) is dropped from that finding and recorded as `no-candidate`, which is what lint-core's
`withTokenSuggestion` does today.

### 6.5 Code rules

When a rule needs more than a selector and a predicate, it is a function. The census says this is 44% of deck rules
today, and until the selector language lands it is every rule.

```js
// lib/authoring/rules/capacity-overflow.rule.js
import { defineRule } from '@laticent/squadra';

export default defineRule({
  id: 'deck/capacity-overflow',
  legacy: 'capacity-overflow',
  language: 'lattice-deck',
  severity: 'warning',
  summary: 'A slide holds more elements than its layout can show.',
  reads: { facts: ['slide.capacity'] },               // declared, so caching is exact (§11.3)
  budget: { ops: 50000 },
  examples: './capacity-overflow.fixtures.md',
  visit: {
    'rendered-slide'(node, ctx) {
      const cap = ctx.fact('slide.capacity', node);
      if (!cap) return;
      const items = ctx.select(node, '> item, > list > item');
      if (items.length <= cap.hard) return;
      const first = items[cap.hard];
      ctx.report({
        span: { from: first.from, to: first.to },    // point at the first item past the limit
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
- **`ctx`** is the only way out (§4.1). Each call counts against the rule's budget (§8.3).
- **`reads`** declares the facts and vocabularies the rule uses, and becomes part of its cache key. A rule that reads
  one it did not declare gets an error from `ctx` in development and a `squadra/undeclared-read` finding in production.
  The cache key also covers every module a code rule imports (§11.3), which `reads` cannot see.

### 6.6 Project rules: `collect` and `decide`

The census says 75 of the 104 ownership checks read other files. A project rule splits that work into a per-file part
and a cross-file part:

```js
// tools/rules/repo/unique-selectors.rule.js: "no top-level selector defined by two components"
export default defineProjectRule({
  id: 'repo/unique-selectors',
  scope: 'lib/components/**/*.styles.css',
  language: 'css',
  severity: 'error',
  summary: 'Two components define the same top-level selector; the later one silently wins.',
  examples: './unique-selectors.fixtures.md',

  // Runs per file, in parallel, cached by the file's hash. Returns plain JSON.
  collect(root, ctx) {
    return ctx.select(root, 'rule > selector').map((n) => ({ selector: ctx.text(n), from: n.from, to: n.to }));
  },

  // Runs once over every file's collected data, which arrives in path order. It never parses.
  decide(byFile, ctx) {
    const seen = new Map();
    for (const [path, items] of byFile) {
      for (const { selector, from, to } of items) {
        const first = seen.get(selector);
        if (first) ctx.report({ path, span: { from, to }, message: `\`${selector}\` is also defined in ${first}.` });
        else seen.set(selector, path);
      }
    }
  },
});
```

- **Why the split.** `collect` output is cached per file. Change one CSS file and only that file is re-collected;
  `decide` re-runs over cached data. Today `tools/check-ownership.js` re-reads and re-parses every file on every run
  (about 120 `readFileSync` calls, 21.8 s in one run on 2026-10-26). Before M3 promises this as the speed lever, M3 profiles
  `check-ownership.js`: part of that time may be its four `require('typescript')` sites and the acorn checks, which a
  cache of parsed files would capture differently.
- **`collect` output must be plain JSON** (numbers, strings, arrays, objects), because it is cached on disk and moved
  between workers. Nodes and flat-tree views are not plain JSON; copy the spans out, as the example does. The compiler
  checks this on the rule's own fixtures.
- **`decide` sees files in path order**, whatever order workers finish in, so its output is deterministic.
- **Allowlist checks are mostly waivers, not rules.** See §9.1 for which `SANCTIONED_*` lists become waivers and which
  stay rules.

### 6.7 Fixtures files

A fixtures file is Markdown. Each fence's info string is `<language-hint> <role> [name] [xN]`:

| Info-string part | Meaning |
|---|---|
| `bad` | Must produce findings from this rule at exactly the spans marked `⟦…⟧`. With no markers, at least one finding; `x3` means exactly three. |
| `fixed` | The result of applying the rule's fixes to the `bad` fence with the same name (or the one just before it). Required when the rule has a fix. |
| `good` | Must produce no finding from this rule. At least one `good` example must contain a node the selector matches, so the predicate, not the absence of the node, is what keeps it quiet. |
| `[name]` | Pairs a `bad` with its `fixed`. |
| `file=<path>` | Project rules only: the fence is one file of a multi-file case. A line `---case---` between fences starts the next case. |

The markers `⟦` and `⟧` are removed before the example is linted. Use a fence longer than any fence inside the example
(```` ```` ```` for a deck that contains ```` ``` ````), as CommonMark allows. The file is otherwise free prose: write
the explanation of the rule around its examples, and the generated docs render it.

Small rules may put examples inline instead:

```json
"examples": {
  "bad":   ["---\n⟦autosplit: off⟧\nsize: story\n---\n# Title\n"],
  "fixed": ["---\nsize: story\n---\n# Title\n"],
  "good":  ["---\nsize: story\n---\n# Title\n"]
}
```

## 7. The fix engine

The fix engine is an interface in Squadra, not a separate library. Squadra ships one reference engine, `edits`, and
Lattice ships `lattice-line` for its migration (§2.2).

### 7.1 The model

Every fix, from every engine, ends as a list of edits against the current text. One driver then checks, applies and
verifies those edits. So the safety properties (no overlap, atomic fixes, no edits inside inert ranges, the document
keeps its shape, the finding goes away) are enforced in one place whatever produced the fix. An engine only decides
what the edits are.

```
finding.fixes[] ──engine.toEdits()──▶ Edit[] per fix ──plan()──▶ non-conflicting set ──apply()──▶ new text
      ▲                                                                                              │
      └──────────── re-lint ◀── verify: shape unchanged, finding resolved ◀───────────────────────────┘
```

### 7.2 The engine interface

```ts
export interface FixEngine<Payload = unknown> {
  readonly id: string;                         // 'edits', 'lattice-line', 'biome'
  readonly exclusive?: boolean;                // rewrites the whole file: runs in a pass of its own (§7.4)
  toEdits(source: Source, fix: Fix<Payload>, ctx: EngineContext): readonly Edit[] | null;
}

export interface Fix<Payload = unknown> {
  readonly engine: string;
  readonly safety: Safety;
  readonly description: string;
  readonly payload: Payload;
}

export interface EngineContext {
  readonly tree: Node;                         // the current parse
  readonly finding: Finding;
  readonly vocab: Readonly<Record<string, readonly string[]>>;
  text(span: Span): string;
}
```

`toEdits` returns `null` when the fix no longer applies to the current text, for example because an earlier fix in the
same run already removed the line. The driver records that as `stale` and moves on. If `toEdits` throws, the driver
records `engine-threw` and moves on; one broken engine never stops "Fix all".

**A serialized fix is always lowered.** In a finding's JSON (§12.1) every fix appears as
`{ engine, safety, description, edits }`, already turned into edits against the text the finding was made on. The
payload stays internal to the engine.

**Shipped engines:**

| Engine | Where | Payload | Turns into |
|---|---|---|---|
| `edits` | Squadra core, always present | the declarative ops of §7.3, with templates already evaluated | the edits those ops name |
| `lattice-line` | the Lattice repo, during migration only | today's finding fields: `line`, `slide`, `chunkLine`, `replace`, `replaceLine`, `autofixable` | one edit replacing the located line, found by the chunk walk `applyFix` uses today |
| `whole-file` (example) | the library's docs | a function from text to text, such as an external formatter | one edit over the whole file; `exclusive: true` |

**Lattice's current fixers are one implementation.** `lattice-line` wraps the logic in `applyFix` and `fixReplacement`
(`lib/authoring/lint-core.js`) behind `toEdits`. Each unmigrated rule keeps its own edit. What changes is around it:

- The driver batches non-conflicting fixes into one pass where `applyAllFixes` applies one fix and re-lints, so fixes
  that interact can resolve in a different order.
- The driver refuses edits inside inert ranges, where `applyFix` today will rewrite a fenced example
  (`- **Alpha.** body` inside a code fence is rewritten by "Fix all" today).
- The structure check (§7.4) refuses a fix that deletes slides, which `applyAllFixes` does today when a fix removes the
  last front-matter key (`followups.d/2901-p1-fix-all-deletes-title-slide-when-front-matter-empties.md`).

All three are intended differences, and the whole-deck diff (§15.3) records each one.

### 7.3 Declarative fix operations

The `fix` block of a rule manifest lowers through the `edits` engine:

| Op | Example | Edits |
|---|---|---|
| `delete` | `"delete": "node"` or `"line"` | Remove the node, or the whole line holding it, including its line ending |
| `replace` + `with` | `"replace": "value", "with": "{{nearest(value, @corners)}}"` | Replace the node or a named part with the template's text |
| `insertBefore`, `insertAfter` | `"insertAfter": "node", "text": "\n---"` | Insert at the node's start or end |
| `wrap` | `"wrap": "node", "before": "**", "after": "**"` | Two insertions, atomic |
| `rename` | `"rename": "name", "to": "say"` | Replace the `name` part's span (the key, not the whole line) |
| `edits` | `[{ "replace": …, "with": … }, { "delete": … }]` | Several ops in one atomic fix, applied in array order |

`delete: line` has two guards, because a line is a coarser unit than a node:

- **It applies only when the node is alone on its line** and the line has no indented continuation. Otherwise the fix
  is skipped as `not-alone`. A line can hold two directives, or a key whose value is an indented block (`style: |`);
  deleting the line would lose author text or orphan the block, which a loose `key:` reader then misreads.
- **Deleting the last key of a header deletes the header.** When the line holds the only key of a front-matter block,
  the edit removes the whole `---`/`---` block. An empty block reads to the next `---`, so it would turn the first slide
  into front matter.

A fix's edits apply together or not at all, in array order when two of them touch the same offset. Today
`retired-logo-key` is safe because lint-core marks its deletions fixable only after the merge line is done
(`mergeDone`, `lib/authoring/lint-core.js` near line 8960). In Squadra it is one fix with both edits.

### 7.4 The driver

For one source, each pass:

1. **Lint** the current text and collect fixes at or below the requested safety grade. Fixes from an untrusted ruleset
   are capped at `suggested` (§16).
2. **Turn each fix into edits** through its engine. `null` is `stale`; a throw is `engine-threw`; an edit outside the
   text or with `to < from` is `invalid-edit`.
3. **Plan** with the edit kernel (§7.6):
   - Order fixes by the ruleset's `order` list, then severity (errors first), then position, then rule id.
     Deterministic, so the same input always yields the same output.
   - Take each fix in order. Accept it if none of its edits overlaps an accepted edit, and none falls inside an inert
     range the rule did not opt into (`inert`). An `exclusive` engine's fix is exempt from the inert test and runs only
     in a pass where nothing else is accepted.
   - Two edits conflict when their ranges overlap, or when two insertions from different fixes sit at the same offset.
     An insertion at offset X and a replacement of [X, Y) do not conflict: the insertion goes first.
   - A rejected fix is recorded as `conflict` and tried again next pass, against the new text.
4. **Apply** all accepted edits in one left-to-right build of the new string: O(text length + edits).
5. **Verify:**
   - **Shape.** Re-parse and compare the language's `shape` (§5.1) with the old one: the same number of top-level
     units, the same header presence, the same inert text. Markdown has no parse errors, so a parse check alone would
     never fire for a deck; the shape check is what catches a fix that deletes a slide. A fix may change the shape only
     if its rule declares that change in `changes` with a reason.
   - **Culprit.** If the shape changed, re-apply the pass's fixes in halves to find the fix that changed it (at most
     log₂ of the fix count extra applies), revert it, and record `broke-structure`. If halving does not isolate one
     fix (two break only together), revert the whole pass, and apply the fixes one at a time next pass.
   - **Resolution.** If an applied fix's own finding is still present at its mapped position, revert that fix, record
     `did-not-resolve`, and stop applying that rule's fixes on this file for the rest of the run. A fix that does not
     resolve its finding would otherwise apply again every pass.
6. **Stop** when a pass applies nothing, when the text repeats an earlier pass (`cycle`, returning the text before the
   repeat), or at `maxPasses` (`max-passes`, reporting the findings still fixable).

`applyAllFixes` today applies one fix per pass with a 500-pass cap. The driver applies every non-conflicting fix per
pass, so ten fixable findings take one or two passes. `maxPasses` defaults to 10 and is configurable; reaching it is
reported, never silent.

### 7.5 Safety grades

| Grade | Applied by | Use for |
|---|---|---|
| `safe` | `fix()` and `squadra fix` by default | Changes that cannot change meaning: deleting a retired key, a pure rename with one answer |
| `suggested` | `squadra fix --safety suggested`, or one click in an editor | A likely answer that a person should glance at: a did-you-mean |
| `unsafe` | `squadra fix --safety unsafe --only <rule>`; `fix()` refuses `unsafe` without `only` | Changes that may alter what renders |

A rule that must never be fixed by machine says `"fix": null` with a `noFixReason`.

### 7.6 The edit kernel

```ts
export interface Edit { readonly from: number; readonly to: number; readonly text: string }
export interface EditGroup { readonly id: string; readonly edits: readonly Edit[] }    // one atomic fix, in order
export interface Plan { readonly accepted: readonly EditGroup[]; readonly rejected: readonly { id: string; reason: string }[] }

export function plan(groups: readonly EditGroup[], opts?: { order?: (a: EditGroup, b: EditGroup) => number }): Plan;
export function apply(text: string, plan: Plan): string;
export function mapOffset(plan: Plan, offset: number, bias?: 'before' | 'after'): number;  // old → new position
export function diff(before: string, after: string, opts?: { context?: number }): string; // unified diff
export class EditError extends Error { readonly code: 'out-of-range' | 'inverted' | 'overlap-in-group' }
```

The fix driver uses these, and the core exports them for engine authors and tests. They know nothing about rules. If a
use outside linting appears, they can move to their own entry point without changing their shape.

## 8. The guarantee: what Squadra refuses

Segno refuses a grammar it cannot prove linear. Squadra refuses a rule it cannot show works on its own examples.
`compileRuleset` collects every problem in every rule. In strict mode it throws one `RulesetError` listing them all; in
lenient mode it drops each refused rule and reports it (§4).

| Code | Refused when |
|---|---|
| `no-examples` | A rule has no `bad` example, or no `good` example. |
| `bad-did-not-fire` | A `bad` example produced no finding from the rule, a finding at a span other than the marked ones, or the wrong count for `xN`. |
| `good-fired` | A `good` example produced a finding from the rule. |
| `good-avoids-selector` | No `good` example contains a node the rule's selector matches, so nothing shows the predicate works. |
| `fix-mismatch` | Applying the rule's fixes to a `bad` example did not give its `fixed` example. |
| `fix-did-not-resolve` | After its fix, the rule still fires on the fixed text. |
| `fix-grew` | Running the full driver on a `bad` example inserts text in more than one pass. |
| `fix-changed-shape` | A fix changed the example's shape (§7.4) without the rule declaring it in `changes`. |
| `fix-missing-fixed` | The rule has a fix but a `bad` example has no `fixed` partner. |
| `unknown-kind` | A selector names a kind the language does not publish. |
| `bad-selector`, `bad-template`, `bad-predicate` | Syntax errors, with the position. |
| `unknown-vocab`, `unknown-fact`, `unknown-engine`, `unknown-language` | A reference to something the ruleset does not supply. |
| `reserved-name` | A predicate, template or fact names `__proto__`, `constructor` or `prototype`. |
| `duplicate-id` | Two rules share an id. |
| `no-budget` | A code rule declares no budget and the ruleset sets no default. |
| `unserializable-collect` | A project rule's `collect` returned something that is not plain JSON, on its own fixtures. |

`checkRuleset` returns the same list without throwing, for editors and for `squadra test`.

**What the guarantee proves, and what it does not.** It proves a rule is alive (it fires where its examples say),
precise at the marked spans, quiet where its examples say, and that its fix converges and keeps the document's shape.
It does not prove the rule is right on inputs its examples do not cover. Fixtures are written by the person who wrote
the rule. That is why Lattice's migration also runs every rule against inputs that person did not write (§15.3).

**Project rules may use a probe instead of synthetic fixtures.** Hand-built multi-file fixtures for a cross-file check
tend to be trivial. A project rule may instead declare a `probe`: a mutation of the real tree (for example, "duplicate
one selector into a second component file") and the number of findings it must produce. This is the model
`tools/check-lint-coverage.js` already uses to prove Biome has teeth. Probes run in `squadra test` and CI, not in the
browser.

### 8.1 What this replaces

Lattice proves Biome still has teeth from the outside: `tools/check-lint-coverage.js` writes a violating file into
every checked directory and language and checks that Biome flags it. Lattice's own rules have no equivalent. With
Squadra, every rule proves it fires and fixes before it can load, on every compile.

### 8.2 What it costs

Each strict compile runs every rule on its fixtures. For Lattice's ~260 rules and checks, with a few small examples
each, that is expected to cost tens of milliseconds. This is an estimate, and M1 measures it. The browser skips the
work through a `verified` stamp: for each rule, a hash of its manifest or bundled module, its fixtures, the vocabulary
it reads and its language's id and version. The build produces the stamp, the same way the browser gets a precomputed
vocabulary today. A rule whose hash differs from its stamp is checked again in the browser.

### 8.3 Work budgets

- **Parse:** a language built on Segno is linear by construction for its grammar, and its hand-written stages state
  their bounds (§5.3). Other parsers are the plugin author's responsibility, and the docs say so.
- **Declarative rules:** a selector and predicate do memoized work per node (§6.4.2). Every rule, declarative or code,
  has an op budget, and the driver counts selector steps and text reads against it.
- **Findings cap:** a rule stops reporting on a file after `budget.findings` (default 1,000) and reports one
  `squadra/findings-capped` finding instead. A rule that reports on every node of a large file cannot exhaust memory.
- **Code rules:** every `ctx` call counts as an op. Past the budget, the driver stops the rule on that file and reports
  `squadra/budget-exceeded` naming the rule. It does not throw, and other rules still run.
- **The honest limit:** an op counter cannot stop a code rule that loops without calling `ctx`. JavaScript has no
  preemption inside one thread. The Node host runs rules in workers and terminates a worker past a wall-clock limit
  (default 10 s per file), reporting `squadra/timeout`. In the browser there is no such backstop. That is why rules from
  a source you do not trust should be declarative (§16).

## 9. Waivers, suppressions, ratchets and baselines

Every exception to a rule is one of three things, and every one carries a reason a reviewer can read: a waiver, an
inline suppression or a ratchet. Configuration can also turn a rule off (§10); that also needs a reason. Squadra's own
findings (`squadra/*`, table in §9.5) can never be waived, suppressed, ratcheted or turned off.

### 9.1 Waivers

A waiver is a recorded exception: this rule does not apply to this file, for this many findings, for this reason.

```jsonc
// squadra.waivers.json
{
  "$schema": "./schema/waivers.schema.json",
  "format": 1,
  "waivers": [
    {
      "rule": "repo/no-margin",
      "target": "lib/components/inventory/checklist/checklist.styles.css",
      "match": "margin-inline-start:auto",
      "count": 1,
      "reason": "Flex push; no padding or gap equivalent. HARD RULE #20.",
      "since": "2026-06-27",
      "expires": null
    }
  ],
  "ratchets": [
    { "rule": "deck/typed-shape-glyph", "target": "examples/legacy-glyphs.md", "budget": 3, "reason": "Pre-dates HARD RULE #29." }
  ]
}
```

- **A waiver covers `count` findings (default 1)** that match its rule, its file and its optional `match` text. A
  second matching finding is not covered and fails. That is the behavior the allowlists have today:
  `checkMarginDiscipline` "consumes one offense per sanction". A waiver without a count would let a second
  `margin-left:auto` into the same file unnoticed.
- **A waiver's `target` is one file.** Globs belong to ratchets, which count, never to waivers. A glob waiver with no
  `match` would turn a rule off across the repository and could never go stale.
- **A waiver that covers fewer findings than its `count` fails** as `squadra/stale-waiver`, an error. This is built in,
  and it replaces the stale-entry logic that the census found re-implemented in 33 checks (covering the 35
  `SANCTIONED_*` lists), and missing from 8 other allowlists and constants.
- **Staleness runs only on a full run.** A partial run (`--changed`, `only`, a path subset) cannot know whether an
  unlinted file still needs its waiver. Hosts pass `coverage: 'partial'` for those runs, and the stale and ratchet-down
  checks are skipped; the full run in CI does them.
- `reason` is required and must be non-empty. The tool cannot judge a reason, as `biome.jsonc` notes about its own
  exclusions. It can require one, and pull requests review it.
- An expired waiver stops suppressing and is reported as `squadra/expired-waiver`. Expiry compares against
  `LintOptions.now`, which the host sets, so the same inputs give the same output.

**Which allowlists become waivers.** Most `SANCTIONED_*` lists exempt a named file from a finding, and those become
waivers. Three kinds do not:

| List kind | Example | Becomes |
|---|---|---|
| A census with an exact count | `SANCTIONED_RUNTIME_MARKUP_SINKS` ("a CENSUS, not a guard requirement") | a project rule whose `decide` checks the count |
| A list that widens what a check scans | `DOC_STYLE_SINK_ROOTS` | the rule's `scope` |
| A contract table | `SANCTIONED_TOKEN_CONTRACTS` (`lib/tokens/contracts.js`) | vocabulary the rule reads |

HARD RULES #3, #20, #22, #24, #26 and #29 name lists this would move. Each rule's wording changes in the PR that moves
its list, and each of those PRs puts the new wording to the owner (CLAUDE.md, second filter, row 4).

### 9.2 Inline suppressions

Built by M4 (§2.3), and only in languages that declare a `comment` syntax. `lattice-deck` declares none (§5.5).

```css
/* squadra-ignore repo/no-margin -- flex push; see HARD RULE #20 */
```

- A suppression covers the next node. `squadra-ignore-file` covers the whole file.
- `--` and a reason are required. A suppression without one is itself reported as `squadra/suppression-without-reason`.
- A suppression that suppresses nothing is reported as `squadra/stale-suppression`, on full runs only.
- **A rule decides whether it can be suppressed inline.** `suppressible: "waiver"` refuses inline suppressions for that
  rule and reports them as `squadra/suppression-refused`. Every rule in a `gate` ruleset defaults to `waiver`, so a
  HARD-RULE gate is never silenced by a comment in the file it guards; the exception goes through the waivers file and
  its review. `suppressible: "none"` refuses waivers too.

### 9.3 Ratchets

A ratchet allows a known number of findings of one rule in one file, and fails if the number grows:

```jsonc
{ "rule": "deck/typed-shape-glyph", "target": "examples/legacy-glyphs.md", "budget": 3, "reason": "Pre-dates HARD RULE #29." }
```

- **Ratchets count per file.** A glob `target` expands to one ratchet per matching file, each with its own budget, so
  fixing three findings in one file cannot pay for three new ones in another.
- Above the budget is an error. Below it is reported as `squadra/ratchet-down` with the new number, so the budget only
  moves down. This is the shape of Lattice's `TYPED_GLYPH_BUDGET`, made generic.

### 9.4 Baselines

Adopting Squadra on an existing codebase: `squadra baseline` writes a ratchet per rule and file for today's findings
into the `ratchets` array of the waivers file, each with reason `baseline <date>`. New findings fail, and existing ones
can only go down.

### 9.5 Squadra's own findings

| Id | Severity | When |
|---|---|---|
| `squadra/parse-error` | error (a ruleset may lower it per language) | A language reported a parse error (§5.2) |
| `squadra/rule-refused` | error | Lenient compile dropped a rule (§4) |
| `squadra/undeclared-read` | error | A code rule read a fact or vocabulary it did not declare (§6.5) |
| `squadra/budget-exceeded` | warning | A rule passed its op budget on a file (§8.3) |
| `squadra/findings-capped` | warning | A rule passed its findings cap on a file (§8.3) |
| `squadra/timeout` | error | A worker passed its wall-clock limit (§8.3) |
| `squadra/stale-waiver` | error | A waiver covered fewer findings than its count (§9.1) |
| `squadra/expired-waiver` | warning | A waiver is past its `expires` date (§9.1) |
| `squadra/suppression-without-reason` | error | An inline suppression has no reason (§9.2) |
| `squadra/stale-suppression` | warning | An inline suppression suppressed nothing (§9.2) |
| `squadra/suppression-refused` | error | An inline suppression targets a rule that allows waivers only (§9.2) |
| `squadra/ratchet-down` | suggestion | A file is under its ratchet budget; the finding gives the new number (§9.3) |
| `squadra/rule-off-without-reason` | error | Configuration turns a rule off without a reason (§10) |

## 10. Configuration

One file at the project root, read by the Node host. The core never reads it; the host turns it into a ruleset input.

```jsonc
// squadra.config.json
{
  "$schema": "./schema/config.schema.json",
  "format": 1,
  "rulesets": ["lib/authoring/rules", "tools/rules/repo"],
  "languages": {
    "lattice-deck": ["examples/**/*.md", "**/*.gallery.md", "test/integration/baseline-decks/*.md"],
    "css": ["lib/**/*.css", "themes/**/*.css"]
  },
  "ignore": [
    { "glob": "dist/**", "class": "build-output" },
    { "glob": "lib/plugins/*/vendor/**", "class": "vendor" }
  ],
  "rules": {
    "deck/unknown-class": "error",
    "deck/collage-hint": { "level": "off", "reason": "Collage hints are under redesign; see the collage decision note." }
  },
  "overrides": [
    { "include": ["test/**"], "rules": { "deck/capacity-overflow": { "level": "off", "reason": "Test decks overflow on purpose." } } }
  ],
  "waivers": "squadra.waivers.json",
  "fix": { "safety": "safe", "maxPasses": 10 },
  "cache": ".cache/squadra"
}
```

- **Every `ignore` entry carries a class**, the convention `biome.jsonc` adopted after 29 exclusions carried no reason.
  The classes are the same: `dependency`, `build-output`, `transient`, `vendor`, `not-code`, `generated`, `unparseable`.
- **Turning a rule off needs a reason**, in `rules` and in `overrides` alike, and is reported in `squadra rules` and
  the JSON output, the way a waiver is. Without one, the run fails with `squadra/rule-off-without-reason`. A severity
  change needs no reason. A rule that is `suppressible: "none"` cannot be turned off by configuration.
- **`squadra coverage`** lists tracked files that no language claims and files that are claimed but ignored. It does
  for Squadra's languages what `tools/check-lint-coverage.js` does for Biome.
- Configuration cannot turn on a rule the ruleset does not have.

## 11. How it runs, and why it is fast

### 11.1 The pipeline

```
sources ─▶ parse once per (file, language) ─▶ mark inert ranges ─▶ one walk, dispatching to every rule
        ─▶ project collect (per file) ─▶ decide (once, in path order) ─▶ waivers, suppressions, ratchets ─▶ sort ─▶ report
```

### 11.2 One walk

At compile time the driver merges every rule's selectors into a table keyed by node kind. Walking a tree visits each
node once and calls only the handlers whose rightmost kind matches. Adding a rule adds table entries, not a walk.
Today's 156 deck rules each scan the source themselves. In Lattice the parse itself is shared beyond lint: the deck
pipeline's model is the one the renderer and the Studio read, so a lint after an edit re-reads only the edited slide.

### 11.3 Caching

| Cache entry | Key | Holds |
|---|---|---|
| Parse | content hash + language id + language version | the tree (in memory only) |
| File findings | content hash + language id and version + rule hash + hashes of the facts and vocabularies it declared + the engine set | that rule's findings on that file |
| Collect | content hash + language id and version + project-rule hash | that rule's `collect` output for that file |
| Ruleset | the `verified` stamp's inputs (§8.2) | the stamp |

**A rule's hash covers everything its result can depend on.** For a declarative rule, that is its manifest and
fixtures. For a code rule, it is the hash of its bundled module, which includes every module the rule imports.
Lattice's rules import shared kernels directly, as HARD RULE #1 requires (`front-matter-key.js`, `shape-glyphs.js`,
`heading-split-core.js`); hashing only the rule's own file would leave every cached result stale when one of those
kernels changed. The Node host computes that hash from the module graph; the browser gets it from the build.

The host supplies the store through `{ get(key), set(key, value) }`. The Node host keeps it on disk; the Studio keeps it
in memory. With no store, nothing is cached and results are identical.

### 11.4 Workers

The Node host shards files across a worker pool sized to the CPU count, largest files first. A worker loads the compiled
ruleset once. Project `decide` runs on the main thread after every `collect` returns, with files in path order.

### 11.5 Determinism

Findings are sorted by path, then `from`, then `to`, then rule id. Fix plans are ordered as §7.4 says. Waiver expiry
reads `LintOptions.now`, not the clock. The same inputs give byte-identical output in any worker count and any cache
state. A test runs the corpus at 1 and N workers, cold and warm, and compares bytes.

### 11.6 Measuring it (HARD RULE #19)

Squadra ships a benchmark, run with `squadra bench` and in Lattice through `npm run bench`. M1 records the baseline, and
targets are set from that measurement, not from this document. The numbers to beat, single runs on 2026-10-26:

| Today | Wall clock |
|---|---|
| `tools/check-ownership.js` | 21.8 s |
| `npx biome check` | 7.2 s |
| `npm run lint:deck:all` | 3.9 s |

The scenarios:

- **Whole-repo runs:** cold; warm with no changes, which should be close to a cache read.
- **Incremental runs:** one changed deck; one changed CSS file with project rules.
- **The fix driver** on a deck with 50 fixable findings.
- **Hostile input per language:** a 1 MB file of one repeated token, and a deep tree (1,000-level nesting) under
  selectors that mix combinators and text operators.

## 12. Output

### 12.1 The finding

```jsonc
{
  "rule": "deck/autosplit-retired",
  "legacy": "autosplit-retired",
  "severity": "error",
  "path": "examples/pricing.md",
  "span": { "from": 12, "to": 26 },             // "autosplit: off", 14 characters
  "start": { "line": 3, "column": 1 },          // 1-based, from the line index
  "end": { "line": 3, "column": 15 },
  "location": { "slide": 0 },                   // from the language's locate(); slide 0 is the front matter
  "message": "`autosplit: off` no longer works; slides that don't fit still split into more pages.",
  "hint": "To keep one slide whole, add `<!-- stress-slide -->` to that slide.",
  "fixes": [
    {
      "engine": "edits",
      "safety": "safe",
      "description": "Delete the line.",
      "edits": [{ "from": 12, "to": 27, "text": "" }]   // the line and its newline
    }
  ],
  "data": {}                                    // rule-specific, for tools
}
```

The finding format is versioned with the package (§18) and published as a JSON Schema. Every finding's text fields are
data: a reporter escapes them for its output format, and the Studio renders them as text, never as HTML.

### 12.2 Reporters

| Reporter | For | Built |
|---|---|---|
| `text` | People: grouped by file, with the source line and a caret | M1 |
| `json` | Tools: `{ format, findings, stats }` | M1 |
| `sarif` | SARIF 2.1.0 (Static Analysis Results Interchange Format), read by GitHub code scanning and other CI viewers | by M4 |
| `github` | `::error file=…,line=…::` lines for workflow annotations. It escapes `%`, `\r` and `\n` in every field, because a finding's message can echo author text, and a deck in a fork's pull request must not be able to inject workflow commands | by M4 |
| `lsp` | Diagnostics plus code actions, one per fix, in the Language Server Protocol's shapes, for an editor integration | by M4 |

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
squadra check [paths…]        lint; --format text|json (sarif|github by M4); --fail-on <severity>
                              --changed (files changed vs HEAD) or --staged (the index, for a pre-commit hook);
                              both mark the run partial (§9.1)
squadra fix [paths…]          apply fixes; --safety safe|suggested|unsafe (unsafe requires --only); --only <rule>;
                              --dry-run (prints the diff)
squadra test [rules…]         strict-compile the rulesets: every rule on its fixtures, every probe; exit 3 on any refusal
squadra rules [--json]        list every rule: id, severity, summary, fixable, language, and any config that turns it off
squadra explain <rule>        print the rule's summary, docs and examples
squadra baseline              write per-file ratchets for today's findings (§9.4)
squadra coverage              files no language claims, and files claimed but ignored (§10)
squadra bench                 the benchmark scenarios (§11.6)
```

`--staged` lints the staged content, not the working tree, so a pre-commit hook checks what will be committed.

## 14. Usage patterns

1. **Lint a string in a browser.** The Studio lints the deck in the editor: `lint(rules, [{ path, text, language }])`,
   with an in-memory cache and a lenient ruleset, on each debounced edit. "Fix all" is `fix(rules, source)`.
2. **An editor.** An LSP integration maps findings to diagnostics and each fix to a code action. `suggested` fixes appear
   as actions and are never applied on save.
3. **CI.** `squadra check` as a full run, so staleness and ratchets are checked. By M4, `--format sarif` uploads to code
   scanning and `--format github` annotates the diff.
4. **A git hook.** `squadra check --staged`. Per-file rules run on staged files only; project rules re-collect them and
   re-decide. Staleness waits for CI's full run.
5. **Adopting it on an old codebase.** `squadra baseline`, then ratchet down.
6. **Writing a rule.** Write the fixtures first, with span markers. Then the rule: declarative once the selector
   language exists, a code rule before that or when a predicate cannot say it. `squadra test <rule>` until it compiles.
7. **Migrating another linter.** Wrap each existing detector as a code rule whose fixes use an engine that speaks the
   old fix format, as `lattice-line` does (§7.2). Move rules one at a time, diffing against the old output (§15.3).
8. **A different domain.** Supply a language (a Segno grammar is the short path) and a ruleset. The learn page's worked
   example is a ruleset for a non-Lattice format (§5.6).

## 15. How Lattice adopts it

### 15.1 What maps to what

| Lattice today | In Squadra |
|---|---|
| A detector function in `lib/authoring/lint-core.js` | A code rule; a declarative rule once the selector language exists (§6) |
| `{ slide, rule, severity, classToken, line, message, fix }` | A finding with a span, `location.slide`, `hint`, `legacy` (§12.1); the legacy-shape adapter rebuilds the old record for consumers that still read it (§15.4) |
| Severity `info` (12 sites in lint-core: 5 literal, 7 conditional) | Severity `info` |
| The `fix:` advice string (214 of them) | `hint` |
| `autofixable` / `replace` / `replaceLine` / the `fixReplacement` switch | A declarative fix (§7.3), or the `lattice-line` engine until the rule moves |
| `applyFix` / `applyAllFixes` (one fix per pass, 500-pass cap) | `fix()` (§7.4) |
| Vocabulary built from manifests in `lib/authoring/lint.js` | `vocab` passed to `compileRuleset` |
| `spark-too-big`, which needs measurements from the Studio's preview | `ctx.measurement()`, fed by `LintOptions.measurements` (§4.1) |
| Host-side filters in `tools/lint-deck.js` (`glyphExemptDeckSet`, `isSubjectFinding`) | Ratchets and waivers (§9) |
| A `checkX(…, errors)` function in `tools/check-ownership.js` | A project rule (§6.6), or a per-file rule when its core detector is declarative |
| The `SANCTIONED_*` allowlists | Waivers, scopes, vocabulary or project rules, by kind (§9.1) |
| `TYPED_GLYPH_BUDGET` and other budget tables | Per-file ratchets (§9.3) |
| `tools/check-lint-coverage.js` (Biome) | Unchanged. `squadra coverage` covers Squadra's own languages |
| Biome | Unchanged |

### 15.2 Where Lattice's rules live

- **Deck rules:** `lib/authoring/rules/` as the `deck` ruleset. They must stay browser-safe, so this folder keeps
  lint-core's no-`fs` rule. The build bundles it into one module for the Studio (§6.1).
- **Repo checks:** `tools/rules/repo/` as the `repo` ruleset, `kind: "gate"`. Node only.
- **The deck language, the `lattice-line` engine and the legacy-shape adapter:** `lib/authoring/squadra/`.

### 15.3 The migration: rule by rule, and a diff that has to run

The owner confirmed on 2026-10-28 that rules migrate one at a time, each gated by its own diff. While a rule waits, it
stays in lint-core and reaches the user through the bridge in §15.4.

For each migrated rule (one with a `legacy` id), a test runs the lint-core rule and the Squadra rule over three corpora
and compares them:

1. **The lint unit tests.** 43 test files today call `lintText` or `lintTextWith`; their inputs are the cases someone
   already thought mattered.
2. **A mutated corpus.** The tracked decks are lint-clean by construction: over all 433 of them, `lintTextWith` reports
   41 findings from 11 rules and no fixable finding (red team, 2026-10-26). So the test injects each rule's legacy bad
   pattern into those decks, at several positions (first slide, last slide, inside a list, beside a fence).
3. **The tracked decks as they are**, to catch a migrated rule that fires where lint-core did not.

It compares the **full legacy record**, field by field through an explicit map: rule, slide, line text (the trimmed
text of the span's first line), severity, message, `classToken`, `didYouMean`, `shapeChange`, `chunkLine`, and whether
the finding is fixable. Then it compares the fixed text.

**The diff must run, not only pass.** A migrated rule that never fires on any corpus has proved nothing, so the test
fails unless the rule fires at least once, and, if it has a fix, applies it at least once.

**A whole-deck diff covers the fix driver.** Because the driver batches fixes, refuses inert edits and refuses shape
changes (§7.2), a second test runs `fix()` and `applyAllFixes` over the mutated corpus and records every difference.
Each difference is either fixed or written into the PR as an intended improvement, with the red team's cases (the
fenced example, the deleted title slide) as the first entries.

When a rule's diff is clean, its lint-core detector is deleted in the same PR, unless something outside the linter
imports it: `lib/components/index.js` imports detectors such as `findInlineTitleBodyLine` for component-manifest validation (`checkCardStyleForms`). Such a
detector moves to a shared kernel that both the Squadra rule and the importer read (HARD RULE #1), never into a copy.

**Progress is measured, so a stalled migration shows.** Each migration PR reports the lint-core line count and the
number of rules still on `lattice-line`. Both only go down. M1 also reports the effort per migrated rule (PR count and
agent tokens) on its first rules, multiplied out to the remaining ones, so the owner sees the real cost of finishing
early. When the last detector is gone, so are `lattice-line`, the bridge and the diff tests.

### 15.4 The bridge: two producers, one driver, one record

Rule-by-rule migration means some rules run in Squadra and the rest in lint-core for a while. Users see one system:

- **One finding list.** Lattice's lint entry point runs the compiled ruleset and `lintTextWith`, drops lint-core's
  findings for every rule that has migrated, and turns the rest into Squadra findings: the span comes from the same
  chunk walk `applyFix` uses (slide plus line text), and each fixable one carries a `lattice-line` fix.
- **One fix driver.** "Fix all" and `lint:deck --fix` call `fix()` over that merged list, so every fix, migrated or
  not, gets the driver's checks (§7.4). Legacy findings come from a producer outside the ruleset, so the registration
  refusals of §8 do not apply to them; that is stated, not hidden, and they gain those refusals one by one as they
  migrate.
- **One record for today's consumers.** A legacy-shape adapter turns Squadra findings back into
  `{ slide, rule, severity, classToken, line, message, fix, … }` for every consumer that reads that shape, until each
  moves:

| Consumer | Reads | Moves when |
|---|---|---|
| `docs/src/playground/editor-diagnostics.js` | `line` text, to place squiggles; `didYouMean` for the quick-fix button label | it reads `span` (offsets make this exact) |
| `docs/src/components/studio/Editor.tsx` | `lintTextWith` with a vocab | it calls Lattice's lint entry point |
| `docs/src/components/studio/StudioShell.tsx` | `${slide}:${rule}:${message}` as a fix-state key; rule id `capacity-scale` | it keys on `rule` + `span` |
| `docs/src/components/studio/coach/coach-core.ts`, `coach/FindingCard.tsx` | messages, severity, slide (core); rule id (card) | it reads Squadra findings |
| `lattice.js` (lines 1115 and 1152) | `shapeChange` | the field moves to `data.shapeChange` |
| `tools/lint-deck.js`, `tools/score-variance.js` | rule id `typed-shape-glyph`; host filters | they compare `legacy` ids |
| `lib/conformance/kinds/*.contract.js` | finding shape | they read Squadra findings |
| `lib/components/index.js` | imported detectors | §15.3: detectors move to shared kernels |

Rule ids keep working: the adapter writes the `legacy` id into `rule`, so `'capacity-scale'` comparisons keep matching
while `deck/capacity-scale` is the Squadra id.

### 15.5 Milestones as they touch Lattice

| Milestone | Lattice work | Depends on |
|---|---|---|
| M1a | Core, fix driver, `edits` engine, refusals, waivers, reference YAML; the bridge (§15.4) with `lattice-line`, so "Fix all" goes through the driver and gains the structure check | nothing |
| M1b | `lattice-deck` and the reference Markdown; the first migrated deck rules (the ~23 near-mechanical ones) | Segno deck pipeline P2 (blocks, slides), then P3 (front matter and directive islands) |
| M2 | Waivers adopted: `check-ownership.js` reads `squadra.waivers.json` through the core's waiver functions (which need no language) while its checks are still its own; reference JSON | M1a |
| M3 | Ownership checks move: reference CSS, the JS/TS adapter, project rules, the cache, workers; profile `check-ownership.js` first (§6.6) | M2 |
| M4 | The generic surface (§2.3), learn and demo pages | M3 |

M1 also carries two acceptance rows: the Studio bundle delta against `lintCoreGz` in `docs/route-budget.json` (about 11 KB
gz between its soft and hard limits today; exceeding the budget is put to the owner), and the measured strict-compile
cost (§8.2).

### 15.6 What does not change without the owner

These need the owner's explicit sign-off, per CLAUDE.md's second filter:

- **The CI and hook contract.** Squadra replaces commands that already run (`lint:deck`, `lint:deck:all`,
  `check:ownership` inside `build:check`). Any new job, step or hook goes to the owner first.
- **The HARD RULES whose wording changes.** #7 (parent note §9) and, as their lists move, #3, #20, #22, #24, #26 and #29
  (§9.1).
- **The Studio's route budget.** Measured in M1 (§15.5). The owner decides any increase.
- **Export bytes.** Anything that changes what a deck exports, such as treating a new comment form as a pragma (§5.5).

## 16. Security model

- **Declarative rulesets are data.** No `eval`, no regex, selectors parsed by a Segno grammar (linear by construction),
  templates limited to a fixed set of pure functions, names like `__proto__` refused (§8), and every rule held to an op
  budget and a findings cap. A declarative ruleset from an untrusted source can produce wrong findings. It cannot run
  code or read files. It is designed not to be able to hang the process, but that is a target M1 measures on hostile
  trees (§11.6), not yet a proven property, and in the browser there is no backstop beyond the op budget.
- **An untrusted ruleset cannot edit silently.** A ruleset marks its own fixes `safe`, and "Fix all" applies `safe`
  fixes. So a ruleset loaded with `trust: 'untrusted'` has every fix capped at `suggested`: a person sees each one.
  Lattice also never applies a fix that inserts markup into a deck without the same sanitizers its other markup goes
  through (HARD RULE #22).
- **Code rules are code.** Loading one is the same trust decision as installing a dependency. The docs say so.
- **The core never writes.** `fix()` returns text. The Node host writes files: it resolves symbolic links first and
  refuses any real path outside the project root, writes the new content into the existing file (so a link stays a
  link), and restores the file's line endings and BOM (§5.7).
- **Fixes never touch inert ranges** unless the rule opted into them (§7.4), so a fix cannot rewrite an example inside a
  code fence.
- **Finding text is data.** Reporters escape it for their format (§12.2), and the Studio shows it as text.

## 17. How the library is tested

| Layer | Tests |
|---|---|
| Edit kernel | Property tests: random non-overlapping edit sets give the same result in any order; edits in one group apply in array order; `plan` never accepts an overlap; `mapOffset` round-trips; `apply` on an empty plan is the identity |
| Selectors | A fuzzer feeds random selectors to the selector parser; parse time stays linear; matching agrees with a naive reference matcher; cost stays within target on deep trees |
| Driver | On every fixture: fixing twice equals fixing once; the shape check catches a deliberately slide-deleting fix; a non-resolving fix is reverted and stops; determinism at 1 and N workers, cold and warm cache |
| Languages | `fromSegno` over Segno's own fuzz corpus; CR, CRLF, mixed and BOM variants (§5.7); for `lattice-deck`, the deck pipeline's own acceptance tests (§5.5) |
| Rules | `squadra test` over every ruleset; for Lattice, the three-corpus migration diff and the whole-deck fix diff (§15.3) |
| Reporters | Golden output; the `github` reporter on messages containing `%`, `\r`, `\n` and `::` |
| Speed | The benchmark scenarios (§11.6), with a committed baseline |

## 18. Stability and versioning

- **0.x** until Lattice has fully migrated. A minor version may break the API, as with Segno.
- **Manifest files carry `format`**, as Lattice's plugin manifests carry `format` and `api`. A loader refuses a format
  it does not know, with a message naming the version it supports.
- **Stable first:** the finding format, the manifest formats, `lint`, `fix` and `compileRuleset`.
  **Experimental first:** project rules, the selector language, and the LSP reporter.
- **Retired rule ids are never reused,** the convention Lattice applies to HARD RULE numbers.

## 19. Documentation deliverables

Squadra gets the set every library in the family has:

| Deliverable | Where | Contents |
|---|---|---|
| README | `docs/src/lib/squadra/README.md` | Install, what is stable, write a rule, write a language, the four interfaces and their reference implementations, fix engines, the guarantee and its limits, speed (with measurements), first user: Lattice, build, license. The Italian etymology under the title. |
| Learn page | `docs/src/content/catalog/libraries/squadra.md` | The catalog front matter (`kind`, `name`, `order`, `promise`, `intro`, `group`, `inLattice`, `useWhen`, `mark`, `facts`, `reference`) and the sections the other entries use: The problem · The idea · How to use it · Where else it fits · How Lattice uses it · What it doesn't do |
| Demo page | `docs/src/pages/libraries/squadra/index.astro` | Live sections: write a rule and watch it refuse until its examples pass; fix all, with conflicting fixes shown and resolved, and a slide-deleting fix caught by the shape check; try to make it slow (a hostile input, timed in the browser); first user: Lattice |
| Mark | `docs/public/squadra-mark.svg` | A set-square |
| Generated rule docs | built from each ruleset | One page per rule: summary, docs, the fixtures rendered as examples, fixable or not and why |

The demo and learn pages are website changes, so each ships with `tools/screenshot.js` evidence at 1440, 820 and 390 px
(CLAUDE.md quality bar).

## 20. What Squadra does not do

- **Format code.** A formatter can be a `whole-file` fix engine. Squadra is not one.
- **Type-check.** A rule may read the TypeScript API through a language adapter. Squadra does not model types.
- **Replace Biome** for JavaScript style. Biome stays.
- **Write parsers.** Languages wrap Segno grammars, the Segno deck pipeline or existing parsers.
- **Run untrusted code safely.** Code rules are trusted code (§16).
- **Ship an LSP server.** It ships the `lsp` reporter format by M4. A server comes later, if an editor integration
  needs it.

## 21. Open decisions

| # | Decision | Options | Recommendation | Default if no answer |
|---|---|---|---|---|
| 1 | Manifest format | JSON with `$schema` · YAML | JSON: Lattice's component and plugin manifests are JSON, it needs no parser in the browser, and the schemas give editors completion | JSON |
| 2 | Selector syntax | CSS-like (§6.4) · a JSON tree pattern · ast-grep-style code patterns | CSS-like: people already read it, and it parses in linear time | CSS-like |
| 3 | Whether a code rule's fixtures may live inline in the `.rule.js` | yes · fixtures file only | Fixtures file only: one format to load, and the examples double as docs | Fixtures file only |

**Settled.**

- 2026-10-26: the fix engine and the parser are interfaces inside Squadra with reference implementations, not separate
  named libraries (§2.2). An earlier draft proposed a separate fix-engine library named Rettifica.
- 2026-10-28: `lattice-deck` builds on the Segno deck pipeline's document model (§5.5).
- 2026-10-28: rules migrate one at a time, each gated by its own diff (§15.3).
- 2026-10-28: the generic surface is designed now and built by M4 (§2.3).

## 22. What the adversarial review changed

On 2026-10-26 a red team, a Munger inversion and an independent checker reviewed this design (HARD RULE #25). What they
found, and where it landed:

| Finding | Lens | Landed in |
|---|---|---|
| A safe `delete: line` fix deleted the title slide when it removed the only front-matter key; the reparse check could never fire on Markdown. The same bug is live in `applyAllFixes` today | red team | §7.3, §7.4 step 5 (shape check), §1 fixtures; the live bug is `followups.d/2901-p1-…` and its own PR |
| The migration diff exercised almost nothing: 0 fixable findings across 433 tracked decks | red team | §15.3: three corpora, a must-fire rule, the full legacy record |
| A fix that does not resolve its finding was kept and re-applied each pass | red team | §7.4 step 5, §8 `fix-did-not-resolve`, `fix-grew` |
| Waivers suppressed every match; glob waivers could turn a rule off silently | red team | §9.1: counted, one file per waiver |
| Configuration and inline comments bypassed reviewed allowlists | red team | §6.2 `suppressible`, §9.2, §10 reasons, §9.5 |
| Cache keys missed imported kernels, language versions and vocabulary | red team | §11.3, §8.2 |
| An untrusted ruleset could mark a beacon-inserting fix `safe` | red team | §16 trust, §7.4 step 1 |
| The deck token layer disagreed with markdown-it (lists, `- - -`, `~~~`, HTML blocks, per-heading slides) | red team, inversion | §5.5: the Segno deck pipeline's model, held to markdown-it by the pipeline's own acceptance, as the owner decided |
| Inline suppressions in a deck would ship as speaker notes | checker | §5.5, §9.2 |
| Unmigrated rules had no way into `fix()` | checker | §15.4 the bridge |
| M2's waiver adoption needed languages that arrive in M3 | checker | §15.5 M2 |
| Types used but never defined; a dozen internal contradictions | checker | §4.1 and throughout |
| Today's consumers of the finding shape were missing from the migration | checker, red team | §15.4 |
| Not every `SANCTIONED_*` list is a waiver; more HARD RULES are affected than #22 | checker | §9.1 |
| Partial runs would report every waiver stale | checker, red team | §9.1, §13 |
| Line endings and the BOM had no owner | red team | §5.7 |
| Two systems forever; generic scope before Lattice value; bundle size; compile-time cost | inversion | §15.3 progress measures; §2.3 scope; §15.5 acceptance rows; §4 lenient mode |
| `check-ownership.js`'s time may not be file reads | inversion | §6.6: profile before M3 |
