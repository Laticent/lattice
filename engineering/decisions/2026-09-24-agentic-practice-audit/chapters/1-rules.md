# Audit chapter 1 — Rules and enforcement (Lattice)

Scope: `/home/user/lattice` at `cdf8e9233` (HEAD, 2026-09-24). Neutral audit. Every number is tagged
**MEASURED** (command given or reproducible from the cited sha) or **ESTIMATED**. Nothing in the repo was edited.

---

## 1. The HARD RULES (#1–#30)

CLAUDE.md §HARD RULES starts at `CLAUDE.md:289`. It splits rules into **Invariants** (`:299–376`) and
**Conventions** (`:377–620`). "Origin" = the commit that first put the rule's text (or number) into
CLAUDE.md, found with `git log --reverse -S '<phrase>' -- CLAUDE.md` (MEASURED); the incident is quoted
from CLAUDE.md, the commit body, or a decision note.

Numbering note: #1–#17 received numbers all at once in `b3daaa743` (2026-06-17, PR #422, "red-team the agent
workflow — lean CI/hooks, trim CLAUDE.md, merge queue"). Before that most of them existed as unnumbered
prose, so the "origin" column for #1–#17 gives the first appearance of the *text*.

| # | Gist | Class | Enforcement (as it exists in the tree) | Status | Origin / incident |
|---|---|---|---|---|---|
| 1 | Render paths share one transform kernel | Invariant | Discipline (no tag in CLAUDE.md:299) | Live | Text numbered in `b3daaa743` (#422). A "standing #1 breach" is recorded in `engineering/decisions/2026-07-08-runtime-form-default.md:47` |
| 2 | Never hand-edit `dist/` | Invariant | Partly gated: `build:check` byte-diffs 20 committed artifacts against their generators (MEASURED output: "20 committed artifacts … are up to date") | Live | `60e64ff75` 2026-05-26 (dist relocation) |
| 3 | No hex literals in layout CSS | Invariant | Gated — `checkHexLiterals`, `LAYOUT_HEX_BUDGET = 0` + `SANCTIONED_HEX` (5 entries) | Live | In the very first CLAUDE.md, `e91f8a23e` 2026-05-10 |
| 4 | 12-token `--fs-*` typography | Convention | Gated — `checkTypographyTokens` | Live | `5b78288dd` 2026-05-19 (adding `--fs-body-compact`) |
| 5 | Card layouts use nested `- Title / - body` | Convention | Gated — `deck-authoring.test.js`; also `lint-deck --strict` in pre-commit (`lefthook.yml` lint-deck job) | Live | `d31437d23` 2026-06-12 (#214) |
| 6 | Open component `.docs.md` + grep gallery before authoring `_class: X` | Invariant | Discipline (untagged) | Live | `13c83c73b` 2026-05-17 "require component-docs consult before authoring slides" |
| 7 | Lint rules live only in `lib/authoring/lint-core.js` | Invariant | Discipline (untagged) | Live | `ade484f9b` 2026-06-07 (#79, Drawing Board) |
| 8 | Isolate feature content from the six long-running galleries | Invariant | Discipline (untagged) | Live | `b5b79c1f6` 2026-05-12 |
| 9 | Visible slide change ships a demo deck `examples/<slug>.md` + PDF | Invariant | Discipline — "no automated gate" (`CLAUDE.md:337-338`) | Live (rescoped) | `7ca502342` 2026-05-12. Rescoped from "feature" to "rendered surface" after measuring 21 lib/themes commits vs 6 decks (see §5) |
| 10 | Changelog via `changelog.d/` fragments, never `CHANGELOG.md ## Unreleased` | Invariant | Gated — `checkChangelogFragments` | Live | `74d13fe8b` 2026-08-11; incident: shared `## Unreleased` region "ejected seven PRs from the merge queue in one evening (#1593)" (`CLAUDE.md:343-345`) |
| 11 | Universal role-based token names | Convention | Gated — `checkRetiredTokenNames` | Live | Flipped to gated in `d84d4e734` 2026-06-14 (#349) |
| 12 | (was) ban `:not(:has())`/`:is(:has())` in theme CSS | Convention | Was gated | **RETIRED 2026-07-10** | Text in first CLAUDE.md `e91f8a23e` 2026-05-10; retired `e6c2ecbff` (#863) — "empirically retested … no corroborating bug report found anywhere; the gate had never been re-verified since it was written" (`CLAUDE.md:385-391`, `engineering/decisions/2026-07-10-hard-rule-12-retirement.md`) |
| 13 | Commits `area(scope): summary`; PRs use template | Invariant | Gated locally only — `commit-msg` hook `tools/check-commit-msg.sh` (exit 1 on bad format). CLAUDE.md does not tag it gated | Live | Hook: `974c171be` 2026-05-16 |
| 14 | Hook failure = root cause; never `--no-verify` | Invariant | Discipline | Live | `a3e89e67b` 2026-05-16 (pre-commit gate introduced) |
| 15 | Don't reinvent — consult `capabilities.md` | Invariant | Gated in part — `capabilities:check` (generated index must be fresh); the "consult first" part is discipline | Live | `071b7752f` 2026-06-12 (#221) |
| 16 | Rebase right before push; no background drift watch | Invariant | Warn-only Stop hook `.claude/hooks/stop-rebase-check.sh` (never blocks, no fetch) + merge queue does the final rebase | Live | `4318eb62d` 2026-06-15 (#357); incident: polling auto-rebase "thrashes the merge train and floods chat" (`engineering/decisions/2026-06-14-drift-watch-rebase-thrash.md`, `2026-06-15-retire-drift-watch.md`) |
| 17 | One feature = one branch = one PR; no stacked chains | Invariant | Discipline | Live | `ca509a11a` 2026-06-17 (#418); incident: "A feature was shipped as a 7-PR stacked chain (#408/#409/#410 based on #407's…)" (commit body; `engineering/decisions/2026-06-17-stacked-pr-fragmentation.md`) |
| 18 | No broken windows; a self-inflicted regression is fixed before merge, never filed | Convention | Discipline — "no automated gate" (`CLAUDE.md:415`) | Live (amended) | Rule added `dcfc93b8e` 2026-06-26 (#534). The "who caused it" clause and "Born from #1181" were added **later**, `b7f737ceb` 2026-07-22 (#1182): a `--cat-on-mark` re-tune broke the mermaid error box and was "wrongly filed-and-shipped" (`CLAUDE.md:416-419`) — i.e. the rule was tightened after being violated |
| 19 | Perf change ships before/after numbers + blessed baseline + bench scenario | Convention | Discipline — `bench:check` is on-demand, "not a blocking CI gate" (`CLAUDE.md:428-430`) | Live | `892da7033` 2026-06-27 (#545) |
| 20 | No `margin` in engine layout CSS | Convention | Gated — `checkMarginDiscipline`, `LAYOUT_MARGIN_BUDGET = 0` + `SANCTIONED_MARGINS`, fails on stale sanction | Live | `b7df5f208` 2026-06-27 (#550); `engineering/decisions/2026-06-27-stage-flow-no-margins.md` |
| 21 | US English only | Convention | Downgraded: ratchet added `67c17a243` (#576, 2026-06-28), **ratchet deleted** in `4271fe18d` (#1917, 2026-08-30). Now: warn-only commit-msg scan + two blocking arms in `test/unit/tools/us-english-stem-audit.test.js` (`CLAUDE.md:458-459`) | Live | "`--progress-centre` was a real 39-hit cluster"; a sweep that rewrote external strings "shipped a dead CI allowlist…" caught by review, not a gate (`CLAUDE.md:452-455`) |
| 22 | Untrusted content → sanitizer, for markup AND stylesheet | Convention | Gated — `checkPreviewHtmlSinks`, `checkDocumentStyleSinks`, `checkCssTreeRewrapSinks`, `checkRuntimeMarkupSinks` (+ `checkSnapshotHtmlSinks`) | Live | `1e530648b` 2026-06-29 (#616) — closes "exploitable-today preconditions from the component-transformer threat model (§5.1)"; later widened via `2026-08-17-theme-css-is-a-preview-sink.md` |
| 23 | A verification claim names its surface + carries an artifact from it | Convention | Discipline — "no automated gate" (`CLAUDE.md:501-502`) | Live | `f92316278` 2026-07-01 (#666); incident: "PR #658 mobile touch shipped 'verified under emulation'" (commit body) |
| 24 | `OPEN_ROUTER_KEY` off the site, out of per-PR tests | Convention | Gated — `checkOpenRouterBudget` + `SANCTIONED_OPENROUTER_SPENDERS` (3) / `_WORKFLOWS` (1) | Live | `ffbaafd2c` 2026-07-02 (#697); preventive (budget + bundle-leak risk), no leak incident named |
| 25 | Orchestration tiered (self → maker-checker → adversarial trio), budgeted (>10 agents/session needs OK), shaped | Convention | Discipline — "no automated gate" (`CLAUDE.md:538`) | Live | `633fd051c` 2026-07-05 (#774); incident: a design request "improvised at maximum scale: ~53 agents … The output was good; the spend was not" (`engineering/decisions/2026-07-05-orchestration-discipline.md:8-13`) |
| 26 | No partial `@layer` in engine CSS | Convention | Gated — `checkCascadeLayers`, `LAYER_BLOCK_BUDGET = 0`, `SANCTIONED_LAYER_BLOCKS` (0) | Live | `09d041f03` 2026-07-17 (#1046); incident: "Phase 3.5b broke 100% of canary pages" (`CLAUDE.md:547-548`, `2026-06-18-layer-activation-scope.md`) |
| 27 | Every agent runs on Opus; roster cards + workflow stages pin it | Convention | Gated — `checkAgentModelPinning` (rejects `sonnet`/`haiku`/`fable`) | Live (rewritten in place) | Born as the *opposite* rule — per-agent model tiering, `6390272c1` 2026-07-26 (#1187) — then reversed `3d83237df` 2026-07-28 (#1240) |
| 28 | Merge ask carries a conforming pre-merge card, posted on the PR | Convention | Discipline — "no automated gate, and that is a known hole" (`CLAUDE.md:582-583`) | Live | Added inside PR #1834 itself (`1c74e513c`, 2026-08-25); incident is that same PR: it "shipped an invented confidence level, three per-issue levels, no axis and no raise path" (`CLAUDE.md:577-579`) |
| 29 | No typed glyphs (✓ → ⚠) on rendered surfaces; draw SVG masks | Convention | Gated — `checkTypedGlyphs`, `TYPED_GLYPH_BUDGET = 0`, `SANCTIONED_GLYPH_DECKS` (3), `SANCTIONED_GLYPH_CHROME` (2); decks outside the shipped set only get warn-only `lint:deck` | Live | `3280f9223` 2026-08-26 (#1888); `engineering/decisions/2026-08-25-typed-glyphs.md` |
| 30 | House voice: active, plain, lead with the answer | Convention | Discipline — "no automated gate" (`CLAUDE.md:618`); on-demand `prose-checker` agent | Live | `4271fe18d` 2026-08-30 (#1917) |

**Tally (MEASURED by reading the tags at the lines cited):**
- CLAUDE.md explicitly tags **11 rules as gated** (#3, #4, #5, #10, #11, #20, #22, #24, #26, #27, #29).
- **7 rules say "discipline — no automated gate"** (#9, #18, #19, #23, #25, #28, #30).
- **6 invariants carry no tag and have no gate** (#1, #6, #7, #8, #14, #17; for #7, no check function in `tools/check-ownership.js` enforces the single-home rule).
- **3 are partially machine-backed but not tagged** (#2 via `build:check`, #13 via commit-msg hook, #15 via `capabilities:check`); #16 is warn-only; #21 was demoted from a blocking ratchet to warn + two test arms.
- **1 retired** (#12); **1 inverted in place** (#27).

So roughly half the numbered rules (the whole "how the agent behaves" class: #1, #6, #8, #9, #14, #17, #18, #19, #23, #25, #28, #30) have no machine enforcement. The gated half is almost all *code-shape* rules checked by one file.

---

## 2. Rule growth over time

Command (MEASURED): for each date, `r=$(git rev-list -1 --before="<date> 23:59" HEAD); git show $r:CLAUDE.md | wc -c`; highest rule number via `grep -oE '\*\*#[0-9]+'`; cumulative commits via `git rev-list --count --before=<date> HEAD -- CLAUDE.md`.

| Date | Rev | CLAUDE.md bytes | Highest numbered HARD RULE | Cumulative commits touching CLAUDE.md |
|---|---|---|---|---|
| 2026-05-01 | 7079e65c0 | — (file did not exist) | — | 0 |
| 2026-05-15 | d5dbd87b5 | 4,989 | (unnumbered) | 10 |
| 2026-06-01 | c476e65da | 22,554 | (unnumbered) | 50 |
| 2026-06-15 | 9621aeeba | 21,696 | (unnumbered list) | 79 |
| 2026-07-01 | ad4074d78 | 22,154 | 22 | 92 |
| 2026-07-15 | bd3ba5a96 | 28,289 | 25 | 102 |
| 2026-08-01 | 0ef7c2d17 | 34,652 | 27 | 107 |
| 2026-08-15 | 602858c0c | 36,415 | 27 | 115 |
| 2026-09-01 | fee852ed6 | 59,406 | 30 | 134 |
| 2026-09-15 | 4054616a0 | **61,701** (peak) | 30 | 138 |
| 2026-09-24 | cdf8e9233 | 53,436 | 30 | 140 |

- **140 commits** touch CLAUDE.md out of ~2,271 total (MEASURED: `git log --oneline -- CLAUDE.md | wc -l`), i.e. ~6%. By month: May 50, Jun 42, Jul 15, Aug 25, Sep 8 (MEASURED).
- First CLAUDE.md: `e91f8a23e`, 2026-05-10.
- Rule additions (MEASURED via `git log -S "**#N —"`): #18–#22 in 4 days (Jun 26–29); #23–#25 Jul 1–5; #26 Jul 17; #27 Jul 26; #28–#30 Aug 25–30. Cadence: ~13 rules added in ~9 weeks after numbering.
- The ~23 KB jump between Aug 15 and Sep 1 coincides with #28–#30, the SECOND FILTER (`86c1eea41`, #1786, Aug 24) and the pre-merge-card machinery (`ab8331152`, #1779).
- The only real shrink: `12b6748ca` (#2298, 2026-09-21), "trim five HARD RULES to trigger and pointer, 15,785 -> 13,233 tokens", motivated by "`CLAUDE.md` is resident before the first tool call of every session AND of every [subagent]" (commit body). Token figures are the commit's own (o200k_base), not re-measured here.
- The file now opens with a paragraph warning that ten routed docs are ≥14k tokens and `workflow.md`/`decisions/README.md` pass 29k (`CLAUDE.md:13-22`). MEASURED sizes: `engineering/workflow.md` 119,466 B, `engineering/decisions/README.md` 133,300 B, **583** decision notes (`ls engineering/decisions/*.md | wc -l`).

---

## 3. Enforcement layers

### 3a. Git hooks — `lefthook.yml` (203 lines)

| Stage | Job | What it runs | Cost |
|---|---|---|---|
| pre-commit (parallel) | lint | `npx biome check` on staged JS/TS/JSON | unmeasured per-file; whole-repo `npm run lint` = **5.5 s** MEASURED |
| | affected-tests | `node tools/affected-tests.js {staged}` → scoped test script, falls back to full suite for cross-cutting files | MEASURED: `README.md` **0.04 s** (no tests); a component `*.styles.css` **45.5 s** (`test:components`); `package.json` **171 s** (full `npm test`) |
| | lint-deck | `tools/lint-deck.js --strict` on staged decks | unmeasured |
| | pdf-rebuild | `tools/build-staged-pdfs.js` — auto-rebuilds and re-stages PDFs for changed deck markdown | unmeasured (render-bound) |
| pre-push (sequential) | lint, lint-deck (`lint:deck:all`), build-check, docs-typecheck (only if `docs/` changed), unit-tests (`npm test`), integration-tests (opt-in via `LATTICE_FULL_PUSH=1`) | `build:check` **17.8 s** MEASURED; comments claim lint 3 s, lint-deck 1 s, build:check 13 s, typecheck 36–40 s, unit ~108 s, integration ~4.5 min (`lefthook.yml` comments, not re-measured) |
| commit-msg | format | `tools/check-commit-msg.sh` — blocks bad `area(scope):` format; **warns only** on British spellings | ~instant |
| `pre-push-disabled` | — | a parked stage; its comment admits the "they run in CI instead" claim was false: `build:galleries:check` is "invoked by no workflow, no hook and no build step" (correction #1640) | — |

So a single commit touching a cross-cutting file costs ~3 minutes of pre-commit wall time (MEASURED, affected-tests alone), and every push pays lint + lint-deck + build:check + full unit suite (~2.5–3 min, ESTIMATED from the measured 171 s suite + 17.8 s + 5.5 s).

Commit-format escape (MEASURED): `git log --no-merges --format=%s | grep -cvE '^[a-z0-9-]+(\([^)]+\))?!?: '` → **20 of 2,238** subjects fail the format; most are GitHub squash titles (e.g. `68ab880a3` "Guide: a deictic gesture…", `7c9b1da0b` "studio,playground(split): …") — the hook only sees local commits, and the squash title comes from the PR title, which nothing checks.

### 3b. Claude Code hooks — `.claude/settings.json` + `.claude/hooks/`

| Hook | File | Behavior |
|---|---|---|
| SessionStart | `session-start.sh` (11 KB) | Web-only provisioning: `npm install` (which runs `lefthook install`), poppler-utils, exports `CHROME_PATH`, builds `dist/`. Output is silenced unless a step fails because setup chatter "came to 3,763 o200k_base tokens" of initial context (`session-start.sh:24-30`) |
| PreToolUse(Bash) | `warn-unbounded-wait.sh` | **Warns, never blocks**, on hand-rolled `while/until … sleep … done` loops; points at `tools/wait-for.sh`. Explicit rationale for warn-not-block (`:5-12`) |
| Stop | `stop-rebase-check.sh` | **Warns, never blocks**, when branch is behind locally-known `origin/main`; does not fetch |

`settings.json` permissions auto-allow `git push*`, `git merge*`, `git rebase*`, `git commit*`, all `npm run test:*`/`build*`/`check:*`, `node tools/*`, and `mcp__github__create_pull_request`. There is **no deny list**. `mcp__github__merge_pull_request` is not in the allow list.

`"doneMeansMerged": true` (`settings.json:2`): the only readers in the tree are CLAUDE.md:144 and the file itself (MEASURED: `grep -rn doneMeansMerged`). It is not a Claude Code settings key I can confirm the harness reads — so its effect is, at most, a string the model sees. UNVERIFIED whether any harness honors it.

### 3c. GitHub Actions — `.github/workflows/` (21 files)

| Class | Workflow | Purpose |
|---|---|---|
| Per-PR / merge queue | `ci.yml` (pull_request + merge_group) | Jobs: `changes`, `lint` (lint, lint:deck:all, build:check), `unit` (build, `build:check:all`, `npm test`), `integration` (`test:integration:pr`), `golden-diff` (rasterize goldens vs base, post comment), `docs-build` (typecheck, vitest, build, overflow guard), `studio-smoke` (Playwright @smoke), `ci` (aggregate required check) |
| Per-PR | `docs-preview.yml` | Cloudflare Pages preview |
| Per-PR | `pr-closing-keywords.yml` | Lint closing keywords in PR body |
| Per-PR | `pr-autoclose-issues.yml` | Auto-close linked issues |
| Per-PR (bot) | `dependabot-auto-merge.yml` | Auto-merge patch/minor dependency bumps |
| Push to main | `docs.yml` | Deploy docs site (+ dispatch) |
| Push to main | `labels.yml` | Sync labels (+ dispatch) |
| Push / schedule / dispatch | `publish-kits.yml` | Publish agent + Marp kits to `dist-kits` |
| Push / dispatch | `release-publish.yml` | Publish release |
| Dispatch only | `release.yml` | Prepare release PR ("the dispatch is the authorization", CLAUDE.md:152) |
| Nightly (+dispatch) | `integration-nightly.yml`, `modulepreload-coverage-nightly.yml`, `overflow-nightly.yml`, `perf-nightly.yml`, `preview-e2e-nightly.yml`, `studio-e2e-nightly.yml` (the one sanctioned OpenRouter spender), `webkit-baselines-nightly.yml`, `sync-backlog.yml` | Render regression tier, docs modulepreload, overflow ratchet, perf watch, playground gallery, live-AI Studio E2E, WebKit SVG drift, backlog mirror |
| Issue triage | `apply-form-labels.yml`, `dor-gate.yml`, `triage-gate.yml` | Label from issue forms; Definition-of-Ready gate; triage gate |

Counts (MEASURED from `on:` blocks): 5 per-PR, 4 push-to-main, 1 dispatch-only, 8 scheduled, 3 issue-triggered.

The branch ruleset per `engineering/workflow.md:1148-1150`: "requires a pull request, the merge queue, and a green `ci`, and it grants no bypass to anyone". No required reviewer is listed, and `workflow.md:1254` says "Never add required reviewers" for the release environment. So the "a human approves every merge" rule (CLAUDE.md rule 7) is enforced by the agent's instructions, not by GitHub. (Live GitHub settings not inspected — UNVERIFIED.)

### 3d. `tools/check-ownership.js` — the central gate

- 12,498 lines (MEASURED `wc -l`).
- **87** `function check*` definitions; **81** distinct checks called from `run()` (MEASURED: grep in the `run()` body at line 12140). One (`checkThemeManifestShape`) is deliberately exported-only, superseded by `checkManifestSchemas` (comment at `:776-779`).
- Runs as step 0 of `tools/build.js` ("ownership guard", `tools/build.js:16,68`), so it rides every `build:check` (pre-push + CI). Standalone run: **8.1 s** MEASURED, exit 0.
- The word "stale" appears 153× and 92 lines carry stale/no-longer wording (MEASURED grep) — the "fails on a stale sanction" pattern is widespread.

**Budget-0 constants** (MEASURED): `LABEL_VOICE_MONO_BUDGET`, `LAYOUT_MARGIN_BUDGET`, `SECTION_CQ_BUDGET`, `LAYER_BLOCK_BUDGET`, `LAYOUT_HEX_BUDGET`, `TYPED_GLYPH_BUDGET` — all `= 0`.

**`SANCTIONED_*` allowlists and entry counts** (MEASURED with a small bracket-matching parser over the source, a throwaway script, not committed):

| Allowlist | Entries | | Allowlist | Entries |
|---|---|---|---|---|
| SANCTIONED_UNNAMED_THEME_REGISTRATIONS | 2 | | SANCTIONED_STYLE_SINK_EXEMPT | 0 |
| SANCTIONED_MONO_FONTS | 11 | | SANCTIONED_PREVIEW_BUILDERS | 3 |
| SANCTIONED_MARGINS | **3** | | SANCTIONED_RUNTIME_MARKUP_SINKS | 3 |
| SANCTIONED_SECTION_BOXES | 3 | | DOC_STYLE_SINK_ROOTS | 3 |
| SANCTIONED_SECTION_CQ | 0 | | SANCTIONED_E2E_SLEEPS | 34 |
| SANCTIONED_BACKGROUND_LAYERS | 0 | | SANCTIONED_CLASS_ATTR_READS | 0 |
| SANCTIONED_STAGE_INSETS | 1 | | SANCTIONED_FM_SCALAR_READERS | 3 |
| SANCTIONED_KATEX_ONLY | 1 | | SANCTIONED_EOL_BOUNDARIES | 16 |
| SANCTIONED_LAYER_BLOCKS | 0 | | SANCTIONED_EOL_NON_BOUNDARIES | 4 |
| SANCTIONED_HEX | 5 | | SANCTIONED_SNAPSHOT_SINKS | 3 |
| SANCTIONED_GLYPH_DECKS | 3 | | SANCTIONED_OPENROUTER_SPENDERS | **3** |
| SANCTIONED_GLYPH_CHROME | 2 | | SANCTIONED_OPENROUTER_WORKFLOWS | 1 |
| SANCTIONED_FALLBACK_READS | 2 | | SANCTIONED_LEGACY_AUDIO | 0 |
| SANCTIONED_MARK_IDENTITY | 13 | | SANCTIONED_GESTURES | object, 9 keys |
| SANCTIONED_NUL_FILES | 0 | | SANCTIONED_DENSITY_EXEMPT | object, 41 keys |
| SANCTIONED_DANGLING_TOKEN_READS | 5 | | | |

34 allowlists; 9 are empty (true zero). Entries carry a `why:` string — some are paragraph-long measured justifications (e.g. `SANCTIONED_MARGINS[1]`, `check-ownership.js:1950-1970`, with pixel measurements of rejected alternatives).

---

## 4. DEFAULT OPERATING MODE and the SECOND FILTER

**DEFAULT OPERATING MODE** (`CLAUDE.md:26`, first added `d31437d23` 2026-06-12, #214 "rewrite CLAUDE.md for autonomy + add settings/hook"): a trigger table that makes the agent act without asking — open the PR when work is verified, subscribe and drive CI green, rebase before every push, and stop at exactly one gate: the merge ask, which must carry a 🚦 pre-merge card (row added `ab8331152`, #1779, 2026-08-23). After merge it posts standup + continuation cards; on idle it writes pending items to `followups.d/` (`d07eb781d`, #2313). A "decision filter" says: if CLAUDE.md/workflow.md already dictates the step, do it — don't ask.

**SECOND FILTER** (`CLAUDE.md:48-117`, added `86c1eea41`, #1786, 2026-08-24). It limits *reach*, not hesitation. Stop and present options (pros, cons, measured impact, recommendation, in one batched `AskUserQuestion`) when a change touches: (1) shared state outside the branch (labels, milestones, board, branch protection), (2) the CI/hook contract (adding/moving a CI job/step or lefthook hook), (3) a number the human set, (4) a canonical doc's meaning, (5) anything irreversible/external (merge, release, publish, comment on another's PR). It explicitly carves out adding a test, a lint rule, or a `SANCTIONED_*` entry.

**Incident** (commit body of `86c1eea41`): "This session took two such steps — labelling 60 issues status:ready when the brief said ~12, and adding a step to CI's unit job — both defensible on their merits, neither mine to decide." Two sub-clauses come from the same session: "a guessed '+~5s' was really 0.52s and argued for the wrong choice" (→ measure, don't estimate) and "writing out the pros and cons is what surfaced build:check:all" (→ a better option found mid-analysis means re-ask). CLAUDE.md tags it "discipline — no automated gate" (`CLAUDE.md:104-107`).

Mechanism summary: autonomy is the default; the brakes are (a) one human gate at merge, and (b) a five-row blast-radius list. Both are prompt text, not machine checks.

---

## 5. Discipline-only rules: evidence of violation

Searched commit bodies (`git log --format='@@%h %ad%n%B' > log.txt`, then awk for a rule number on the same line as violat/breach/missed/skipped/unverified) and decision notes (`grep -rlE 'HARD RULE #N.{0,80}violat…' engineering/decisions/`). MEASURED hits:

| Rule | Evidence of violation (self-reported) |
|---|---|
| #9 | CLAUDE.md itself: of 40 commits ending `4c9075c`, 21 touched `lib/`/`themes/`, 6 shipped a deck (`CLAUDE.md:326-330`). **Reproduced** (MEASURED, 21 and 6). The rule was *rescoped* rather than enforced. Also "Standing HARD RULE #9 artifact-integrity violation" in `engineering/decisions/2026-06-26-issue-backlog-triage.md:52` |
| #18 | `46c5390ae` (#1676): "the alignment change I added to SATISFY HARD RULE #18 was itself a #18 violation, on the default path" — found on a fourth review pass. The origin incident #1181 was itself a filed-and-shipped regression (`CLAUDE.md:416-419`) |
| #23 | `58e5e8fa8` (#1260): "Two HARD RULE #23 violations of mine" — a decision doc claimed dark mode "verified" in exported HTML using a Chrome flag the real recipient lacks. `e4ccb1584` (#1631): two comments claiming "verified … clips nothing" "were false, and HARD RULE #23 is what they violated". `engineering/decisions/2026-07-29-export-to-marp-broken.md:235`: "a HARD RULE #23 violation committed in the same document that argues for #23". Also the rule's own origin (#658) |
| #25 | `6bf240785` (#1445): "HARD RULE #25's trio was skipped on this change and run late, after four commits. It found two regressions this branch created and shipped green, plus two defects." Origin: the 53-agent run |
| #28 | Its origin is its own violation, inside PR #1834 |
| #21 | `engineering/decisions/2026-08-30-mandated-read-surfaces.md:202`: "shipped `neighbouring` … a HARD RULE #21 violation, in the same session"; the check missed it because it lists inflections one by one. Same note: "This is the second time in one session that a wrong claim of mine reached a commit and was caught by re-derivation rather than by a gate" (`:196-199`) |
| #1 | "a standing HARD RULE #1 breach" (`engineering/decisions/2026-07-08-runtime-form-default.md:47`) |
| #14 | No evidence of an actual `--no-verify` use found in commit messages (only hook docs mention it). Absence is not proof |
| #19, #30, #6, #8, #17 | No explicit violation reports found by this search (UNMEASURED beyond the grep) |

Positive compliance signal for #23: **146 commits** contain the word "UNVERIFIED" (MEASURED `git log --grep=UNVERIFIED | wc -l`), most as the rule prescribes ("Real iOS stays UNVERIFIED (HARD RULE #23)"). Whether pre-merge cards on PRs conform to #28 was not measured (needs GitHub API; UNMEASURED).

Pattern: every violation above was found by a later review pass, a checker agent, or re-derivation — none by a machine gate. That matches the house claim that these rules are discipline-only.

---

## Surprises / things that cut against the house narrative

1. **CLAUDE.md drifts from the gate it describes.** #20 says `SANCTIONED_MARGINS` holds "today: one irreducible flex `margin-left:auto` push" (`CLAUDE.md:440-441`); the list has **3** entries (two `0.22em` inline margins added with long justifications). #24 says the spender is "today only `tools/component-gen-eval.mjs`" (`CLAUDE.md:512-513`); `SANCTIONED_OPENROUTER_SPENDERS` has **3** (`check-ownership.js:7449`). The gate fails on stale entries; nothing checks the prose about the gate.
2. **The strongest wording has the weakest evidence.** #27 in CLAUDE.md asserts a downshifted agent "fails in the expensive direction — well-formed, confident, wrong". Its own decision note says: "**There is no measured failure here.**" The tiering lived 58 hours, with one observed misroute (Haiku's context too small for a sweep) (`2026-07-28-model-tiering-retirement.md:46-48`). The rule rests on decision rights and asymmetric-risk reasoning, which the note states honestly and CLAUDE.md does not.
3. **A gated rule lived two months without a re-check.** #12's ban shipped in the first CLAUDE.md (2026-05-10) and was retired on 2026-07-10 because "the gate had never been re-verified since it was written" and no bug report could be found.
4. **Gates get demoted as well as added.** #21 went blocking ratchet → deleted ratchet + warn-only commit-msg. The Claude hooks are all warn-only by explicit choice ("a false positive here costs one ignorable line", `warn-unbounded-wait.sh:5-12`). Several parked or dead gates are documented in place (`pre-push-disabled`, the false "they run in CI instead" claim corrected in #1640, the lefthook glob that silently dropped 108 decks, `lefthook.yml` pdf-rebuild comment).
5. **Rules tend to be written after the incident, sometimes in the same PR.** #28 was added inside the PR that violated it (#1834). #18's "who caused it" clause was added after #1181. #25 came after a 53-agent run, the second filter after a 60-issue relabel. Rules are born reactive.
6. **The one human gate isn't a platform gate.** The ruleset requires PR + queue + green `ci` and no reviewer (`workflow.md:1148`). `settings.json` pre-approves `git push*` and `git merge*`. "A human approves every merge" is enforced only by instruction text. `doneMeansMerged` is read by nothing in the tree.
7. **Commit-format "gate" leaks.** 20 of 2,238 non-merge subjects fail `area(scope):`, mostly GitHub squash titles — the hook is local-only and PR titles are unchecked.
8. **The context cost is real and self-acknowledged.** CLAUDE.md grew 4,989 → 61,701 bytes in four months (12×), then was cut 13% in #2298 because it is billed on every session and subagent. It now spends its opening paragraph warning the agent not to open the docs it routes to whole.
9. **Local gate cost is measurable and heavy.** Pre-commit on a cross-cutting file: 171 s for affected-tests alone. Per-component CSS: 45 s. `check-ownership.js` alone: 8.1 s (MEASURED). CLAUDE.md #14 forbids the `--no-verify` escape, so this cost is fixed per commit.
10. **The code gates are dense and self-policing, but concentrated.** 81 checks and 34 allowlists sit in one 12.5k-line file. The self-policing is real: budget 0, a `why:` string per sanction, and a failure on stale entries. But it covers code shape. Behavior rules (#9, #18, #23, #25, #28, #30) are held only by prompts and later review, and the violations in §5 were all caught that way.
