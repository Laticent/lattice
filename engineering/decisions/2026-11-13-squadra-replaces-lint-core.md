---
status: in-progress
summary: >
  Squadra replaces lib/authoring/lint-core.js outright, in one PR. Every deck rule becomes a Squadra rule that visits
  lattice-deck's tree and reports a span; every consumer reads Squadra findings; one fix path; rule examples verified
  at build time so the browser ships only the runner. No adapter, no legacy record, no second linter on main at any
  point. The owner chose this over the rule-by-rule strangler of 2026-10-28 on 2026-11-13 (pre-GA: no old structure
  to keep), and chose to build the deck pipeline's front-matter island inside the rewrite.
---

# Squadra replaces lint-core, in one PR (2026-11-13)

Status: in progress; decided by the owner on 2026-11-13, nothing built yet. Supersedes the migration plan of `2026-10-26-squadra-lint-library.md` §6 (M1b onward) and
its `design.md` §15.3–§15.5 (rule-by-rule migration, the bridge, the legacy-shape adapter). The library's own design
(`design.md` §1–§14) stands.

## 1. The answer

`lib/authoring/lint-core.js` (10,812 lines on `main` at `a80ba80f`) is deleted. Its rules move to the Squadra `deck`
ruleset under `lib/authoring/rules/<family>/`, each a small code rule that visits `lattice-deck`'s tree, reports a
span and carries fixtures it must pass. The Studio, the Playground, Coach, `lint:deck`, the CLI and the conformance
kinds read Squadra findings directly. "Fix all" and the quick fix are Squadra's fix driver with the `edits` engine.
The rewrite lands as one PR, built family by family as commits on one branch, and merges once: `main` never runs two
linters.

## 2. Why not the strangler

PR #3194 (closed unmerged) moved two rules behind an adapter. The owner rejected it on 2026-11-13. What it had to do to
keep two linters agreeing is the list of reasons:

