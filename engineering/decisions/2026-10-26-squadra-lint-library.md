---
status: proposed
summary: >
  Lattice's linting is four unconnected systems whose findings carry no source spans, so fixes re-find their line by
  text and most rules can only advise. This note proposes Squadra, a general-purpose lint-and-fix library in the
  family of Segno and Cadenza (no dependencies beyond a sibling library, no DOM, no fs in the core, language parsers as plugins), built in four
  releasable milestones with Lattice as its first user. Its guarantee is that it refuses a rule that cannot prove it
  fires, fixes and converges on its own examples. The owner chose the library over a kernel on 2026-10-26 and chose the
  name; the milestones, the guarantee and the rewrite of HARD RULE #7 are for the owner to confirm in review.
---

# Squadra: a lint-and-fix library (2026-10-26)

Status: proposed. No code changes. The census behind the numbers is `2026-10-26-squadra-lint-library/census.md`. The
full design (API, language plugins, the Rettifica fix engine, manifest files, configuration, how Lattice adopts it) is
`2026-10-26-squadra-lint-library/design.md`. Where this note's §5 summary and the design differ, the design wins.

## 1. The answer

1. **The problem.** Lattice has four lint systems with no shared data model. A finding does not say where in the file it
   is, so the fixer finds its line again by matching text. Of 156 deck rules, 44 can fix themselves. The other 112 tell
   the author what to do. Of 104 repo checks, none can fix anything.
2. **The proposal.** Build one library, **Squadra** (Italian: the set-square, and *squadrare*, to square up and look
   over), under `docs/src/lib/squadra/`, in the same family as Segno. It is general-purpose and Lattice is its first user.
3. **The guarantee.** Squadra refuses a rule it cannot prove works: the rule must fire on its own bad example, stay quiet
   on its good one, and its fix must converge. A rule is also refused if it has no work budget.
4. **The order.** Four milestones (§6). Each one ships and Lattice adopts it before the next starts.

## 2. What exists, measured

Measured on 2026-10-26 on the cloud sandbox. The wall-clock figures are one run each, so treat them as orders of
magnitude, not benchmarks.

| System | Reads | Size | Finding shape | Fixes | Wall clock |
|---|---|---|---|---|---|
| Biome | JS, JSON | third party | its own | its own | 7.2 s (`npx biome check`) |
| `lib/authoring/lint-core.js` | deck markdown, front matter | 10,063 lines, 155 rule ids (+1 in `bare-row-pill.js`) | `{slide, rule, severity, classToken, line, message, fix}` | 214 `fix:` strings, 44 machine fixes | 3.9 s (`lint:deck:all`) |
| `tools/check-ownership.js` | CSS, JS, JSON, docs | 14,414 lines, 104 `check*` functions | a string pushed to `errors[]` (347 sites) | none | 21.8 s |
| 17 other `tools/check-*.js` tools (render, contrast, fonts, CSS values) | rendered output and source | scattered | ad hoc | none | not measured |

`check-ownership.js` calls `readFileSync` in about 120 places and shares no parse or file cache between checks. It declares 35
`SANCTIONED_*` allowlists (36 counting `SANCTIONED_TOKEN_CONTRACTS`, imported from `lib/tokens/contracts.js`), and the word "stale" appears on 173 lines of it.

## 3. The problems

1. **A finding has no span.** `applyFix` in `lib/authoring/lint-core.js` locates the line to change by matching the
   finding's `line` text inside the finding's slide chunk. If the same text appears twice in a slide, or inside a code
   fence the rule forgot to skip, the fixer can edit the wrong one. `applyAllFixes` then applies one fix, re-lints the
   whole deck, and repeats, up to 500 passes.
2. **Fixes do not compose.** Nothing checks that two fixes overlap. Nothing grades a fix safe or unsafe. Nothing checks
   that a fix is idempotent or leaves the file parseable. Ordering is implicit: `retired-logo-key` only works because its
   merge line is rewritten before the old lines are deleted (`lint-core.js:8915`), and the one-fix-per-pass loop hides
   that dependency.
3. **Every rule rebuilds the plumbing.** Each rule masks code fences and hidden comments, handles CRLF, and reads front
   matter on its own (`stripFencedCode`, `withoutCodeBlocks`, `withoutCodeCommentMarkers`, `\r?\n`). The comments in the file record bugs where one
   rule missed one of these.
4. **"Allowlist with a justification that fails when stale" is hand-built.** That is a sound pattern, and it exists as 35
   separate implementations. The census found 8 allowlists with no staleness check at all (`CO_OWNED_LAYOUTS`,
   `VARIANT_DECL_IGNORE`, `SINGLETON_TAGS` among them).
5. **Rules are not data.** You cannot list, document, disable, ratchet or self-test them uniformly.
   Nothing guarantees a deck rule or an ownership check can still fire.
   (`tools/check-lint-coverage.js` proves this from the outside for Biome alone, with a teeth probe; Lattice's own rules
   have no equivalent.)
6. **Cost.** Each check parses its own files. Nothing is cached between runs.

