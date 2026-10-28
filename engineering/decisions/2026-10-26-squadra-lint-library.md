---
status: proposed
summary: >
  Lattice's linting is four unconnected systems whose findings carry no source spans, so fixes re-find their line by
  text and most rules can only advise. This note proposes Squadra, a general-purpose lint-and-fix library in the
  family of Segno and Cadenza (no dependencies beyond a sibling library, no DOM, no fs in the core, language parsers as plugins), built in four
  releasable milestones with Lattice as its first user. Its guarantee is that it refuses a rule that cannot prove it
  fires, fixes and converges on its own examples. The owner chose the library over a kernel on 2026-10-26 and chose the
  name. On 2026-10-28, after an adversarial review, the owner decided that Lattice's deck language reads the Segno deck
  pipeline's document model, that rules migrate one at a time, and that the generic surface lands by M4.
---

# Squadra: a lint-and-fix library (2026-10-26)

Status: proposed; revised 2026-10-28 after the adversarial review (§11). No code changes. The census behind the numbers is `2026-10-26-squadra-lint-library/census.md`. The
full design (API, the language and fix-engine interfaces with their reference implementations, manifest files, configuration, how Lattice adopts it) is
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
   that a fix is idempotent or leaves the file parseable. Ordering is implicit: `retired-logo-key` depends on its merge line
   being rewritten before the old lines are deleted (`lint-core.js:8915`), which the rule guards by hand (`mergeDone`).
   And nothing checks that a fix keeps the deck's slides: deleting the last front-matter key leaves an empty `---`/`---`
   block that swallows the title slide, a live bug the adversarial review found
   (`followups.d/2901-p1-fix-all-deletes-title-slide-when-front-matter-empties.md`).
3. **Every rule rebuilds the plumbing.** Each rule masks code fences and hidden comments, handles CRLF, and reads front
   matter on its own (`stripFencedCode`, `withoutCodeBlocks`, `withoutCodeCommentMarkers`, `\r?\n`). The comments in the file record bugs where one
   rule missed one of these.
4. **"Allowlist with a justification that fails when stale" is hand-built.** That is a sound pattern, and 33 checks re-implement it
   across 35 lists. The census found 8 allowlists with no staleness check at all (`CO_OWNED_LAYOUTS`,
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
shape. It lives at `docs/src/lib/squadra/` as one workspace package. Languages and fix engines are interfaces it
defines; it ships reference implementations as separate entry points, so the core imports no parser.

### 5.2 The guarantee

Segno's headline is that it refuses a grammar it cannot prove linear. Squadra refuses a rule it cannot prove works.
All three checks run when a rule is registered:

1. **The rule fires on its own bad example and stays quiet on its good one.** A rule without examples does not load.
   This gives Lattice's own rules the guarantee that `check-lint-coverage.js`'s teeth probe gives Biome, as a property of the library.
2. **The rule's fix converges on its own examples.** The fix must produce the `fixed` example, must resolve its own
   finding, must not keep growing the text, and must keep the document's shape (for a deck: the same slides and front
   matter). A parse check alone would never fire on Markdown, which has no parse errors.
3. **The rule has a work budget and a findings cap.** This follows the parser bake-off's finding
   (`2026-09-28-parser-library-bakeoff.md`) that hostile input makes every general library go super-linear on the
   context-sensitive grammars. Whether a declarative rule can be made to hang is a target M1 measures, not a claim.

The guarantee proves a rule is alive and precise on its own examples; it does not prove the rule right on inputs its
author did not write. Lattice's migration therefore also diffs every rule against the old one on inputs nobody wrote
for it (design §15.3).

### 5.3 The model

- **Finding:** `{rule, severity, span: {from, to}, message, hint, data, fixes[]}`. Offsets, never line text.
- **Fix:** `{engine, safety: 'safe' | 'suggested' | 'unsafe', description, edits: [{from, to, text}]}`. This is the LSP and
  ESLint edit model. A rule can state the common "swap this token for that one" fix declaratively, with captures from
  the match.
