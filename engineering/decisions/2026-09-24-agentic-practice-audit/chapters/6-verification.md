# Audit chapter 6 — Verification, quality, and evidence

Scope: how Lattice (`/home/user/lattice`, 2,271 commits since 2026-04-28) verifies agent-written work in practice. Labels: **MEASURED** = counted or read from the repo/git in this audit; **REPO-MEASURED** = a number the repo's own docs report from their own measurement (not re-run here); **ESTIMATED/REASONING** = judgment, including every other-domain claim in §4.

---

## 1. The verification practices and the incidents that produced them

| Practice | What it requires | Enforcement | Originating incident (evidence) |
|---|---|---|---|
| **HARD RULE #23** — a "verified" claim names its surface and carries an artifact from it; emulation, jsdom, synthetic harnesses and "CI green" are not verification | Drive the real surface (built docs site, real export, real device) or write **UNVERIFIED** | Discipline, no gate | Commit `f92316278` (2026-07-01, PR #666): "PR #658 mobile touch shipped 'verified under emulation' claims true only of a synthetic harness, never … iOS Safari". |
| **QUALITY BAR** (10/10 boardroom rubric) | Rebuild and look; `pixel-check`; 3 widths for web | Discipline | Rubric from the 2026-06-06 layout audit (`engineering/decisions/2026-06-06-layout-audit/README.md`): 58 components, 11 maker + 11 checker agents, six axes. Checkers overturned maker claims, including a hallucinated `anatomyBlock:"quadrant"` value and a false "pills have no CSS" claim. |
| **Parallel reviewer fan-out** (`engineering/visual-review.md`) | Maker pass → independent checker pass (CONFIRM/REFUTE/REVISE) → lead re-renders the top-severity claims ("pixels, not summaries"). Split by whole deck/bucket/breakpoint, never tile a slide | Discipline | The layout audit above is the template. |
| **`tools/pixel-check.js`** | Snapshot PDFs → change CSS → byte-compare, then fall back to per-page ImageMagick pixel count; `--accept` for intended diffs, eyeballed first | Local, on demand | Header: built as "the hard pixel-diff gate for every commit in the `_legacy.css` split" (a refactor meant to be visually a no-op). 43 commit-message lines mention it (MEASURED). |
| **`tools/screenshot.js` at 1440/820/390** | "No website change is done without screenshot evidence at all three widths" | Discipline; now partly gated by `docs/e2e/axe-site.spec.ts` | The a11y gate note (2026-08-19) measured that *every* `scrollable-region-focusable` finding existed only at 390px, so a desktop-only check called those pages clean. |
| **`tools/rasterize-for-review.sh`** | Rasterize PDFs for agent viewing without downscaling; `--region/--crop` for 4K detail, always paired with a whole-slide overview | Tool | The agent image limit is 2000px per image. The header argues that downscaling a 4K render "defeats the purpose of looking". |
| **`engineering/jank.md` + `check:jank`** | Sweep content length and measure whether fixed anchors DRIFT, COLLIDE or CROWD | A tool, gated only through its own `jank-sweep.test.js` arms | An overlap between an absolutely positioned box and a flex box never registers as overflow, so every existing fit gate missed it. The doc's own "What a green run does NOT mean" section admits **no chart can ever fail** the gate (all 21 chart members have no anchor), and crowding is advisory only. |
| **#9 demo deck as evidence** | A change a human can see on a slide ships `examples/<slug>.md` + a committed PDF. Non-visual work puts its evidence in the PR body instead | Discipline | 208 `.md` / 208 `.pdf` in `examples/` (MEASURED). The rule narrows its own trigger with a measurement: over 40 commits, 21 touched `lib/`/`themes/` and only 6 shipped a deck, so a path-based rule would have flagged 15 false violations. |
| **#19 perf evidence** | `npm run bench` before/after, `bench:bless` ratchets `test/benchmark/baseline.json`, and a bench scenario for the optimized path | Discipline. `bench:check` is on demand; `perf-nightly.yml` runs 05:37 UTC | Commit `892da7033` (2026-06-27, #545). The baseline has 9 commits (MEASURED). `workflow.md` §Performance records two cost findings: (a) #1382, the gate was red on a clean `main` for anyone slower than the last blesser, so it now splits WORKLOAD (fails anywhere) from TIMING (fails only on the blessing machine); (b) the calibration probe is noisier than the datasets it normalizes (25% spread across runs, anti-correlated), with "none yet chosen" for a fix. |
| **Export sign-off** | Changes to exported bytes stop for a human: dark + light renders sent for sign-off | Hard human gate | `visual-review.md` §export surface: the "black-chart jargon export" rendered correctly in the live preview and the emulator but exported corrupted. The browser export is a third renderer, and "it downloaded and the toast fired" is a presence check. |