This is a recurring cost, not a defect: the gates catch real bugs. The cost shows up when someone adds the 157th rule,
or when someone wants to trust `--fix`.

## 4. What the census says

Full table: `2026-10-26-squadra-lint-library/census.md`. The agent that produced it classified each rule by what its
detector must read. **D** (declarative) reads one line, span, key, declaration, import or field plus a static
vocabulary. **C** (computed) reads a second piece of the deck, a count, or a measurement. **R** (relational) reads other
files or manifests, or checks an allowlist against the tree. Where a rule mixes classes, the agent took the hardest.

| | Deck lint (156) | Repo checks (104) |
|---|---|---|
| D | 87 (56%) | 23 |
| C | 69 (44%) | 6 |
| R | 0 | 75 |
| Machine fix | 44 | 0 |
| Human-text fix only | 112 | 104 |

- **Deck lint needs a code escape hatch for 44% of its rules.** A rule language alone covers a bit more than half.
- **Cross-file rules dominate the repo checks.** For 20 of the 75 R checks the per-item detector is D, and only the
  stale-allowlist check needs the whole tree. So the project-scope features (reading other files, caching on what a rule
  reads, waivers) are the value there, not the rule syntax.
- **Cheap wins.** 53 D rules have no machine fix. The agent found about 23 that are near-mechanical: 11 print the exact
  replacement in their fix text (`caption-key-retired`, `tag-alias`, `callout-spelling`), 6 are siblings of rules that
  already suggest a fix but never call `withTokenSuggestion`, and 6 delete a line or token (`autosplit-retired`). Two
  rules (`bad-render-target-value`, `nested-render-target-key`) refuse a fix on purpose, because a guessed fix can switch
  an export target on. They stay unfixed.
- **What the census did not cover.** About 70 deck-lint ids were not classified: 31 `hub-spoke-*` ids
  (`lib/core/hub-spoke-model.js`), 19 `flowchart-*` ids (`lib/core/flowchart-grammar.js`), ids built at runtime
  (`${kind}-literal`, `unknown-${key}`), and 18 more in `lib/authoring/review-core.js`. About 10 ownership checks had arms
  the agent did not read in full. The D/C line for rules that read adjacent lines is the agent's judgment; a looser line
  moves about 8 rules from C to D.

## 5. Squadra

### 5.1 What it is

A library, not a kernel. Segno is the precedent: general-purpose, framework-free, zero-dependency, no DOM, with Lattice
as "first user", an Italian name with a one-line etymology, a README that teaches, and a demo. Squadra follows that
shape. It lives at `docs/src/lib/squadra/` as a workspace package, with language plugins as sibling packages so the core
imports no parser.

### 5.2 The guarantee

Segno's headline is that it refuses a grammar it cannot prove linear. Squadra refuses a rule it cannot prove works.
All three checks run when a rule is registered:

1. **The rule fires on its own bad example and stays quiet on its good one.** A rule without examples does not load.
   This gives Lattice's own rules the guarantee that `check-lint-coverage.js`'s teeth probe gives Biome, as a property of the library.
2. **The rule's fix converges on its own examples.** The fix edits must not overlap, applying them twice must change
   nothing the second time, and the result must still parse.
3. **The rule has a work budget.** A hostile input cannot hang a run. This follows the parser bake-off's finding
   (`2026-09-28-parser-library-bakeoff.md`) that hostile input makes every general library go super-linear on the context-sensitive grammars.

### 5.3 The model

- **Finding:** `{rule, severity, span: {start, end}, message, data, fixes[]}`. Offsets, never line text.
- **Fix:** `{edits: [{start, end, text}], safety: 'safe' | 'suggested' | 'unsafe', description}`. This is the LSP and
  ESLint edit model. A rule can state the common "swap this token for that one" fix declaratively, with captures from
  the match.
- **Rule:** data plus an optional function. A declarative rule says what to select and what to report. A computed rule
  is a function `check(ctx)` that emits findings with spans, with query helpers on `ctx` so it is as short as a
  declarative one. Both forms are first-class, because 44% of deck rules need code.
- **Language plugin:** `parse(text) → tree`, node kinds, the "inert" ranges (code fences, comments, strings) supplied
  once, and a text-to-offset map. Any Segno grammar becomes a language through one adapter, and Lattice's deck language
  is built on Segno's Markdown grammar plus the slide and front-matter kernels the engine already uses. JS and TS use
  acorn or the TypeScript API (both already used by the ownership checks). Writing a new parser is out of scope.
