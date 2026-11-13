# Audit chapter 5: agents, orchestration, and budget/cost

Scope: `/home/user/lattice` at HEAD `d07eb781d`-era tree (2026-09-24), 2,271 commits since 2026-04-28.
Labels: **MEASURED** = a number someone derived from a run, a transcript or a tokenizer and recorded with its method. **ESTIMATED** = arithmetic or recollection with no recorded method. **ARGUED** = reasoning only, with no number.

One limit applies to the whole chapter. The repo does not log agent spawns. Subagent use is only visible where a commit body or decision note reports it. The only local transcripts are this audit session's (`~/.claude/projects/-home-user-lattice/`: 12 `general-purpose` spawns, 0 roster spawns). So "how often X ran" below means "how often X was *reported*." It is a lower bound.

---

## 1. The roster, the workflow, and the skill

### 1.1 `.claude/agents/*.md`: 12 cards, all `model: opus`

| Agent | Tools | Purpose (frontmatter `description`) | Added | Commit-log mentions* |
|---|---|---|---|---|
| `scout` | Read, Grep, Glob, Bash | read-only cartographer: "where/how does X work" | 2026-07-26 (#1187) | 0 |
| `fact-checker` | R/G/G/Bash | classify claims as confirmed / refuted / forward-proposal / unverifiable | #1187 | 4 |
| `ci-triage` | **+ Edit, Write** (the only editing agent) | drive a red gate green, never disable a gate | #1187 | 0 |
| `inventory` | R/G/G/Bash | mechanical enumeration with an exact output shape | #1187 | n/a (the word is also a component bucket) |
| `red-team` | R/G/G/Bash | adversarial trio lens 1: break it | #1187 | 13 |
| `inversion` | R/G/G/Bash | adversarial trio lens 2: Munger inversion, "wrong frame?" | #1187 | 34 |
| `checker` | R/G/G/Bash | adversarial trio lens 3 **and** the default maker-checker checker; "refuted" on uncertainty | #1187 | 116 |
| `seam-census` | R/G/G/Bash | additive trio: enumerate joins | 2026-08-26 (#1883) | 0 |
| `blast-radius` | R/G/G/Bash | additive trio: reverse-dependency closure | #1883 | 0 |
| `contradictions` | R/G/G/Bash | additive trio: refused tradeoffs | #1883 | 0 |
| `docs-auditor` | R/G/G/Bash | doc-honesty audit | 2026-06-09 (#137) | 0 |
| `prose-checker` | Read, Grep, Glob (no Bash) | AI-tell and read-aloud audit | 2026-06-09 (#133) | 1 |

\*`git log -E --grep` for the agent's name in agent context. These counts are rough. "checker" also matches the generic word.

Every agent except `ci-triage` is report-only. Each card says "never edit" in its own body (for example `.claude/agents/checker.md:55`, `red-team.md:49`). The model pin is gated by `checkAgentModelPinning` in `tools/check-ownership.js` (HARD RULE #27).

**Finding:** the named roster cards are rarely *reported* in commit messages. The *roles* are reported constantly (§4). The practice is "spawn a checker with a checker prompt." The practice is not "spawn the `checker` card," and the log cannot tell the two apart.

### 1.2 `.claude/workflows/design-competition.js`: the only committed workflow

- **Shape** (`meta.phases`, lines 1-13): N design tracks that iterate *internally* in one warm agent → one fresh critic per track → one low-effort fold → one shared fact-checker (a barrier) → 1-3 comparative judges → human pick. The trio then runs on the winner only, **outside** the workflow.
- **Clamps** (lines 24-39): tracks 2-8 (default 5), internal iterations 1-5 (default 3), judges 1-3 (default 1).
- **Hard cap:** `maxAgents = 28 = MAX_TRACKS*3 + 1 + MAX_JUDGES`, with a self-check that throws if the clamps drift (lines 32-35). The cap is a literal so a static test can read it (`test/unit/cli/workflows-meta.test.js:39` "declares a positive maxAgents cap"). The default run is ~17 agents, plus 3 for the downstream trio.
- **Budget guard:** `TAIL_RESERVE = 40_000`. If `budget.total && budget.remaining() < 40k`, the script returns the designs without the fact-check and judge stages, flagged `truncated: 'budget'` (lines 206-213). The guard only fires when the caller sets a token target. Without one, the log prints "(no token target set)" (line 64).
- **Effort tiering:** fold `effort: 'low'` (line 188); fact-check and judge `effort: 'high'` (lines 232, 254).
- **Degradation:** fewer than 2 survivors logs "NOT a real competition" (line 203). A dead track is dropped rather than thrown (line 161).

### 1.3 `.claude/skills/queue-triage/SKILL.md` (11.9 KB)

This skill triages the whole issue queue by cost of delay and writes the pass up as a dated note. **Label writes are never the agent's**: its §"The gate — label writes are never yours" (line 139) routes every label change into one batched owner round. That section implements CLAUDE.md's "second filter", row 1 (shared state). The incident behind it: a session labeled 60 issues when the brief said ~12 (CLAUDE.md DEFAULT OPERATING MODE footnote).

---

## 2. The doctrine

### 2.1 The founding incident: `2026-07-05-orchestration-discipline.md`

- **What happened:** a "5 designs × 5 iterations + red team + inversion + independent check" request was improvised into **~53 agents** (lines 8-13). "The output was good; the spend was not."
- **Three root causes**, all ARGUED from the one run with no token figures recorded: (1) a cold context per iteration: every fresh agent re-read the grounding pack, "~10-15 minutes and full input tokens per round" (ESTIMATED); (2) all 5 candidates got the full trio, so 4/5 of that spend was discarded; (3) a fixed high iteration count: "Rounds 4-5 produced no material corrections" (an observation, not a measurement).
- **Output:** HARD RULE #25, `engineering/orchestration.md`, and the parameterized workflow. The rule got the full trio on itself (lines 69-98). The red team found that the >10-agent gate "was defeatable by construction" by inventing a "named shape" or by chaining sub-10 fan-outs. **Session-cumulative counting and "pre-registered shape with a committed hard cap" come from that finding.** Inversion flagged over-encoding, which produced the decidable two-question tier test.

### 2.2 `engineering/orchestration.md` (4,399 o200k tokens)

- **Solo is the default.** A fan-out must buy coverage, independence or confidence, or "it's waste" (lines 22-34).
- **Verification ladder** (§ at line 38): tier 0 is self-review plus gates. Tier 1 is maker-checker: one checker, or two for the riskiest changes. Tier 2 is the adversarial trio, **mandatory** when there is blast radius AND the work is irreversible, critical or novel. Two ordered questions decide the tier; the surface does not. "When honestly torn… treat it as novel." Exploration is explicitly tier 0 ("the ladder gates what SHIPS, not what you TRY"). "Harden only what ships": the trio runs on the winner after the human pick.
- **Cost controls 1-8** (§ at line 113): estimate before launch; count **cumulatively across the session**; above ~10, get an explicit OK. The exemptions are pre-registered only: the QUALITY BAR visual sweep (22 agents), a committed workflow with `maxAgents`, and the **8-agent continuation-brief budget** (`engineering/workflow.md:1517`, justified at `:1536`). The other controls: a hard token budget with `budget.remaining()`; iterate warm; refine loops at ~3 or until a round changes nothing; tier effort, not model; `pipeline()` over `parallel()` barriers; machine gates before agent judgment; `log()` any dropped coverage.
- **Additive trio** (§ at line 235): discovery, not verification, never mandatory, "counts session-cumulatively… no pre-registered exemption". It records one observed case for having two trios: "a full trio pass hardened an executive briefing built on the wrong thesis" (ARGUED/anecdotal). The pilot's kill lists "became tickets (#1854, #1578, #1867)."

### 2.3 Model policy: one tier (`model-policy.md`, `2026-07-28-model-tiering-retirement.md`)

- **What was tried:** #1187 (2026-07-26, `6390272c1`) routed `scout`, `fact-checker` and `ci-triage` to Sonnet, `inventory` to Haiku, `prose-checker` to Sonnet, and the rest to Opus. The stated saving was per exploration agent at ~60K in / ~8K out: **$0.50 Opus / $0.20 Sonnet / $0.10 Haiku** (ESTIMATED, retirement note lines 26-37).
- **Retired after a 58-hour window** (`3d83237df`, #1240). The note is candid about its own evidence (lines 39-63). **Observed:** one concrete misroute (`inventory` on Haiku, where a 200K context could not hold a repo-wide sweep), plus the principal's "I have no confidence in any model other than Opus." **Not observed:** "No agent returned a wrong map that was caught… **There is no measured failure here.**" The note justifies the decision by decision rights and asymmetric stakes, not by evidence.
- **What survived:** the gate (an acorn AST parse plus an 11-case mutation table, `AGENT_MODELS=['opus']`), explicit pins ("an unstated policy is an accident of the current `/model` setting"), and **`effort` as the only cost lever** (`model-policy.md` §86-103).
- **Do not switch the session model** (`model-policy.md` §105): caches are model-scoped, so a switch re-reads the whole conversation (ARGUED, consistent with the §3.1 measurement).

---

## 3. Cost levers, with evidence

### 3.1 Context cost (`engineering/development.md` §Context cost, line 570)

**MEASURED** from session transcript `usage` blocks and the o200k tokenizer:

- **Billing model:** across 23 turns the charge was "roughly `0.7 × (new tokens + output tokens)`". A 150,087-token cached prefix "added almost nothing." New context is the cost; cache reads are near-free. (MEASURED on one session. The 0.7 factor is a correlation, not a published price.)
- **Baselines:** 86,790 tokens for a main session before any work (tool schemas ~36.7k, CLAUDE.md ~13.4k). A subagent baseline is **30,074**, and CLAUDE.md is paid again in every agent.
- **Biggest single win:** `npm test` output went from **657,806 → 1,182 tokens** after the TAP reporter was switched to dot across all 39 `node --test` scripts (#2298, `12b6748ca`). The SessionStart hook's output went from **3,763 → 29 tokens** in the same PR.
- **Delegation measured:** a probe agent read a 2.4 MB log for 55,951 subagent tokens and returned ~1,200 tokens. The same read in-thread would have cost 657,806.
- **Thinking** (`2026-09-22-thinking-is-a-third-of-output.md`): 37% of output but **~6% of the bill** over 69 turns. A `MAX_THINKING_TOKENS=4096` cap saves 0.14%, and a cap of 512 saves 2.7% but truncates the hardest turns. The note recommends **against** a cap. This is a MEASURED *negative* result: the lever looked large and was not. The method needed four corrections, and an independent auditor found the last one.

### 3.2 Index and router tiering

- `2026-08-17-context-index-tiering.md` (MEASURED, o200k): `gotchas.md` went **75k → 7k** tokens and the decisions index **96k → 26k**. Each became one line per item plus a per-row `ROW_CAP` gate. An earlier chars/2.85 heuristic "overstated both files by 25-30%" and was replaced. The note leaves `dist/docs/components.json` (95k) and `CHANGELOG.md` (382k) as known open costs.
- **Router budget** (`tools/check-ownership.js:3816-3861`, #1965 `9ddaf454f`): CLAUDE.md is capped at **16,500 o200k tokens**, set against 15,117 at the time. It is currently **13,732** (measured in this audit). The rationale is recorded: a #1897 bake-off measured a **step function at the read boundary**: "the full catalog costs 18x the pick surface because it takes 10-12 paginated reads against 1". So trimming resident text into an extra read is a false economy. The gate's cost is recorded too: ~200 ms and +70 MB RSS, which is why the require is lazy.
- **Regrowth, measured in this audit** (`git show <rev>:CLAUDE.md | wc -c`): 15,062 B (2026-06-18, just after the #2026-06-17 trim, whose target was "~150 lines / ~2.5k tokens") → 22,154 (07-01) → 34,652 (08-01) → **59,406 (09-01)** → 53,436 today. The trim held for about two weeks. The ceiling arrived after the file had quadrupled, and it legitimizes the new size ("the file is allowed to be this size; what is gated is unbounded growth").

### 3.3 Section-reading discipline

This lever is doctrine in CLAUDE.md and `development.md` ("Read sections, not files"). It rests on measured sizes, for example `workflow.md` whole = 29,507 tokens vs §Pre-merge card = 1,204. There is **no gate**; it is discipline only. No before/after session measurement shows its effect.

### 3.4 Bounded waits: prompt-cache economics

`development.md` §Waiting for a slow job (line 434), `tools/wait-for.sh`, `.claude/hooks/warn-unbounded-wait.sh` (#1978 `fee852ed6`, #2021).

- **Incident (observed):** one session left **15** hand-rolled waiters running, **6** of them on the same integration run, still polling after 5 hours.
- **Mechanism:** idling cost is negligible, about 16 s of CPU over 5 h (MEASURED). The expense is the **late fire**. A late fire re-enters an expired cache "at full input price rather than the roughly 10% cache-read price — once per duplicate" (the 10% is a pricing fact, not a local measurement). The fix gives every wait a deadline (default 1,800 s, ceiling 3,600 s, under the cache TTL) and one waiter per job via kernel `flock`, which was the fourth lock design; the first three were each defeated in review.
- **The hook warns and never blocks.** The rationale is that a false positive under HARD RULE #14 would be a permanent tax. Its cost was measured: 1.8 ms per Bash call vs 36 ms for a node parse.
- **No measured savings figure** for the fix itself.

### 3.5 HARD RULE #24: the OpenRouter budget (paid API key)

- The gate is `checkOpenRouterBudget` (`tools/check-ownership.js:7433+`). Our key name may not appear in `docs/**` or `test/**`, or in any `pull_request`/`push` workflow.
- **Sanctioned spenders** (line 7449): `component-gen-eval.mjs`, `generate-voice-samples.mjs`, `intent-bakeoff/judge-eval.mjs`. **Drift:** the CLAUDE.md rule text says "today only `tools/component-gen-eval.mjs`", but there are three.
- A spender must opt in: without `OPENROUTER_ALLOW_SPEND=1` it prints the planned spend and exits. It validates on `--limit 1`, and a per-key cap is set at OpenRouter (`tools/component-gen-eval.mjs:14-51`).
- **Sanctioned workflow:** `studio-e2e-nightly.yml`, "~1c/night" (ESTIMATED, line 7455).
- The **user-facing** side is `2026-06-29-studio-spend-budget.md` (status: in-progress). It adds a four-layer display (Wallet / key / session / cap), a pre-send estimate with a hard stop, a `max_tokens` ceiling, and a cheaper default model. A server-enforced cap "proved infeasible", so the client cap is the enforcer.

### 3.6 CI minutes

- **Integration nightly split** (`2026-06-27-integration-nightly-split.md`): the `integration` job was "~3-5 min in CI (~130-150s cold locally)". Render-regression suites moved to a nightly run on `main`. **No before/after saving is recorded** (the note contains no post-change number).
- **Cost of the split, observed:** `2026-08-10-nightly-invalid-and-silent.md`. A nightly workflow lost `runs-on` and failed validation, with no alarm; "the startup blackout was four nights." Later, `2026-09-02-nightly-liveness.md` measured scheduling drift (a max gap of 34.7 h against a proposed 36 h threshold) and argued for a 48 h threshold. Moving checks off the per-PR path saves PR latency and buys a new class of silent failure.
- **Workflow-efficiency review** (`2026-06-17-workflow-efficiency-review.md`): gating the local pre-push integration tier behind `LATTICE_FULL_PUSH=1` removed a **measured 269 s** warm tax per push. The note is honest that this shifts integration-only breaks onto GitHub minutes (line 268). The merge queue raised Actions runs per merge by "~50%" (ESTIMATED, line 319), offset by dropping a redundant trigger. A "cost tie-breaker" was added to DEFAULT OPERATING MODE, now rule 3, "cheapest path that meets the bar".
- **Drift-watch retirement** (`2026-06-14`, `2026-06-15`): a background auto-rebase watch thrashed CI during a merge train, cancelling and restarting runs and raising a spurious red check. It was replaced by rebase-before-push (HARD RULE #16). The cost is described but not counted.

### 3.7 Render and test cost (engine-side, measured)

- `2026-08-16-render-format-cost-assessment.md`: `waitUntil: 'load'` saved **0.66-0.80 s per navigation, -25% across all 277 shipped decks**, with zero page-count change (MEASURED, shipped in #1677). The largest remaining cost is `mmdc` booting Chrome per diagram, **40.7 s of a 44.3 s** render. The note records "corrected nineteen times": "the measurements held every time, the mechanisms did not."
- `2026-08-23-jsdom-suite-timeout-budget.md` is a *time* budget, not a spend budget. The fix raised the 5 s test timeout to 20 s after measuring 1.8-2.0 s idle and 4.9-6.1 s under contention. It is cost-relevant in one way: a flaky suite nearly got "a real regression in #1312… waved through as contention." An independent checker showed one of the draft's justifications was "a regex artifact."

---

## 4. Usage in practice

### 4.1 Frequency (commit-message grep, whole history of 2,271 commits)

| Term | Commits |
|---|---|
| `checker` (maker-checker, independent checker, "the checker") | 402 |
| `red.team` | 274 |
| `inversion` | 246 |
| `trio` (adversarial/full/the) | 244 |
| `maker-checker` | 215 |
| a review agent + caught/found/refuted/flagged/broke | **315** |
| `design-competition` | 19 |
| `fan-out` | 21 |
| additive trio names | 6 |

**By month (trio / checker mentions vs total commits):** May 3/0 of 660 · Jun 2/52 of 580 · **Jul 161/234 of 486** · Aug 103/140 of 270 · Sep 28/130 of 198. Adoption jumped after HARD RULE #25 (2026-07-05). Trio mentions fall in September while checker mentions stay high. One plausible reading is that tier-1 maker-checker became the routine rung and the trio was used less; the data cannot confirm intent. **Caveat:** squash-merged PRs concatenate every commit body, so one PR can mention "checker" many times. These are PR-level presence counts, not run counts.

### 4.2 Recorded costs (every agent-count or token figure found)

| Run | Agents | Tokens | Source | Outcome |
|---|---|---|---|---|
| Founding design competition, 07-05 | ~53 | not recorded | `2026-07-05-orchestration-discipline.md:9` | good output, overspend → HARD RULE #25 |
| Layout audit visual sweep | 22 (11 makers + 11 checkers) | — | `2026-06-06-layout-audit/README.md:13` | pre-registered exemption |
| Form-migration audit (trio) | 9 | — | `2026-07-09-form-migration-audit.md:3` | found a larger unknown CSS gap. A **second** adversarial pass on the fix branches "caught and hardened two real bugs" |
| Landing perf review (trio), 07-10 | **30** | — | `2026-07-10-landing-perf-katex-defer.md:90` | 24 raw findings, 23 confirmed. **Disproved the LCP diagnosis before code shipped** (the flagged element was a first-run welcome banner). No record of the >10 OK |
| Categorical token design competition | 17 | — | `2026-07-15-categorical-token-contract.md:72` | — |
| Persona-dial design competition | 17 | — | `2026-07-17-studio-persona-dial.md:63` | tracks "converged" |
| Library trio over 4 libraries | 12 | **~1.35M** | `2026-07-18-library-adversarial-trio-backlog.md:6,18` | 51 raw findings, including a real **cadenza self-XSS** on a page holding the BYOK key |
| Landing design competition | cut at **11** on owner instruction | — | `2026-07-30-landing-studio-promotion.md:28` | critiques not folded; no fact-check or judge; "winner" was a human pick on a summary |
| Manifest schema gate reviews | 3 / 2 (4 across two rounds) | ~350k / ~225k (~470k) | `2026-09-01-manifest-schema-gate.md:258,377,427` | "two HIGH defects in the original and three regressions in its fix", all in the gate itself |
| Chart design language competition | 20 (6 tracks) | **3.08M**, 0 errors | `2026-09-07-chart-design-language/README.md:28` | proposals only, none implemented at the time |

Recorded token figures appear in only **4** notes. None records a dollar cost. None compares a trio run's cost against the cost of the bug it caught.

### 4.3 Did the checker or trio change outcomes? Examples

**Real catches (changed what shipped):**
- #2298 `12b6748ca`: a checker and a fact-checker found "four blocking defects, two of which this branch created, and refuted six figures."
- #1965 `9ddaf454f`: a checker broke the router gate's byte-proxy composition check with its own docblock example. With a CSS fence in the headroom the file was 17,342 real tokens against 16,509 reported. The owner then switched to a real tokenizer. A second checker returned 11 findings, all of which re-derived.
- #1758 `a3c7f9f67`: "the adversarial trio refuted that diagnosis, the transitivity argument under it, and three of its 'measured' numbers". The note's thesis was rewritten.
- #2328 `37ed18158`: three sequential checker passes on one parser (1 blocking issue + 1 false claim + 5 minor; then 7 findings; then more).
- #1817 `5e05180b1`: the clearest evidence that the lenses differ. "Two checkers verified it; none of them could have found what was wrong with it, because it was correct." An **inversion** pass then showed the framing was false.
- `2026-08-10-nightly-invalid-and-silent.md`: the adversarial checker found three defects in the draft issue-filing step. One would have commented on a stranger's issue every night.

**Noise and costs:**
- A checker produced "two false positives that would have blocked pre-push" (commit-log line). Another fold recorded "wrong line numbers, a false positive" in the *checker's* output.
- A red-team pass found "three of those seven fixes were wrong": review generating rework on review.
- #2328: a third checker pass "had been killed after **57 minutes** and never reported", then was re-run. The wall-clock cost is real and mostly unrecorded.
- **Review loops nest.** The manifest gate and the us-english/router PR each needed 2+ rounds, and the later rounds found regressions *in the fixes*. The ~3-round cap exists for design refinement, and there is no recorded cap on fix→re-check cycles.

---

## 5. Cost levers ranked by evidence of impact

1. **Cut verbose tool output that enters context.** MEASURED at 657,806 → 1,182 tokens for `npm test`, plus 3,763 → 29 for the session hook, under a measured billing model where new context dominates. Strongest evidence in the repo.
2. **Delegate large reads to subagents.** MEASURED on one instance: ~1,200 tokens returned vs 657,806 in-thread, for 55,951 subagent tokens.
3. **Index tiering (one line per item plus a row cap).** MEASURED at 75k → 7k and 96k → 26k per read-whole. The frequency of those reads is unmeasured.
4. **Warm iteration + harden only the winner + critique once.** ~53 → ~17 agents, by ARITHMETIC. Output quality was held "as good" by assertion, and no token comparison exists. It is still the most-cited structural lever, and later runs conform (17-20 agents).
5. **Bounded waits under the cache TTL.** The incident was observed (15 waiters, 5 h). The saving follows from pricing, not from a local measurement.
6. **Render path (`waitUntil: 'load'`).** MEASURED at -25% render time across 277 decks. This saves CI and local time, not tokens.
7. **Moving checks off the PR path** (pre-push integration opt-in: 269 s per push, MEASURED; nightly split: unmeasured). A **cost was observed**: a silent nightly outage.
8. **Effort tiering (low for folds, high for judges).** Doctrine only. No measured saving.
9. **The ~10-agent cumulative gate.** No compliance data. At least one post-rule 30-agent run records no authorization, and one run was cut by the owner at 11.
10. **Thinking cap.** MEASURED to be *small* (~6% of the bill at most) and rejected. A useful negative.
11. **Model tiering.** Its saving was ESTIMATED ($0.50 → $0.10-0.20 per agent), and it was retired on trust and asymmetry arguments with "no measured failure". It is neither proven harmful nor proven valuable.

---

## 6. Surprises

- **The model-tiering retirement admits it has no evidence.** "There is no measured failure here" (retirement note, lines 39-63). The repo's strongest one-tier rule stands on the principal's withdrawn confidence plus asymmetric-risk reasoning. The note says so candidly. It also contrasts itself with HARD RULE #12's retirement, which *was* empirical.
- **CLAUDE.md grew about 4× after being trimmed for cost.** The 2026-06-17 target was ~2.5k tokens. The file reached 59 KB by 09-01 and is 13.7k tokens now. The eventual budget gate (16.5k) was set *above* the bloated size, on a measured argument that resident text beats an extra read. Meanwhile the router is paid again in every subagent. `development.md` says it is 44% of the subagent baseline, and #2298's commit says 57%: the repo disagrees with itself.
- **The founding incident's cost was never measured.** The rule that governs all fan-outs rests on "~53 agents" and "~10-15 minutes… per round", with no token total.
- **Roster cards are nearly invisible in the record.** `scout`, `ci-triage` and the whole additive trio have zero commit-log mentions. The roles are what get used.
- **Documentation drift in the cost rules themselves.** HARD RULE #24 says one sanctioned spender, and the code lists three. The tiering note says "all nine agents", and there are 12.
- **Checkers keep finding wrong *numbers* in cost and measurement work.** Examples: #2298 (six figures refuted), #1965 (11 findings), the thinking note (four corrections), the render note (nineteen corrections). The measurement culture is real, and so is its error rate. Independent re-derivation is the mechanism that keeps it honest.
- **The same check can pass in two separate places and still leave the design wrong.** The #1817 case shows that correctness checkers cannot catch a wrong framing. It is the only direct in-repo evidence for having distinct trio lenses rather than one reviewer.
