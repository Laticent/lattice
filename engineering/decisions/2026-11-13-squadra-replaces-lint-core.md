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

Status: in progress; decided by the owner on 2026-11-13. Step 2, the foundation, is built (§10); steps 1 and 2 merged
on their own in #3198, and step 3, the front-matter island, is built in its own PR (§7, §11). Supersedes the migration plan of `2026-10-26-squadra-lint-library.md` §6 (M1b onward) and
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
| `heading`, `paragraph`, `list` → `item`, `quote`, `table` → `row`, `fence`, `code-block`, `html-block`, `plugin-block` | S1 | containers become real nodes (the reference language adds them; the S1 tape has them). A row, not a cell: markdown-it maps no cell to a line (§10) |
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

*(2026-11-16: the register grammar landed, as a grammar plus a small driver, by the owner's choice; §11's "The register
grammar landed" says what each half reads and why the split is where it is.)*

## 6. How the rewrite proves itself

- **The reference diff.** The reference is lint-core as main has it where the branch left main, run from a git
  worktree of that commit (`tools/squadra/reference-tree.js`), so nothing the branch edits reaches it; step 6 runs the
  diff a last time before deleting lint-core (§10 says why two other designs were dropped). `npm run
  squadra:reference-diff` runs it and the new linter over the three corpora (the lint tests' inputs, mutated decks, the tracked decks) and compares rule,
  severity, slide, message and the line the span starts on. Every difference is fixed or listed in the PR as intended, with the reason. A family's commit lands only
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

**Changed 2026-11-15 (owner).** Steps 1 and 2 merged on their own, in #3198 (`72bd2d9`), and step 3 is its own PR from
`main`. Neither moves a rule or a consumer, so `main` still runs one linter: lint-core, unchanged. What keeps §1's
guarantee (no second linter on `main` at any point) is that no consumer reads Squadra until step 5: a family's rules
(step 4) may land beside lint-core as long as nothing shows their findings, and steps 5 and 6, where the consumers
switch and lint-core goes, land together. Step 3 is safe alone because it changes no tracked deck's render or lint
(§11).

1. This decision doc.
2. Foundation: the `./runtime` entry and build-time stamps; `lattice-deck`'s full tree from the islands on `main`
   (directives, notes, containers); the Lattice entry (`lintDeck`, `fixDeck`); the reference diff tool, on lint-core itself.
3. The front-matter island, and `fm-key` in `lattice-deck`.
4. Rule families, one commit each, each with its reference diff at 0 or explained: front-matter registers; directives
   and notes; class tokens and components; cards and lists; inline spans (pills, sparks, legends, callouts); charts;
   capacity and fit; panes; glyphs; plugins (their `lint` role moves to Squadra rules); the rest.
5. Consumers: the Studio (editor, Coach, Fix all, thin-card fix, photo verdict, architect), the Playground, `lint:deck`
   and the CLI, conformance kinds, the score tools.
6. Run the reference diff a last time, then delete lint-core, the bridge, `lattice-line`, the legacy fix path, the diff tool and its reference tree; measure the bundle;
   render the export sign-off decks; the adversarial trio; the merge ask.

Estimated 6–10 sessions (an estimate from #3194's pace: one session built a language, an adapter, a diff and two rules).

## 8. Done when

- `lib/authoring/lint-core.js` does not exist, and nothing imports a lint-core function.
- Every rule id lint-core emits at step 6, just before it is deleted (on the branch as rebased onto the main of that
  day, so main's rule changes count), is either a `deck/` rule or listed as removed with its reason. The fork is not
  the yardstick: main has already removed `bg-ratio-unread` and added `image-marp-keyword` since it (#3181).
- The reference diff is 0 or every difference is in the PR as intended.
- Every consumer reads Squadra findings; the Studio surfaces are verified on the real built Studio.
- `lintCoreGz` measured; within budget or the raise approved by the owner.
- Dark and light export renders signed off by the owner.

## 9. Open for the owner to veto

- Rule ids become `deck/<name>` in the Diagnostic Protocol too (one name everywhere), not the bare `<name>`.
- `review-core.js` (the review rules) and the ownership checks are out of scope here; they move in M2/M3 as planned.

## 10. Step 2 landed: the foundation (2026-11-13)

Built on `claude/squadra-lint-foundation-vccdly`, on top of steps 1 and the carried language (the owner handed the
branch over with its session finished). No rule has moved and no consumer reads Squadra yet, so nothing a deck author
sees changes.

**The runtime entry.** `@laticent/squadra/runtime` (`runtime.ts`) loads a ruleset with `loadRuleset`, which keeps a
rule only when its digest matches the one the build wrote, and reports every other rule as `squadra/rule-refused`
with the code `not-verified`. Registration (a rule's own declaration checks) moved out of `compile.ts` into
`register.ts`, so the runtime shares it without the fixtures parser or the example runner. Built and minified, the
runtime bundle is 10.7 KB gzipped against 14.6 KB for the whole library and 7.8 KB for `./driver`
(`runtime.test.ts`, which also asserts the compiler's refusal codes are absent from it).

**Two records, not one stamp.** §3.4 planned one stamp the browser rechecks. That cannot work: the stamp hashes a
rule's function source, and a bundler rewrites function text, so a browser cannot recompute what Node wrote. The
build therefore writes two records per rule to `lib/authoring/rules/verified.generated.json`: the DIGEST (the rule's
declaration, the vocabulary it reads, the language version and engine ids, all of which a bundler leaves alone), which
the runtime checks; and the full STAMP (function source and fixtures too), which only `build:check` reads. An edit
inside a rule's function keeps its digest and changes its stamp, so `build:check` goes red until the build re-verifies
it. `tools/build-squadra-stamps.js` is the step; it runs in `npm run build` after the stage catalog.

**`lattice-deck`'s tree** (`lib/authoring/squadra/lattice-deck.js`) is the engine's deck model
(`lib/core/deck-model.mjs`, front matter split as the engine splits it) read through the reference language, plus the
directive island. Containers are real nodes: the Segno deck model gained `containers` (lists, items, quotes, tables
and rows, held to markdown-it's `token.map` in `deck.test.ts`), and the reference language nests every block in its
innermost container. A comment block is a `comment` with a `directive` per field the engine's grammar reads
(`readIsland`), each with `key`/`value` parts where the authored text names them, or a `note`, which is inert. A
comment the engine folds into another block (`authoredComments`) is a `comment` with `attrs.folded`, under that block.
Facts: `slide.number`, `slide.directives` and `slide.classes`, resolved as `lib/core/meta-scan.mjs` resolves them;
front-matter globals join with step 3.

What the tree does not have yet, on purpose: `fm-key` (step 3); `rendered-slide`; the S3 inline islands
(`segno-span`, `fence-record`, `chart-row`), which join with the families that read them; and the deck facts that read
front matter (`deck.family`, `deck.size`, `deck.plugins`, `deck.mode`, `deck.settings`), which come with the island.
Spans are line-granular: a block runs from its first line's start to its last line's end, so a paragraph in an item
takes in the `- `. A rule that needs finer spans reads the S2/S3 islands.

**The Lattice entry** (`lib/authoring/squadra/index.js`): `lintDeck(source, opts)` returns Squadra findings and
`fixDeck(source, opts)` returns the fix driver's result, both on the `deck` ruleset (`lib/authoring/rules/index.js`,
empty until step 4) loaded through the runtime. The vocab bridge (`lib/authoring/squadra/vocab.js`) carries lint's
string-list vocabularies as sorted arrays; the structured ones (capacity, pane specs, exclusive axes) cross with the
families that read them.

**The reference and its diff.** The reference is lint-core as main has it at the merge-base, run from a worktree (below,
"The reference is main, in a worktree"). `npm run squadra:reference-diff` runs it and `lintDeck` over the
three corpora (`tools/squadra/corpus.js`, carried from #3194) and holds each migrated rule to it on rule, severity,
slide, message and the TEXT of the line a finding starts on (lint-core names its line by text, so line numbers would
make false differences on repeated lines; a lint-core finding it cannot place matches on the other four and is counted
as unlocated). A difference passes only when fixed or explained in `tools/squadra/explained.json`, one entry
per kind of difference (`lint` or `fix`, a pattern, the reason), and an entry that explains nothing fails the run.
`--fix` adds the Fix-all diff, attributing each differing source to the rules whose findings changed under either fix.
With no rule migrated it reports every lint-core rule as not yet migrated and passes.

**Review.** The maker-checker pass found a red unit test (the new build step was unclassified), four holes in the diff
tool (a fix difference no rule owned passed; per-rule explanations switched a rule off; line numbers mismatched on
repeated lines; a fix-only difference could not be explained), a folded comment whose note greyed out the paragraph
after it, and a key part found inside another field's value. All are fixed and pinned in
test/unit/authoring/squadra-lattice-deck.test.js, with a CRLF span start that could split a line end
(markdown.test.ts) and a RegExp field both hashes missed.

**The diff can fail (2026-11-13, the card grader's raise).** The grader set the card at `medium` because the diff had
never compared a real finding. So a temporary `deck/paginate-comment-retired`, a faithful copy of lint-core's rule on
`lattice-deck`'s tree, ran against a 3,003-input subset of the recorded corpus (every input naming `paginate`, plus
every 25th other one), with 2,832 mutated decks and the 520 tracked decks (on the branch before its rebase onto main;
the fix arm below, after it, saw 2,862 and 519, because main changed lint-core and a tracked deck). Faithful: 36 of 36 findings matched on line
text, PASS, exit 0. One message changed: 36 only in lint-core and 36 only in Squadra, FAIL, exit 1. The rule was then
removed and the stamps restored byte for byte. The same grader found why every recording run exited 1: the preload
loaded lint-core before `payload-elision-lint-oracle.test.js` could stub `elidePayloads`, which lint-core captures at
load. The preload now wraps the linter when a test first loads it, and a recording with any red test now stops the
diff instead of being printed and ignored.

**The reference is main, in a worktree (2026-11-15).** Two designs came first, and both had silent holes.
- *A frozen copy of lint-core.js* under `tools/squadra/reference/`. Its requires reached the live `lib/`, so only the one
  file was frozen; a test then forced it to equal the live file, which made it the live file plus 10,800 lines of diff.
- *The live lint-core, with a gate over a list of its inputs*: first four files kept by hand, then the load closure read
  from `require.cache`. The fifth review found the closure missed every module reached through an ESM `import` (the deck
  model, the directive island, 18 files), modules loaded only while linting, and the fix driver lint-core loads on
  demand, and that this branch had ALREADY edited two of them: the deck model's `containers` and the Squadra driver
  lint-core's own Fix all runs. The gate said nothing had moved.

The owner chose the root fix on 2026-11-15: `tools/squadra/reference-tree.js` checks out the merge-base with main as a git
worktree under `.scratch/squadra-reference/<sha>`, builds its six workspace libraries there, and gives it a
`node_modules` whose workspace links resolve to ITS `docs/src/lib`. The reference is then that commit's whole tree,
every input included, with no list to keep. Before it marks a tree ready it proves isolation: a fresh process loads the
reference, lints the gallery and runs a Fix all, and every module it loaded, through `require` or (via a resolve hook)
`import`, must sit inside the tree. Failing arm: pointing one workspace link back at the branch's `segno-markdown`, a
package lint-core reaches only through `import`, made the check name the leaked module; restored. Cost, measured: about
19 s the first time for a commit (11 s with warm caches), 0 s after. When the branch takes main the merge-base moves and
the next run builds the newer reference. Each side lints with its own vocabulary: the reference with main's manifests.
The first two failing arms below ran on the live lint-core before this change. The fix arms were re-run on the worktree
reference (lint-core at `caf4115a9`) and gave the same numbers: faithful, 36 of 36 and 6,291 of 6,384 identical, PASS;
the fix changed, 14 sources attributed to the rule, FAIL, exit 1. The rule was removed again and the stamps restored.

**The fix diff can fail too (2026-11-15, the third card grader's raise).** The grader held the card at `high` because
no run had ever turned the fix diff red. The same temporary rule, now carrying lint-core's fix (delete the comment's
line when the comment is redundant and the line occurs once on its slide, as an `edits` `deleteLine`), ran
`squadra:reference-diff --fix` on the subset against the live lint-core. Faithful: the lint diff matched 36 of 36 and
the fix diff found 6,291 of 6,384 sources identical, 0 differing on the rule, PASS, exit 0. With only the fix changed
(rewrite the comment instead of deleting its line): the lint diff still matched 36 of 36, and 14 sources fixed
differently, each attributed to the rule, FAIL, exit 1. Those 14 are the sources where lint-core fixes it, all
identical on the faithful run. The rule compiler also refused the first fixture, whose bad example lint-core does not
fix. The rule was removed and the stamps restored byte for byte.

**What the failing arms did not cover.** One changed a message, one changed a fix, so severity, slide and line text
are covered by the matcher's unit tests rather than a real run. And while most rules are still
unmigrated, the fix diff skips every source with an unmigrated rule's fix in it; the report prints that count, so a
family's commit says how many sources its fix diff actually compared.

**The full corpus, on the worktree reference (2026-11-15).** The first full run (all 59,353 recorded inputs) ran the
heap out after 61 minutes: it built every mutated deck before comparing any, up to 475,000 of them at 8 hosts per input,
and it kept every unmigrated rule's findings in lists the report never printed. The diff now streams its sources,
keeps lists only for migrated rules (counts for all), and splices each input with a finding into one host, the 8 in
turn. The run then compared 91,769 sources (59,353 test inputs, 31,897 mutated decks, 519 tracked decks) against
lint-core at `caf4115a9`: 87,953 reference findings across 177 rules, none migrated, so none held; Fix all identical
on 90,552 sources, the other 1,217 differing only on unmigrated rules. PASS, exit 0, 804 s. With an empty ruleset this
proves the harness at full scale, not any rule: each family's commit runs it with its rules held.

**The arms on the streaming tool (2026-11-15, the fourth card grader's raise).** The grader held the card at `high`
because every arm had run on the tool before streaming. The temporary rule went back in, with a switch for its message
and one for its fix, and ran `--fix` on the same 3,003-input subset with the 8 hosts in turn (1,431 mutated decks, 519
tracked). Faithful: 24 of 24 matched, Fix all identical on 4,888 of 4,953 sources and none differing on the rule, PASS,
exit 0. Message changed: 24 only in lint-core and 24 only in Squadra, FAIL, exit 1. Fix changed: 9 sources fixed
differently, each attributed to the rule, FAIL, exit 1. The counts are below the earlier 36 and 14 because each input
now meets one host, not eight. The rule was removed and the stamps restored byte for byte.

**The code review of the reference tree (2026-11-15, the owner's eighth agent).** An independent checker read
`reference-tree.js` and the streaming change. It loaded the reference in-process beside the branch's linter over 378
tracked decks and saw no module resolve from the tree to the branch, and it found no lost failure path in the diff. It
found four holes in the tree, all fixed here:
- the merge-base was taken from whatever `origin/main` pointed at, so a stale ref gave an older lint-core and its
  differences would be explained away. `referenceBase` now fetches main first and warns when it cannot;
- the isolation check read its ESM resolve hook after a fixed 50 ms, so a later `import()` could be missed. It now
  uses a synchronous hook (`module.registerHooks`, Node 22.15 or later; older Node stops with that message) and reads
  the list on `beforeExit`, once nothing is left to load;
- a locked half-built worktree survived `remove --force`. It is unlocked first;
- the check loaded lint-core and lint.js but not the two helpers the diff loads beside them. It now loads all four.
A unit test builds fake trees in `.scratch/`: a clean one reports nothing, and a `require` leak and a delayed
`import()` leak are both named. Failing arm: with the hook recording nothing, the test went red; restored byte for
byte. Green five times alone and 20 times across 4 parallel workers.

**The arms after the review fixes (2026-11-15, the fifth card grader's raise).** The grader held Evidence at `high`
because no arm had run since the fixes. The cached tree was deleted so the run rebuilt it through the new fetch and
isolation check (no warning, no leak), and the temporary rule ran its three arms at `25e5635`: faithful 24 of 24, PASS,
exit 0; message changed 24 and 24, FAIL, exit 1; fix changed 9 sources, FAIL, exit 1. The same numbers as before the
fixes. The rule was removed and the stamps restored byte for byte. CodeQL flagged the new test for building module
source from a path with `JSON.stringify`; the fake modules now read their paths from a data file, and the test still
goes red with the hook recording nothing.

**Carried into step 4, from the same review.**
- Notes are inert, and `<!-- _clas: kpi -->` is a note. A rule that reports or fixes a misspelled directive reads with
  `inert: 'include'` and declares `changes: inert`.
- A digest hashes the vocabulary lists a rule reads, so in the browser a rule loads only when the Studio's vocabulary
  handoff carries those lists exactly as `buildVocab()` builds them. The consumers step must hand the entry that
  vocabulary, or the rule is refused (visibly, as `squadra/rule-refused`).
- The stamps step runs after the stage catalog; a vocabulary input generated later in the build would leave the stamps
  one build stale. Moot while the ruleset is empty; checked when the first rule reads a generated table.

## 11. Step 3 landed: the front-matter island (2026-11-15)

Built on `claude/squadra-lint-front-matter-ktsbt9`, cut from `main` at `72bd2d9`, in its own PR (§7).

**The island.** `lib/core/front-matter-island.mjs` gives two answers once, for every reader.

- **Where the front matter ends.** The block the engine finds: its fence (`^---\n…\n---\n?`) run on the S0 text, where
  every `\r\n` and lone `\r` is folded to `\n`, with each offset mapped back to the text the caller holds. A raw-bytes
  reader therefore finds what the engine renders, by construction. (`FRONT_MATTER_FENCE`, the regex the boundary parser
  exports as `FRONT_MATTER` for its regex callers, stays the literal it always was; it can split a raw `\r\n`, and its
  raw-bytes callers move to `frontMatterMatch` in the follow-up below.)
- **Its keys** (`frontMatterKeys`). Each line is read once into its indent, name, raw value and the spans of the name
  and value; a block scalar (`style: |`) records where its body ends, and the body's lines are never keys (YAML's
  rule). A name is `[\w$][\w$.-]*`, wider than any reader asked for, so no reader loses a key. The list is frozen.
  The key each nests under and the body's span are `lattice-deck`'s to work out: this module ships in every docs page
  that reads a register, so it carries only what those readers use.
- **Two import-free modules, joined.** Where the block ends lives in `lib/core/front-matter-fence.mjs`
  (`frontMatterFence`, `frontMatterMatch`, `FRONT_MATTER_FENCE`); the key reader in `lib/core/front-matter-keys.mjs`
  (`frontMatterKeys`, `topLevelKey`, `looseKey`; the lint-only `BLOCK_SCALAR_HEAD` moved to `lib/authoring/front-matter-scans.js`, beside lint-core, its one caller); `lib/core/front-matter-island.mjs` joins them
  for ES readers and tests. A reader that only needs the block imports the fence; the splitter, the boundary parser,
  the deck model and the plugin admission import nothing else, which is what keeps the key reader off the docs home
  page. (The resolvers and `slides.js` take the block from the fence too, but still load the key reader through
  front-matter-key.js, as they must to read a register.) Both halves import nothing, and CommonJS requires only them, never the joined module: a required ES module
  that imports another killed every Playwright run at config load ("request for './front-matter-fence.mjs' is from a
  module not been linked"), which a unit test now pins. lint-core's two line scans (`withoutBlockScalarBodies`,
  `lastFrontMatterMatch`) moved out of the shared front-matter-key.js into lib/authoring/front-matter-scans.js. Measured
  after the merge queue ejected the first try (main had grown the home route, and the PR took it 0.3 KB past its
  ceiling): home +399 bytes gzipped against main (708 of room), studio +642, playground +598, declared in
  docs/route-budget.d/3228-front-matter-island.md.

Each reader then selects from the one list, and that selection is all that differs between them:

| Reader | Its selection |
|---|---|
| the engine's directives (`parseFrontMatter`, lib/engine/directives.js) | column 0, a name of `[A-Za-z_]\w*`, every line in order, so the last wins |
| `topLevelFrontMatterValue` (lib/core/front-matter-key.js) | the last column-0 line for the name |
| `frontMatterValue` (every register resolver reads through it) | the last column-0 line, else the first at any indent |
| `lattice-deck` | every key, as an `fm-key` node |

**Not the register grammar.** §5 (and the Squadra design, `2026-10-26-squadra-lint-library/design.md` row "Front
matter", and the Segno pipeline's S3) said the front matter would be read through "the register grammar", a parser
Segno's code generator makes, as it makes the flowchart-row, list-text, css-ref and html-ref grammars
(tools/build-segno-grammar.js). This step did NOT build it. The island is hand-written: a regex fence on S0 text and a
line loop (`frontMatterKeys`), written to equal, byte for byte, the line-oriented reading the engine's
`parseFrontMatter` and the register readers already had. The grammar was not weighed against that and rejected; it
was not considered while building this step, and the first version of this section did not say so. Whether a Segno
grammar replaces `frontMatterKeys` behind the same `fm-key` contract, or the hand-written island stands as the
replacement for the grammar, is the owner's decision, recorded in followups.d/3042-p2-front-matter-register-grammar.md.
Either way the readers are unchanged: they read `frontMatterFence` and `frontMatterKeys`, not a grammar's tokens.
*(Decided 2026-11-16: the grammar, with a driver; see "The register grammar landed" below.)*

**The register grammar landed (2026-11-16, PR #3263).** The owner chose a Segno grammar plus a small hand-written
driver. `lib/core/front-matter-grammar.js` holds two rules: `fence` (the engine's `^---\n[\s\S]*?\n---\n?`, a stop, so
the parse ends with the block and never reads the body) and `line` (one YAML line: indent, name, colon, and whether it
is a block-scalar header, with the name, gap, indicator, comment and junk shapes `KEY_HEAD` and `BLOCK_SCALAR_HEAD`
drew). `tools/build-segno-grammar.js` generates each rule's parser INTO a marked region of its driver,
`front-matter-fence.mjs` and `front-matter-keys.mjs`. Not a `*.generated.js` of their own, as the other lib grammars
have, because two constraints meet here: a CommonJS reader `require()`s each driver and an ES module that imports
anything then fails under Playwright's loader (`playwright test --list` found 0 tests with one import added), while a
CommonJS driver that requires a parser is a require chain the docs dev server's shim refuses (three of its tests went
red). The fence region is its own parser, so the home page does not ship the line rule's tables.

The driver does one thing the grammar cannot: it decides where a block scalar's body ends, every later line that is
blank or indented DEEPER than the header. That compares an indent width with one read lines earlier. No context-free
grammar can: cut "a header indented n, then lines each indented more than n" with a regular language to
`s^n H s^m L s^k L` with m > n and k > n, and pumping on n breaks one of the two comparisons. So it is not LL(1), and
Segno, which has no counter and no back-reference, cannot express it. Each line is parsed once and visited once; the
bound is in the driver's header and counted by `keyWork`.

| Held to | Result |
|---|---|
| test/unit/core/front-matter-grammar.test.js: `frontMatterKeys` against #3228's hand-written reader, verbatim, on 4,000 seeded front matters (seed 0x3263: wide names, gaps, every indicator shape, comment and junk tails, U+2028, tabs and Unicode spaces, CRLF and lone `\r`) | 0 differences; more than 300 block-scalar headers reached |
| the same file: the fence against the old S0 regex on 4,000 seeded sources (seed 0x3264) | 0 differences |
| test/unit/core/front-matter-island.test.js: #3228's own 4,000-case differential (seed 0x3242) | green |
| a header 200 columns deep, 3,000 nested header-shaped body lines, 20,000 keys at every depth | 23,001 lines parsed, at most one outer and one body visit each |
| failing arms | dropping the header's `wide` check turns both differentials red; a body skip removed costs 2,003,001 body visits for 4,001 lines; a yaml end off by one turns the fence differential red |
| `npm run identity:check -- --strict` | 0 renders differ, lint identical, 0 stylesheets differ |

**What reads it.**
- **The engine:** `parseFrontMatter`; `slides.js`'s two deck-class reads; the pane render (lib/engine/index.js); the
  shared markdown-it kernel's four front-matter reads (lib/integrations/markdown-it/plugins.js: the deck-class
  propagation, the logo, table row labels); lib/core/panes.js, lib/plugins/host.js and host-bake.js,
  lib/core/auto-split.js, the tile `meta` transform, lib/export/picture-placement.js, chart narration's two reads; and
  the 17 register resolvers whose fence was the engine's (`resolve-{mode,inline-code,tone-style,venue,split,finish,lift,
  cards,marks,headline,spectrum,corners,stamp,guards,eyebrow,claim,rule}`). Each takes `frontMatterMatch(source)`, a
  `[block, yaml]` pair in the shape its regex returned.
- **The register key readers** in front-matter-key.js.
- **The splitter:** `frontMatterBlockOf` in lib/core/slide-boundaries.mjs (and with it `chunkBoundaryLines`, `meta-scan`).
- **The deck model:** `deckModel` passes the fence to the Segno package; on S0 text it is the package's default.
- **The plugin admission:** lib/core/deck-plugins.mjs, which now also splits its lines as the island does.
- **`lattice-deck`:** the `front-matter` node gains an `fm-key` child per key line (attrs `name`, `value` as
  `frontMatterScalar` cleans it, `raw`, `indent`, `top`, `blockScalar`, `parent`, `parentIndex`; parts `name`, `value`
  and, on a block scalar, `body`, all in source offsets through a BOM and CRLF). Two facts join: `deck.settings`, the
  top-level keys (Map name → `fm-key`, the last line winning), and `deck.registers`, what each register resolves to as
  the resolvers read it (the loose read and the `preset:` fallback), for a rule that asks what the deck renders with.
  `slide.directives` stays the comments' directives, as `meta-scan.mjs` resolves them: the engine keeps only
  `[A-Za-z_]\w*` names from front matter, so a join is the front-matter family's call (step 4), not a fact here. The
  language's version is 2.

**It changes no tracked deck.** `npm run identity:check -- --strict` against `main`, on the final tree: 471 paired decks render byte-identical, lint identical (31 findings each side), 39 stylesheets compared and none differing, exit 0.
The tool used to list four VS Code stylesheets as differing: a full `npm run build` writes them and the tool's fresh
`main` worktree runs only the CSS steps, so they sat on one side. It now lists a stylesheet found only in this tree
without failing, and still fails `--strict` on one found only in `main`'s.

The corpus has no deck on any edge where the readers used to disagree, so a seeded differential
(test/unit/core/front-matter-island.test.js, 4,000 front matters over `\n`, CRLF and lone `\r` line ends, `---x` and
`---  ` closers, empty bodies, block scalars, nested, repeated, quoted, list-item and digit-first keys) holds each moved
reader to `main`'s code: `lastFrontMatterMatch` copied verbatim, the engine's parse and the block-scalar blanker with
only their shared helpers inlined. Its failing arms: reading a block scalar's body as keys turned three tests red, and
letting the engine read indented keys turned the differential red; both files were restored byte for byte. It ran
green five times alone and 20 times across 4 parallel workers.

**What reads differently, all off the corpus.** Each one now matches the engine; each is pinned in the test.
- **A closer followed by blanks (`---   `).** The engine ended the front matter at `---` for every setting, but the
  deck-class reads in `slides.js` and the kernel needed a line end right after it, so they ran on to the next slide
  break and read the first slide's text as deck classes (`class: no-pagination` written in a slide's prose turned
  page numbers off deck-wide). They now stop where the engine does. This one changes an export's bytes, so the owner
  signs it off on dark and light renders. The splitter's block is shorter by those blanks, and `chunkBoundaryLines`
  counts the body's first line by `\n`, as `meta-scan.mjs` already did, so its boundary lines are the same.
- **A closer with text after it (`---x`, `----`), or no line end at the end of the file.** The engine ended the block
  there; the readers that required a line end missed it. The splitter's boundary lines were one line late after such
  a closer and are now on the real `---`.
- **Raw CRLF `---` then `---`.** No front matter, as the engine reads it; the boundary parser's fence read an empty
  block, and the plugin writer then wrote into the middle of a line end and dropped the author's first slide.
- **A lone `\r`.** The engine never sees one (its door folds it). A raw-bytes caller of `parseFrontMatter` (the share
  export reads the player config with it) now finds the block the engine renders, and the loose register reader reads
  `\r` as a line end.
- **U+2028 and U+2029 are text**, as they are to markdown-it and YAML 1.2. The engine's `(.*)$` dropped such a line.
- **A key `main`'s loose reader read by its regex head** (`a.b`, `$x`, `1x`: the head stopped at `.` or `$`, or failed on
  a digit and let the first match stand in). Such a key now reads as its last top-level line. No register name holds
  one.

**Review.** The adversarial trio ran on the first commit. The red team found the CRLF `---`/`---` split (a real bug
in the new fence, with the plugin writer corrupting the deck), the `---   ` render change that this section first
called splitter-only, the boundary-line move after `---x`, and the identity tool no longer failing on a stylesheet
`main` has and the branch lacks. The inversion pass found that the render path still held a dozen fences (the
follow-up said none did), that step 4 would need block-scalar bodies, parents and the resolved register values, and
that the shared key list was mutable. The checker found the differential's copy of `main`'s loose reader was not
`main`'s code (it hid every `a.b` and `$x` difference) and the plugin admission splitting lines on `\r?\n` after the
island read a lone `\r`. All are fixed in the second commit. Fixing them also surfaced that the docs dev server's CJS
shim (docs/src/plugins/vite-cjs-lib-dev.mjs) refused 13 register resolvers once front-matter-key.js required the
island; it now hoists a sibling's own `.mjs` require too (pinned in its vitest).

A second independent checker then read the commits the trio had not seen (the render-path conversion, and the trim
that moved key nesting and block-scalar body spans into `lattice-deck`). Its seeded runs found no reader outside the
edges above: 200,000 inputs against each old fence (the sites that required a line end after the closer differed only
where the block now ends at a closer with none), and 200,000 mixed line-end inputs through `fence()`'s offset mapping,
none split a `\r\n`. It found three small things, fixed here: the plugin writer chose a lone-`\r` line end for an LF
deck holding one stray `\r` in its prose (it now does so only for a deck with no `\n`; pinned, and the pin goes red
with the old rule); the dev shim would bind one import name twice for a sibling required twice (each inlined copy now
has its own; pinned in the vitest); and `render-identity` printed no reason when `--strict` failed on a stylesheet only
`main` writes (it now names it, and `--json` carries `cssLost`). The identity check on `d658d31` (after it, only the
plugin writer's line-end choice, the dev shim and the identity tool changed) reads 471 decks byte-identical, lint
identical, 0 stylesheets differing, exit 0.

**The surfaces, at the merge ask** (re-driven on the head after the merge queue's ejection and the module split).
CI green on every check of `afe67c0`. A full Chromium e2e run on `635ba64` (desktop, tablet and mobile, 4 workers, no
retries): 1,912 passed, 5 failed, 68 skipped; the five passed alone, and every load-only spec this PR met was run
against main under the same load (PR 24 of 24 and 16 of 16; main 23 of 24 and 15 of 16), recorded in
followups.d/3087-p4-mobile-load-only-flakes.md. The 47 spec files that touch front matter or deck settings in WebKit
(phone, tablet) and Gecko: 120 of 120. Player parity 5 of 5 and the player input check. The docs Vitest suite: 684 files,
11,513 tests. The Studio on a fresh `npm run dev` at `3da5d28`, after the split changed what the dev shim serves: it
loads the welcome deck and reads its front matter (`cuoio · light`), and the Studio and home page log no console error
but the 404s for the newcomer frames only the production build bakes; the Playground logs one React hydration-attribute
warning, the same on a fresh dev server of main `af00ca3`.

**Not moved, and why.**
- **lint-core's front-matter reads** (44 copies of the engine's old fence, its `fmChunks`, its line scans through
  `withoutBlockScalarBodies`). Step 4 moves each rule onto `fm-key`, and step 6 deletes lint-core; converting them first
  is throwaway work, and the reference diff compares against `main`'s lint-core either way.
- **Fences that disagree with the engine at the door**: they accept a BOM or `---   ` as the OPENER, which the engine
  renders as a slide. About 15 files in lib/ (some on the render path: `resolve-preset`, `resolve-pace`,
  `settings-block-fold`, `deck-front-matter`; the Marp export), and about 30 in docs/src and tools/. Each move is a
  behavior change of its own. followups.d/3042-p3-front-matter-fence-copies.md lists them.