- **Project scope:** a rule declares the files and facts it reads (globs, manifests, other rules' output). The engine
  re-runs a rule only when its declared inputs change. This is the main performance lever, and it is what the 75 R
  checks need.
- **Waivers and ratchets:** `{rule, target, reason, expires?}` records with built-in stale detection and budget ratchets.
  They replace the 35 hand-built allowlists and close the 8 that have no staleness check.
- **Fix engine (Rettifica, a proposed name):** pluggable; every engine lowers its fix to text edits, and Lattice's
  current line-based fixers become one engine. The driver collects the fixes, drops overlapping edits deterministically, applies the rest in one pass, re-parses,
  re-runs the touched rules, and caps the passes. It offers dry-run, diff, and flags per rule and per safety grade.
  The Studio's "Fix all" and the CLI's `--fix` call the same function.
- **Output:** one JSON format, SARIF for CI annotations, and editor code-action output. Inline suppression comments are
  part of the design because any outside user will expect them.

### 5.4 Speed

Speed comes from structure: parse each file once, walk the tree once and dispatch to rules by node kind, cache by
content hash plus ruleset hash, shard files across worker threads, and lint only changed files in hooks. No target
multiple is promised here. M1 adds a benchmark (HARD RULE #19) and the target is set from it. The baseline to beat is in
§2.

### 5.5 What Squadra does not do

- It does not write parsers.
- It does not replace Biome for JS style. Biome stays a producer behind an adapter into the unified finding format.
  Squadra takes the project-specific rules Biome cannot express, such as the checks built on the TypeScript API.
- The core never reads the filesystem and never touches the DOM, so the same rules run in the browser. `lint-core.js`
  is browser-safe today and Squadra keeps that property.

## 6. Milestones

Each milestone ships on its own and Lattice adopts it before the next starts. Lattice migrates by strangling:
`lint-core.js` keeps working while Squadra takes rules over a family at a time.

| | Delivers | Lattice adopts | Evidence |
|---|---|---|---|
| M1 | Findings with spans, the edit model, the fix engine, the three registration refusals, the deck-markdown language plugin | The ~23 near-mechanical deck rules, the Studio's "Fix all" and `lint:deck --fix` | Before/after fix counts; a benchmark scenario (#19); a non-Lattice fixture (§7) |
| M2 | Project scope, waivers, ratchets | The `SANCTIONED_*` allowlists, starting with the 8 that have no staleness check | Count of allowlists moved; staleness now caught in all of them |
| M3 | CSS and JS language plugins, the cache, workers | The ownership checks whose core detector is D (43 by the census) | Wall-clock for `check-ownership` against the 21.8 s baseline |
| M4 | Learn pages, demo, README, publish | Nothing new | The docs-site pages at three widths (CLAUDE.md quality bar) |

## 7. Proving it is generic

"General-purpose" is a claim about Lattice's own shapes until something else uses it. Lattice already supplies three
languages, two consumer kinds (per-file and cross-file) and two runtimes (Node and browser), which is more range than
most libraries have at the start. M1 also adds a small outside ruleset as a conformance fixture, for example a
Dockerfile or an OpenAPI YAML file, and the learn pages use it as their worked example. If that fixture needs a special
case in the core, the core is not generic yet.

## 8. Alternatives considered

| Option | Why not |
|---|---|
| **ast-grep** for syntactic rules | Covers at most the declarative half of deck lint. It has no model for cross-file checks, slide semantics or the browser constraint. It would be a fourth system, with a binary dependency. |
| **ESLint v9 language plugins** | The language-plugin and range-edit design is sound and Squadra borrows from it. It is JS-config-centric and slower, and the relational checks do not fit. |
| **Biome GritQL plugins** | Declarative, but limited to JS, CSS and JSON. |
| **A kernel inside the repo, no library** | The owner chose the library on 2026-10-26: the data points support it and Lattice's other libraries set the bar. |
| **Fixer only, no engine** | Becomes M1. It is the first milestone, not a separate choice. |

## 9. Rules this changes

- **HARD RULE #7 (`CLAUDE.md`).** Today it reads "Edit lint rules in `lib/authoring/lint-core.js` only — pure, fs-free,
  shared by CLI / `validate()` / browser. Never duplicate." The intent is a single source for lint rules. During the
  strangler migration a rule lives in exactly one place: `lint-core.js` until it moves, then Squadra's ruleset. Proposed
  wording for M1: "Edit deck lint rules in the one place they live — the Squadra deck ruleset once a rule has moved,
  `lib/authoring/lint-core.js` until then. Never in both." This note does not edit `CLAUDE.md`; the wording lands with
  M1, after the owner has seen it.
- **HARD RULE #15** (reuse before building). Squadra is the reuse target for new lint and check tooling once M2 lands.
  Until then new rules go where the rule above says.
- **`tools/check-ownership.js` allowlists.** New `SANCTIONED_*` lists stop being added once M2 lands. Waivers replace
  them. HARD RULE #22 names three of these lists (and `DOC_STYLE_SINK_ROOTS`), so M2 updates that rule's wording too.

## 10. Open items

1. **Name check.** Squadra is chosen. Availability on npm and trademark were not checked.
2. **Rule syntax.** The selector or pattern language for declarative rules is open. The census suggests the escape
   hatch carries most of the weight, so the syntax can wait until M1 shows which shapes repeat.
3. **Where the unclassified ~70 rule ids fall.** They are read in M1, when the first families migrate.
4. **Whether the Studio's browser bundle takes Squadra directly** or through the existing `authoring-core:build` step.
   Decided in M1 by bundle size against `docs/route-budget.json`.
5. **Performance targets.** Set from the M1 benchmark.