**Practice signal from git (MEASURED, coarse proxies):** 213 commit-message lines contain `UNVERIFIED`, which means agents do use the escape valve. 642 of 2,271 commits (28%) mention checker / red team / adversarial in their message. 286 commits start with `fix`, and 5 are reverts.

---

## 2. Gate-design philosophy (from the seven decision notes)

1. **Gates are the floor, not the ceiling** (`2026-07-17-correction-loop-and-gates-as-floor.md`). Every gate is structural: hex, margins, tokens, WCAG ratios, lint footguns. "None scores the argument." The note found that a gate-driven correction loop pushes output toward bland, because the cheapest path to green is to claim less. Decision: the loop promises a valid, AA-clean first draft, not a good one. The proposed **vision-judge was killed** as "uncalibrated by construction … reliably rubber-stamps". Any future taste signal "MUST be able to fail a structurally-perfect deck".
2. **Budget 0 + a sanctioned allowlist with a justification + fail-on-stale.** `tools/check-ownership.js` is 12,498 lines, with 87 `check*` functions and 31 distinct `SANCTIONED_*` constants (MEASURED). A new sanction carries its justification in the PR, and a stale sanction fails the gate, so the list cannot rot. The lint-coverage note deliberately declined to consolidate this family into one shared implementation (it counted 34 gates at the time).
3. **Exceed-only ratchets with a bless step whose diff is the record.** Examples: `baseline.json` (bench), `test/lint-coverage/baseline.json` (`lint:coverage:bless`), `contrast:player:bless`, and HARD RULE #29's deck glyph ratchet. "The escape hatch is a diff, not a `--no-verify`."
4. **A gate must be able to fail, and the proof is a planted arm.** This is the most distinctive and most expensively learned principle:
   - The invariant suite's overflow assertion **could never fail**: it compared `scrollHeight` with `clientHeight` on an `overflow-y:hidden` section, so the two were always equal for all 61 components. A mutant proved it (`2026-08-24-overflow-oracle-was-inert.md`).
   - The lint-coverage gate checked spelling while a one-line `.gitignore` silently dropped 14 files out of lint. Its replacement has three arms, including a teeth probe written into all 245 directory×language targets. The independent checker found that a `.js`-only probe let 519 `.ts` files go unlinted with every arm green.
   - The axe site gate plants an unnamed button and an `equalRatio` pair each run and requires the scanner to report both.
   - 215 of 590 decision notes use vacuity language: vacuous, cannot fail, inert (MEASURED, grep).