- **Rule:** data plus an optional function. A declarative rule says what to select and what to report. A computed rule
  is a function `check(ctx)` that emits findings with spans, with query helpers on `ctx` so it is as short as a
  declarative one. Both forms are first-class, because 44% of deck rules need code.
- **Language plugin:** `parse(text) → tree`, node kinds, the "inert" ranges (code fences, comments, strings) supplied
  once, and a text-to-offset map. Any Segno grammar becomes a language through one adapter. Lattice's deck language reads
  the Segno deck pipeline's document model (`2026-10-22-segno-deck-pipeline.md`), the one parse the renderer and the
  Studio will also read, so lint and render agree by construction. JS and TS use
  acorn or the TypeScript API (both already used by the ownership checks). Writing a new parser is out of scope.
- **Project scope:** a project rule declares the files it reads (globs) and splits into a per-file `collect` and a
  cross-file `decide`. The engine
  re-runs a rule only when its declared inputs change. This is the main performance lever, and it is what the 75 R
  checks need.
- **Waivers and ratchets:** `{rule, target, count, reason, expires?}` records with built-in stale detection, and
  per-file ratchets. They replace most of the 35 hand-built allowlists and close the 8 that have no staleness check.
- **Fix engine:** an interface, with a reference implementation in Squadra; every engine lowers its fix to text edits, and Lattice's
  current line-based fixers become one engine. The driver collects the fixes, drops overlapping edits deterministically, applies the rest in one pass, re-parses,
  re-runs the touched rules, and caps the passes. It offers dry-run, diff, and flags per rule and per safety grade.
  The Studio's "Fix all" and the CLI's `--fix` call the same function.
- **Output:** one JSON format first; SARIF, GitHub annotations and editor code actions by M4. Inline suppression
  comments are designed for languages with comments and built by M4; decks have none, because a comment in a deck is a
  speaker note.

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

Each milestone ships on its own and Lattice adopts it before the next starts. Rules migrate one at a time, each gated by
its own diff against lint-core (owner, 2026-10-28). Until a rule moves, it reaches users through a bridge that puts
every finding through Squadra's one fix driver (design §15.4). The full table, with dependencies, is design §15.5.