1. Rules carried legacy fields (lint-core's slide number, the line text consumers anchor on) so an adapter could rebuild
   the old record. New domain code knew a legacy consumer's details.
2. Rules barely used the language: one read the directive scan and searched strings, one ran a regex over slide text.
3. Fixes were lowered back into lint-core's `replaceLine` so `applyFix` could apply them; Fix all stayed on the bridge.
4. The browser compiled the ruleset and ran every rule's examples on load: +18.5 KB gz on the Studio's lint core,
   past its ceiling.
5. Squadra shipped twice: the lazy fix-driver chunk and the lint core.
6. Module-level "last answer" memos, one of which went stale on a plugin switch (caught by the maker-checker review).
7. Two front-matter readers that disagree (`frontMatterBlockOf` vs lint-core's `fmChunks`); the new layer had to pick one.

Lattice is pre-GA, so nothing outside the repo depends on lint-core's record. The cost of a seam buys nothing.

## 3. The target architecture

```
@laticent/segno-markdown    the deck model: S0 ingest, S1 blocks, slides, the directive island, the front-matter island
        │  (a function the host hands in; Squadra depends on nothing)
@laticent/squadra           core: lint, fix driver, edits engine; ./markdown the reference language; ./runtime the
        │                   browser entry (no compiler); the compiler and fixtures runner stay build-side
lib/authoring/squadra/      lattice-deck (the language), the vocab bridge (manifests → ruleset vocab), the Lattice
        │                   entry: lintDeck(source, opts) and fixDeck(source, opts)
lib/authoring/rules/        the deck ruleset, one folder per family, one file per rule with its fixtures beside it
        │
consumers                   Studio editor + Coach + Fix all, Playground, lint:deck, CLI, conformance, score tools
```

### 3.1 `lattice-deck`'s tree

Every rule reads nodes; no rule re-parses text. Kinds:

| Kind | From | Parts / attrs |
|---|---|---|
| `deck` | the model | facts: `deck.family`, `deck.size`, `deck.plugins`, `deck.mode`, `deck.settings` |
| `front-matter` → `fm-key` | the front-matter island (built here, §5) | `parts.name`, `parts.value`; `attrs.name`, `attrs.value` |
| `slide` → blocks | S1 | `attrs.index`; facts `slide.classes`, `slide.capacity`; `locate` gives `{ slide }` |
| `rendered-slide` | `heading-split-core` | under a slide that splits on headings |
| `directive` | the directive island | `attrs.key`, `attrs.spot`, `attrs.value`; `parts.key`, `parts.value`; `attrs.folded` |
| `note` | a comment that is not a directive | the speaker note's text span |
| `heading`, `paragraph`, `list` → `item`, `quote`, `table` → `cell`, `fence`, `code-block`, `html-block`, `plugin-block` | S1 | containers become real nodes (the reference language adds them; the S1 tape has them) |
| `segno-span`, `fence-record`, `chart-row` | the S3 inline islands | their bound records in `attrs` |

Inert: fences, indented code, and notes. One definition of where front matter ends: the island's, read by the engine,
the linter and the splitter alike (the two readers of §2 item 7 collapse into it).

### 3.2 The finding is the contract

Consumers read Squadra's `Finding`: `rule`, `severity`, `span`, `start`/`end` positions, `location.slide`, `message`,
`hint`, `fixes`, `data`. Rule ids are `deck/<name>` everywhere, the Diagnostic Protocol registry included
(`spec/diagnostics.md` §3 lists the full id). Severities are Squadra's four, which are lint-core's four.

- The editor places squiggles by `span` (exact offsets; no line-text search).
- Coach, the rail and the Fix-all notice read `rule`, `severity`, `location.slide`, `message`.
- A quick fix is one finding's fix through the driver (`fix(rules, source, { only: [rule] })` scoped to that finding),
  so a single fix gets the same shape, fence and resolution checks as Fix all.

### 3.3 One fix path

`fixDeck` is Squadra's `fix()` with the `edits` engine. `applyFix`, `fixReplacement`, `lattice-line`, the bridge and
the 500-pass cap go. A rule that rewrote a line now emits `edits` on the span it reported.

### 3.4 Verification at build time

`npm run build` compiles the ruleset strictly (every fixture runs) and writes `lib/authoring/rules/verified.generated.json`
(`stampRuleset`). `build:check` fails on a stale stamp. The browser loads `@laticent/squadra/runtime`: it accepts a
rule only with a matching stamp and carries no compiler, no fixtures runner and no reporter. The fixtures stay in the
repo and in the tests; they never ship.

### 3.5 No hidden state

Parsing is memoized inside the language per source (Squadra's per-parse fact memo), keyed on everything that changes
the parse: the text and the plugin-rules generation. No module-level "last answer" caches in the linter.

### 3.6 The bundle

The Studio's lint core becomes the runtime entry, `lattice-deck`, the rules and their vocab, and loses all of
lint-core. It is measured on the built site with `check-route-budget.mjs` at the end of the rewrite, against today's
`lintCoreGz`. The expectation (not a promise) is at or under today's size; a raise, if one is needed, goes to the owner
with the number.

## 4. Carried over from PR #3194

The reference Markdown language (`@laticent/squadra/markdown`), its offset map and tests; the deck-model wiring
(`deckView`); the per-rule diff's corpus helpers (`tools/squadra/corpus.js`); the BOM fix in the line-fix path; the
linear `say-key-case` scan; the bench rows for the deck ruleset. The adapter, the legacy fields, `scanMetaSourceShared`,
the frozen per-rule detectors and the `replaceLine` lowering are not carried.

## 5. The front-matter island

Built in this rewrite (owner, 2026-11-13), as the Segno pipeline's P3 row describes it
(`2026-10-22-segno-deck-pipeline.md`; `followups.d/3042-p1-segno-p3-the-remaining-islands.md`): the register grammar
over the front matter, producing `fm-key` with name and value spans. Every front-matter reader (the engine's
`directives.js` and `slides.js`, the splitter, the linter) reads it. It changes export bytes, so before merge a
representative demo deck is rendered in dark and light and sent to the owner for sign-off (CLAUDE.md, export rule).

## 6. How the rewrite proves itself

- **The reference diff.** lint-core as it stands at the fork point is frozen under `tools/squadra/reference/` (test-only;
  deleted at merge). `npm run squadra:reference-diff` runs it and the new linter over the three corpora (the lint
  tests' inputs, mutated decks, the tracked decks) and compares rule, severity, slide, message and the line the span
  starts on. Every difference is fixed or listed in the PR as intended, with the reason. A family's commit lands only
  with its diff at 0 or explained.
- **The fix diff.** Fix all on the old and new paths over the same corpora; same rule.
- **The tests.** The ~60 test files that assert on lint-core's record are rewritten to the finding contract, not
  shimmed. A test file is rewritten in the commit of the family it covers.
- **The surfaces (#23).** The Studio's squiggles, quick fix, Fix all and Coach are driven in the real built Studio
  (Playwright, Chromium and WebKit) before the merge ask.
- **Review (#25).** This is critical, high-blast-radius work: the adversarial trio runs on the finished PR.

## 7. Work plan

One branch, one PR, one commit per step. Sessions hand the branch over explicitly (HARD RULE #31: the owner names the
branch and says the previous session is finished).

1. This decision doc.
2. Foundation: the `./runtime` entry and build-time stamps; `lattice-deck`'s full tree from the islands on `main`
   (directives, notes, containers); the Lattice entry (`lintDeck`, `fixDeck`); the frozen reference and its diff tool.
3. The front-matter island, and `fm-key` in `lattice-deck`.
4. Rule families, one commit each, each with its reference diff at 0 or explained: front-matter registers; directives
   and notes; class tokens and components; cards and lists; inline spans (pills, sparks, legends, callouts); charts;
   capacity and fit; panes; glyphs; plugins (their `lint` role moves to Squadra rules); the rest.
5. Consumers: the Studio (editor, Coach, Fix all, thin-card fix, photo verdict, architect), the Playground, `lint:deck`
   and the CLI, conformance kinds, the score tools.
6. Delete lint-core, the bridge, `lattice-line`, the legacy fix path and the frozen reference; measure the bundle;
   render the export sign-off decks; the adversarial trio; the merge ask.

Estimated 6–10 sessions (an estimate from #3194's pace: one session built a language, an adapter, a diff and two rules).

## 8. Done when

- `lib/authoring/lint-core.js` does not exist, and nothing imports a lint-core function.
- Every rule id lint-core emitted at the fork is either a `deck/` rule or listed as removed with its reason.
- The reference diff is 0 or every difference is in the PR as intended.
- Every consumer reads Squadra findings; the Studio surfaces are verified on the real built Studio.
- `lintCoreGz` measured; within budget or the raise approved by the owner.
- Dark and light export renders signed off by the owner.

## 9. Open for the owner to veto

- Rule ids become `deck/<name>` in the Diagnostic Protocol too (one name everywhere), not the bare `<name>`.
- `review-core.js` (the review rules) and the ownership checks are out of scope here; they move in M2/M3 as planned.