5. **Warn vs block, and a blocking gate is earned.** A browser check becomes blocking "only after an observed nightly green streak, never on hope". `golden-diff` (pixels) "always exits 0" because Skia rasterizes differently across hosts. The deck glyph lint "warns and never blocks". A quarter of per-PR CI spend (6.7 of ~25 runner-minutes, 27%) buys information rather than enforcement (REPO-MEASURED, oracle catalog §3).
6. **Always-on beats a path filter for cross-cutting gates** (`2026-07-22-freshness-gate-always-on.md`). A docs-only PR skipped `build:check` because a new decision doc fed a generated index outside every path filter. It passed PR CI, then was ejected from the merge queue three times with no visible failure. Fix: run the byte-diff freshness gate in the unconditional `lint` job. Contributing cause: a `--no-verify` push.
7. **Scope with fail-closed maps plus a full nightly backstop** (`2026-06-13-gate-strategy-change-detection.md`). The note spells out the agent-specific argument for keeping blocking gates blocking: "no single AI session sees the whole picture", ephemeral sandboxes let a local gate pass because a tool was missing (`pdfinfo missing … gate was skipped`), and "CI is the one environment that can't lie". Scoped gates need an empty-set guardrail, or a green run that rendered nothing looks the same as a real pass.
8. **Name the enforcement boundary honestly** (`2026-08-17-codeql-merge-gate.md`). The ruleset requires exactly one context, `ci`, so a red CodeQL cannot block a merge. On PR #1689 the old beacon posted "CI green" twice while CodeQL had 4 high-severity ReDoS alerts. A human caught them. The fix is an admin change outside the agent's reach, and the note is `status: blocked`.
9. **Token math cannot see a cascade** (`2026-08-19-website-accessibility-gate.md`). The shipped site showed an active nav label at 1:1 contrast while the token-contrast gate was green, because an unlayered `a {color}` beat a layered Tailwind utility. axe files an exact 1:1 as `incomplete`, not a violation. The new gate scans 12 routes × 3 widths × 2 modes plus the open menu, and found 8 defect classes.

---

## 3. Test tiers, cost, and who verifies

**File counts (MEASURED):** `test/unit` has 469 `*.test.*` files. `test/integration` has 86 test/spec files (`test/` total 556). The docs site has 323 unit test files and 129 Playwright `docs/e2e/*.spec.ts`. There are 22 workflows, including 6 nightlies (integration, overflow, perf, preview-e2e, studio-e2e, webkit-baselines, all staggered at non-round minutes) plus modulepreload coverage.

**Oracle tiers (REPO-MEASURED, `2026-08-18-inspection-oracle-catalog.md`):** T0 source/AST → T1 resolved tokens → T2 jsdom → T3 real-browser computed style/geometry → T4 PDF bytes → T5 pixels (never gates) → T6 human/agent eyes (never gates). "Not one required check compares pixels or asks a human to look." Reported figures:
- 6,103 unit tests in 84 s.
- About 60 static ownership checks in 13 s.
- 642 color assertions across 32 files.
- A full code PR costs ~11 min wall clock and ~25 runner-minutes. The integration job takes 8m26 on the critical path.
- One day's volume: 81 `ci.yml` runs, about 1,900 runner-minutes, against ~66 min/day for all nightlies (~30×).
- The same note's fixes cut the pipeline from 10m58 to 8m48 (−20%). The invariant suite went from 216 s to 13–17 s by rendering 61 decks as one.

**Split (ESTIMATED from the above):** merge-blocking verification is 100% machine (`ci` = lint + unit + integration + docs-build). Agent judgment covers visual quality, the maker-checker and adversarial trio (discipline), and the UNVERIFIED labeling. Humans hold two hard gates, merge authorization and export sign-off, plus whatever they spot, as with CodeQL.