| | Delivers | Lattice adopts | Evidence |
|---|---|---|---|
| M1a | Findings with spans, the edit kernel, the fix driver with its shape check, the `edits` engine, the registration refusals, waivers, reference YAML | The bridge: "Fix all" and `lint:deck --fix` go through the driver, which stops the live slide-deleting bug | The whole-deck fix diff; a benchmark scenario (#19); the Studio bundle delta against `lintCoreGz` |
| M1b | `lattice-deck` and the reference Markdown, on the Segno deck pipeline | The ~23 near-mechanical deck rules | The three-corpus migration diff; lint-core line count and rules on `lattice-line`, both falling; effort per rule |
| M2 | Waivers adopted, reference JSON | `check-ownership.js` reads `squadra.waivers.json`, starting with the 8 lists that have no staleness check | Lists moved; staleness caught in all of them |
| M3 | Reference CSS, the JS/TS adapter, project rules, the cache, workers | Ownership checks, after profiling `check-ownership.js` | Wall-clock against the 21.8 s baseline |
| M4 | The generic surface: the outside-domain fixture, inline suppressions, SARIF/GitHub/LSP output, the selector language (sooner if ~15 rules share a shape); learn and demo pages, README, publish | Nothing new | The docs-site pages at three widths (CLAUDE.md quality bar) |

**M1b waits on the deck pipeline.** `lattice-deck` needs the pipeline's block pass (its phase P2) and its front-matter
and directive islands (P3). As of 2026-10-28, `main` has the pipeline's census harness (P0) and native-run code
generation (G6), not `deckModel`. M1a does not need the pipeline and can start now.

## 7. Proving it is generic

"General-purpose" is a claim about Lattice's own shapes until something else uses it. Lattice already supplies three
languages, two consumer kinds (per-file and cross-file) and two runtimes (Node and browser), which is more range than
most libraries have at the start. By M4, a small outside ruleset joins as a conformance fixture, for example a
Dockerfile or an OpenAPI YAML file, and the learn pages use it as their worked example. If that fixture needs a special
case in the core, the core is not generic yet.

## 8. Alternatives considered

| Option | Why not |
|---|---|
| **ast-grep** for syntactic rules | Covers at most the declarative half of deck lint. It has no model for cross-file checks, slide semantics or the browser constraint. It would be a fourth system, with a binary dependency. |
| **ESLint v9 language plugins** | The language-plugin and range-edit design is sound and Squadra borrows from it. It is JS-config-centric and slower, and the relational checks do not fit. |
| **Biome GritQL plugins** | Declarative, but limited to JS, CSS and JSON. |
| **A kernel inside the repo, no library** | The owner chose the library on 2026-10-26: the data points support it and Lattice's other libraries set the bar. |
| **Fixer only, no engine** | Becomes M1a. It is the first milestone, not a separate choice. |
| **Wrap every lint-core rule at M1** (the inversion's proposal) | One system from day one, but the owner chose rule-by-rule migration on 2026-10-28; the bridge (design §15.4) gives users one fix driver either way. |
| **Deck language on markdown-it's tokens** (the red team's and inversion's proposal) | Agrees with the renderer today, but the owner decided the deck pipeline is Segno's (2026-10-22) and that `lattice-deck` reads it (2026-10-28). |

## 9. Rules this changes

- **HARD RULE #7 (`CLAUDE.md`).** Today it reads "Edit lint rules in `lib/authoring/lint-core.js` only — pure, fs-free,
  shared by CLI / `validate()` / browser. Never duplicate." The intent is a single source for lint rules. During the
  strangler migration a rule lives in exactly one place: `lint-core.js` until it moves, then Squadra's ruleset. Proposed
  wording for M1b: "Edit deck lint rules in the one place they live — the Squadra deck ruleset
  (`lib/authoring/rules/`) once a rule has moved, `lib/authoring/lint-core.js` until then. Never in both. Both places
  stay pure, fs-free, and shared by CLI, `validate()` and browser." This note does not edit `CLAUDE.md`; the wording
  lands with M1b, after the owner has seen it.
- **HARD RULE #15** (reuse before building). Squadra is the reuse target for new lint and check tooling once M2 lands.
  Until then new rules go where the rule above says.
- **`tools/check-ownership.js` allowlists.** New `SANCTIONED_*` lists stop being added once M2 lands. Most become
  waivers; census lists, scope lists and contract tables become rules, scopes and vocabulary (design §9.1). HARD RULES
  #3, #20, #22, #24, #26 and #29 name lists that move, so each rule's wording changes in the PR that moves its list, and
  that PR puts the wording to the owner.

## 10. Open items

1. **Name check.** Squadra is chosen. Availability on npm and trademark were not checked.
2. **Design §21's three defaults:** JSON manifests, CSS-like selectors, fixtures in a separate file only.
3. **Where the unclassified ~70 rule ids fall.** They are read in M1b, when the first families migrate.
4. **Whether the Studio's browser bundle takes Squadra directly** or through the existing `authoring-core:build` step.
   Decided in M1a by bundle size against `docs/route-budget.json`.
5. **Performance targets.** Set from the M1a benchmark.
6. **The live "Fix all" bug.** It ships in its own PR now, independent of Squadra
   (`followups.d/2901-p1-fix-all-deletes-title-slide-when-front-matter-empties.md`).

## 11. The adversarial review (2026-10-26)

A red team, a Munger inversion and an independent checker reviewed this note and the design (HARD RULE #25). The red
team demonstrated the slide-deleting fix on the real engine and measured that the tracked decks give the migration diff
nothing to compare. The checker found a missing path for unmigrated rules and that deck suppressions would ship as
speaker notes. The inversion argued for wrapping every rule at M1 and against generic scope before Lattice value. What
each finding changed is design §22. The owner's three decisions of 2026-10-28 are recorded in §6 and design §21.