**Where machine verification failed in practice (MEASURED from notes and workflow comments):**
- `studio-e2e-nightly` was invalid YAML (`runs-on` dropped by #1500), so it ran zero jobs and nothing noticed: "no workflow lints workflows".
- Once fixed, its `e2e-ai` job was red 6 of 6 sampled nights on one case, which "teaches everyone to ignore its color".
- Seven expensive gates (`overflow:check`, `geometry:check`, and others) were wired to no cadence.
- `npm ci` on Node 24 wedged 4 times in 26 hours, and the wedge is untracked.

**Doc drift found here (MEASURED):** `engineering/development.md` §CI still says `build:check` runs in `unit` and integration is "~2–3 min cold". `ci.yml` (lines 187–226) runs it in `lint`, and the oracle catalog measured integration at 8m26. The verification docs themselves go stale.

---

## 4. Portability — analogues and where it does not translate

Lattice column = evidence above. Other-domain columns = **REASONING, not evidence**.

| Lattice practice | Data science | Data engineering | BI | Microservices | CLI |
|---|---|---|---|---|---|
| #23 name the surface + artifact | Metric on a named, versioned holdout; notebook executed top-to-bottom (not cell-state) | Row counts/checksums from the target warehouse, not the dev sample | Screenshot/export of the deployed dashboard + the query that fed it | Trace/log from staging or canary, not a mocked client | Captured stdout/exit code from the built binary |
| Budget 0 + sanctioned allowlist + fail-on-stale | Lint/leakage checks with justified exemptions | Data-contract violations with an expiring waiver list | Metric-definition drift allowlist | Dependency/API-lint suppressions with owner + expiry | Warnings-as-errors with a sanctioned list |
| Exceed-only ratchet, bless diff is the record | Eval baseline file; a PR may not lower a score without a committed re-bless | Null-rate/freshness thresholds in a committed file | Reconciliation tolerances vs. finance source | Latency/error SLO budget file | Golden-output files (`--update` whose diff is reviewed) |
| Planted arm proving the gate can fail | Inject a label-leak feature; the leakage check must fire | Insert a known-bad row; the contract test must reject it | Plant a known discrepancy; reconciliation must flag it | Contract test against a deliberately breaking provider | A test that must fail on a mutated golden |
| Oracle tiering (T0 static → T3 real engine → T6 eyes) | Static schema → unit on fixtures → full-data eval → human error analysis | SQL lint → dbt tests on seeds → prod-shaped run → analyst sign-off | Semantic-layer lint → query tests → rendered dashboard → stakeholder | Lint → unit → contract → canary → on-call | Parse → unit → golden → human UX |
| Maker-checker visual fan-out | Independent reviewer re-runs the notebook | Second agent re-derives counts | Second agent reconciles to source | Reviewer reads traces | Low value; goldens usually suffice |
| Export sign-off (bytes a human receives) | Model artifact promotion | Backfill/migration approval | Publishing a certified dataset | Prod deploy | Release binary |

**Where it does not translate (REASONING):**
- **Nondeterminism.** Lattice gates on logical facts of a deterministic render (T3). It demotes the nondeterministic tier (pixels) to advisory. ML training/eval is inherently stochastic, so "exceed-only" needs seeds, confidence intervals, or a band like `bench:check`'s variance rule. Even Lattice's band failed across machines (#1382), and its probe is anti-correlated with the workloads it normalizes.
- **Production-data surfaces.** #23 says "drive the real surface". For data and services, the real surface is often production data or traffic an agent must not touch. Lattice's surfaces are all locally reproducible (a headless Chromium, a static site). The closest Lattice analogue is #24: keep the paid key off per-PR paths and put live calls in an opt-in nightly. That generalizes to "real-surface checks against prod-like data run in sanctioned, credentialed, non-agent lanes."
- **Expensive verification.** Lattice's full PR costs ~25 runner-minutes and its costliest sweep (player contrast) ~55 min nightly. A backfill, a full retrain or a load test can cost hours and real money. The Lattice pattern of "one real-surface probe per PR + corpus nightly" transfers. "Run the gates yourself before every push" does not, at that cost.
- **Taste/judgment ceiling.** Lattice explicitly concedes gates certify "not broken". BI and DS have the same gap (a correct but misleading chart; a well-calibrated but useless model). The concession transfers. The 10/10 rubric does not; each domain needs its own.
- **Single-engine assumption.** Several Lattice gates are cheap because one engine (#1) is the source of truth. Microservice estates have N engines, so contract tests replace the "one kernel" guarantee.

---

## Surprises

1. **The flagship invariant could never fail, for the life of the suite** (all 61 components). It was found only by vacuity-testing during an unrelated performance change. Mutation-style "prove it can fail" arms came from repeated incidents, not upfront design.
2. **No required check looks at pixels or at a human's eyes.** All visual quality rests on discipline (#23, the QUALITY BAR, fan-outs), even though the rhetoric is "10/10 boardroom".
3. **The repo killed the LLM vision-judge on its own evidence**: it reliably rubber-stamps and creates false confidence.
4. **The enforcement boundary was narrower than people assumed.** CodeQL is not required, a quarter of CI spend is advisory, and a nightly was silently invalid YAML.
5. **The verification docs drift too** (`development.md` §CI vs. `ci.yml`). The system is gate-heavy yet still relies on humans reading notes.
6. **Heavy adversarial usage.** 28% of commits mention checker, red team or adversarial review. That is a real cost line an org standard should budget for explicitly.
