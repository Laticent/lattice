# Audit chapter 3: the workflow, the human gates, and whether practice matches the doc

Repo: `/home/user/lattice`, `origin/main` at `cdf8e9233` (2026-09-24). The clone is full, not shallow (`git rev-parse --is-shallow-repository` returns `false`).
Read-only audit. Doc sections were read one at a time with `sed -n`. No repo file was edited.

**Tags.** MEASURED means I ran the command shown and got the number. SAMPLED means I read a small hand-picked set of PRs on GitHub, and n is stated. ESTIMATED means I inferred it without a full count.

**Conventions.** "PR commit" means a first-parent commit on `origin/main` whose subject ends in `(#N)`. Since the merge queue went live, every one of them is a squash. Excluded as "not authored": `chore(backlog)` mirror commits, commits whose subject starts `build(deps` or `chore(deps`, and bot authors. The raw data (throwaway, not committed) was built with:

```
git log --first-parent --format='@@%h|%ad|%s' --date=short --numstat origin/main > numstat.txt
```

---

## 1. The documented PR lifecycle

| Stage | What the doc requires | Source |
|---|---|---|
| Branch | One feature = one branch → one PR, off `main`. Stacked PRs are forbidden: a PR based on another unmerged branch never CI-tests as a unit. An independent slice *may* get its own branch; it does not have to. | `engineering/workflow.md:42-65`; HARD RULE #17 (CLAUDE.md) |
| Batch | **One PR per session's line of work, one commit per item.** Four exceptions: urgent, risky, a different swimlane, a gallery graduation. The stated motive: 48 of 50 merges fell on two days, and each merge costs one human authorization plus one drift event for every open PR. | `workflow.md:67-103`, added in `ab8331152` (#1779, 2026-08-23) |
| Commit | Subject is `area(scope): short summary`. A local `commit-msg` hook enforces it (`tools/check-commit-msg.sh`, wired at `lefthook.yml:200-203`). | `workflow.md:320-326`; #13 |
| Changelog | One `changelog.d/<slug>.<category>.md` fragment per PR, never a line in `CHANGELOG.md ## Unreleased`. Motive: one evening produced 7 merge-queue ejections, every one a CHANGELOG conflict (#1566 alone was ejected 6 times). The release is supposed to fold the fragments in. | `workflow.md:328-364`; #10 |
| Before the PR | Run unit, integration and lint. Rebuild a PDF for any CSS change. Rebase onto `main`; regenerate generated files rather than hand-merging them; push with `--force-with-lease`. | `workflow.md:366-401` |
| Rebase | Rebase right before each push. The background drift watch was **retired** because it thrashed CI. | `workflow.md:861-880`; #16 |
| PR body | `.github/pull_request_template.md`: Problem/Why · What changed (with a changelog fragment reminder) · Tests (with a Studio e2e checklist) · Performance (with a bench table, #19) · Caveats/not verified · one closing keyword per issue. | template, 68 lines |
| Demo deck | Every change a human can see on a slide ships `examples/<slug>.md` plus its PDF, 6–10 slides. The trigger is the rendered surface, not the `lib/` path. | #9; `workflow.md:141-160` |
| Gallery isolation | Feature content stays out of the long-running galleries until a separate graduation commit. `data-viz-gallery.md` is generated and exempt. | #8; `workflow.md:104-139` |
| Merge | A human authorizes every merge. Batch the ask when several PRs are green. Squash by default; rebase-merge only for a curated series, which the doc says a batched PR is. Never a merge commit. The merge queue has been live since 2026-06-30: approve, arm auto-merge, and the queue rebases and retests. An ejection clears auto-merge silently. Before merging, make each closing issue read true. | `workflow.md:980-1145` |
| Pre-merge card | Fenced 🚦 card, posted on the PR **and** in the ask. Four levels (`low`/`medium`/`high`/`very high`). The confidence is the **lowest-scoring axis** of five: evidence, blast radius, reversibility, unknowns, independent eyes. Every card names its floor axis and a `raise it by:` line. | `workflow.md:1644-1723`; #28 |
| Post-merge | Two fenced cards, 📋 standup and 🎯 continuation brief, posted as one PR comment and in chat. Every pending item goes to `followups.d/`. | `workflow.md:1337-1351`; CLAUDE.md DEFAULT OP MODE table |
| Auto-merge classes | Backlog mirror (`sync-backlog.yml`), release (`release.yml`: dispatching the workflow is the authorization), Dependabot patch/minor (`dependabot-auto-merge.yml`, an allow-list; majors wait for a human). No bypass of the queue, for anyone. | `workflow.md:1146-1321`; CLAUDE.md rule 7 |

## 2. Human gates vs delegated work

**Human gates (hard stops).**
1. **Merge authorization.** Every authored PR, and it never carries forward to the next one (CLAUDE.md rule 7; `workflow.md:982-986`).
2. **Export sign-off.** Any change to the bytes of an exported PDF/PPTX/HTML needs dark- and light-mode renders sent to the human (CLAUDE.md QUALITY BAR).
3. **The "second filter" triggers.** These stop the agent even when a rule points at the change: shared state outside the branch (labels, milestones, board); the CI/hook contract (adding or removing a job, step or hook); a number the human set; the meaning of a canonical doc; anything irreversible or externally visible (merge, release, published artifact, a comment on someone else's PR). Source: the CLAUDE.md "SECOND FILTER" table, added in `86c1eea41` (#1786, 2026-08-24).
4. **A fan-out above ~10 agents per session** needs explicit OK, unless it is pre-registered (#25).
5. **A Dependabot major bump** (`workflow.md:1291-1300`).
6. **A "rethink X" design choice.** One `AskUserQuestion` round before code.

**Delegated to agents (act without asking).** Opening the PR, subscribing to it and driving CI green, rebasing, writing docs and changelog in the same change, running the gates, spawning a checker for blast-radius work, posting the standup and brief, writing `followups.d/` entries, adding a `SANCTIONED_*` allowlist entry or a lint rule "with justification", and anything an issue's acceptance criteria explicitly delegate (CLAUDE.md "Decide and proceed").

**Recording gap (SAMPLED, n=3).** Authorization is recorded only in chat and in agent comment text, never as a GitHub approval.
- #2329, #2067 and #2241 have **zero human GitHub reviews**. #2241 has one bot review (`github-code-quality[bot]`).
- The cards, standups and the auto-merge arming are posted **under the owner's account (`saden1`)**. #2329's card says "Merge authorized by the owner in session; enabling squash auto-merge."
- #1961's card was posted by `claude[bot]`.
- From GitHub's record alone, an agent-initiated merge cannot be told apart from a human-authorized one.

## 3. Measured practice

### 3.1 Volume: PRs per ISO week (MEASURED)

`git log --first-parent --format='%ad|%s' --date=format:'%G-W%V' origin/main | awk …` (counts all first-parent commits and those ending `(#N)`)

| Week | first-parent commits | PR commits |
|---|---|---|
| W18–W21 (Apr 28–May 24) | 67 / 106 / 50 / 4 | 0: direct pushes and 28 GitHub `Merge pull request` commits (#1–#30) under the old SlideWright org |
| W22–W23 | 22 / 36 | 18 / 36 |
| **W24 (peak)** | 239 | 215 |
| W25–W29 | 130 / 128 / 138 / 151 / 147 | 109 / 94 / 133 / 151 / 147 |
| W30–W36 | 60 / 51 / 67 / 57 / 65 / 60 / 88 | same (100% PR) |
| W37–W39 (to Sep 24) | 33 / 31 / 67 | same |

- **Since 2026-06-30, 983 of 983 first-parent commits end in `(#N)` and 0 are merge commits** (MEASURED: `git rev-list --count --merges --since=2026-06-30 origin/main` → 0). "Nothing pushes `main` directly" holds in practice.
- Throughput roughly halved after July: about 140/week in W27–W29, about 60/week from W30 on.
- Total history: 2,271 commits, of which 1,797 are first-parent. 1,456 are PR commits since 2026-05-27 once bots and backlog are excluded.

### 3.2 PR size (MEASURED)

Method: numstat per PR commit (Python over `numstat.txt`). "Hand" lines exclude `dist/`, `docs/public/playground/`, `BACKLOG.md`, `*.pdf`, `*.png`, `baseline.json` and `package-lock.json`.

| Window | PRs | files median / p90 | lines median / p90 | hand lines median / p90 |
|---|---|---|---|---|
| All (May 27 – Sep 24) | 1456 | 11 / 49 | 513 / 2702 | 426 / 2131 |
| Jun | 486 | 8.5 / 40 | 324 / 2072 | 249 / 1205 |
| Jul | 496 | 10 / 37 | 488 / 2070 | 355 / 1557 |
| Aug | 260 | 15.5 / 71 | 964 / 3811 | 780 / 2733 |
| Sep | 196 | 18 / 62 | 1272 / 3614 | 1242 / 3596 |

The median PR grew about 5× from June to September. That is consistent with the batching doctrine (#1779, 2026-08-23) and with agent PRs carrying docs, fragments, followups and decision notes.

**Did batching reduce merge count? No, not measurably (MEASURED).** Same `git log --since/--until` count, bots and backlog excluded:
- 30 days before #1779 (Jul 24–Aug 23): 237 authored PRs, 21 merge-days, max 31 per day.
- 30 days after (Aug 24–Sep 24): 238 PRs, 20 merge-days, max 33 per day.
- The busiest day in the window, 2026-09-24, had 34 first-parent commits.

Single-item PRs persist: #1961 is 2 files, +11/−5, one item.

### 3.3 Changelog fragments after the #1593 fix (MEASURED)

#1593 is an **issue**. The fix landed in PR **#1606** (`74d13fe8b`, 2026-08-11), which created `changelog.d/README.md` (`git log --diff-filter=A -- changelog.d/README.md`).

- **Authored PRs after #1606: 357. With a `changelog.d/` fragment: 325 (91.0%).**
- The 32 without one are mostly `docs` (13) and `test` (9), which plausibly carry no user-visible change. No per-PR judgment was made here.
- 4 PRs touched `CHANGELOG.md` afterward, all legitimate: an archive move (`deca9ebb2`), gap closures (#1785), the org rename (#2076), and #1614 on the cut-over day.
- Before the fix (Jul 1 – #1606), 468 of 597 PRs (78%) edited `CHANGELOG.md` directly.
- **No release has ever run.** `CHANGELOG.md` has `## Unreleased`, then `## 1.0.0 — Initial public release`. There are no `chore(release)` commits and no tags. **627 fragments are pending** (`ls changelog.d | grep -v README | wc -l`).
- So "the release consumes them" (`workflow.md:351-356`) is untested in practice, and the fold will be large.

### 3.4 Commit-subject convention #13 (MEASURED)

Regex `^[a-z][a-z0-9-]*\([^)]+\)!?: \S`, run over non-merge commits with bots excluded.

| Month | first-parent conformance |
|---|---|
| Apr | 78% |
| May | 79% |
| Jun | 96% |
| Jul | 99% |
| Aug | 99% |
| Sep | 98% |
| **Total** | **1595 / 1672 (95.4%)** |

- Non-conforming examples are mostly *multi-area* subjects the regex rejects: `split(envelope) + a11y(subtitle): …`, `studio,playground(split): …`, `chart(quadrant),math,split-panel: …` (#1544). Bare `area:` forms also appear (`narration: …` #2243, `studio: …`), which the hook itself allows (`check-commit-msg.sh` header: "`area(scope): summary` or `area: summary`").
- On `main` the subject is the **PR title**. PR titles pass through no hook: the `commit-msg` hook only sees local commits, and no workflow checks the title (`grep -i title .github/workflows/ci.yml` finds nothing relevant). Conformance of about 98% on `main` is therefore agent discipline, not a gate.
- 78 distinct `area` prefixes appear since Jul 1. The top ones are `feat` 167, `fix` 119, `docs` 114, `studio` 87. That mixes Conventional-Commit types with domain areas, so "area" is loosely defined in practice.

### 3.5 Demo decks, #9 (MEASURED, proxy only)

Share of PRs touching `lib/` or `themes/` that also add or modify an `examples/*.md` at top level:

| Month | lib/themes PRs | with deck | share | CSS-touching PRs | with deck | share |
|---|---|---|---|---|---|---|
| Jun | 208 | 66 | 32% | 130 | 53 | 41% |
| Jul | 191 | 62 | 32% | 73 | 32 | 44% |
| Aug | 142 | 47 | 33% | 76 | 36 | 47% |
| Sep | 119 | 62 | 52% | 59 | 43 | 73% |
| **Total** | **660** | **237** | **36%** | **338** | **164** | **49%** |

- CLAUDE.md #9 explicitly says a path test is *not* the trigger ("21 touched lib/themes, 6 shipped a deck" over 40 commits to `4c9075c`). So this is a ceiling on noncompliance, not a violation count.
- The trend is up: CSS-touching PRs shipping a deck went from 41% to 73%.
- Whether each deck-less visual PR carried other evidence (a golden-diff comment, screenshots in the body) was not checked per PR.

### 3.6 Agent authorship (MEASURED)

First-parent commits on `main` whose body carries `Co-Authored-By: Claude…` / `Claude-Session:` / `claude.ai/code/session`:

| Month | share with an agent trailer |
|---|---|
| Apr | 0% |
| May | 40% |
| Jun | 20% |
| Jul | 100% |
| Aug | 96% |
| Sep | 92% |

- **The June dip is a recording artifact, not human work.** June squash commits have *subject-only bodies*; for example, `git show -s` on #192 prints the title and nothing else.
- Since July, every non-trailer commit is Dependabot (10) or one of 14 others.
- Across all squashed bodies, `Co-Authored-By` lines name Opus 5 (2,532), a generic "Claude" (1,064), Opus 4.8 (959), Opus 5.5 (179), Fable 5 (83), Sonnet 5 (72) and Sonnet 4.6 (50). The non-Opus rows are consistent with the tiering that was tried and retired on 2026-07-28 (#27).
- 1,699 of 1,797 first-parent commits carry the human's name as author (`%an`), because the squash author is the PR opener. **Practically, the repo is single-human, and agents write nearly all of it.**

### 3.7 Pre-merge card, #28 (MEASURED via GitHub search, plus SAMPLED)

- The card was introduced in #1779 (2026-08-23); HARD RULE #28 followed in #1834 (2026-08-25).
- GitHub search, merged since 2026-08-26, Dependabot and github-actions authors excluded: **239 PRs, 226 with `"raise it by"` in comments, 226 with `"Pre-merge"`.**
- About 12 of the 13 without are backlog-mirror PRs (MEASURED: 12 `chore(backlog)…(#N)` commits since 8-26).
- Estimated conformance on authored PRs: **~99% (ESTIMATED from those two counts).**
- Sampled cards all follow the template, with the floor axis and a raise-path: #2329 (`high`), #2241 (`high — evidence`, revised once), #2067 (`medium → high`, revised after acting on the raise-path) and #1961 (`very high`, "nothing outstanding").
- **The raise-path gets used:** #2067's first card said `medium`, raise by viewing the 19 unreviewed decks. The agent did that with 3 reviewers, found a third defect, and re-carded at `high`.
- **Timing caveat (SAMPLED, n=1).** On #2329 the card was posted *after* the in-chat authorization, while CI was still running ("CI … still running at the time of this card"). On the PR it therefore acts as a record, not as the pre-decision evidence the doc describes.

### 3.8 Post-merge standup and continuation brief (SAMPLED, n=2)

- #2329 and #2241 both carry a combined 📋 standup plus 🎯 continuation comment, with priorities, "done when", evidence, verify tier, agent budget ("up to 8 agents, pre-authorized") and a working agreement.
- `followups.d/` holds **91 files** (MEASURED `ls followups.d | wc -l`). That is the durable backlog the doc asks for, and it keeps growing.
- A full count of standup presence failed on the GitHub search secondary rate limit, so it is **UNVERIFIED** beyond the sample.

## 4. Discipline gaps and failure evidence

| Gap | Evidence |
|---|---|
| **Card built from a summary, not the spec** | PR #1834 shipped a card with an invented `medium-high` level, three per-issue confidences, no axis and no raise path (`workflow.md:1669-1671`). This is the incident that created #28 and the CLAUDE.md "INDEX, not the spec" wording. |
| **Merge-queue ejections from shared regions and generated files** | 7 ejections in one evening, all `CHANGELOG.md` conflicts; #1566 was ejected 6 times over about 4 hours (`workflow.md:337-346`). Committed generated bundles caused more: #1686 needed 3 rebase cycles (`engineering/decisions/README.md:439,708` → `2026-08-17-generated-bundles-uncommitted.md`). Ejections on #1535 and #1547 **silently cleared auto-merge** (`workflow.md:1084-1095`). |
| **Automation pushed straight to main and failed** | `sync-backlog` failed with GH013 "for weeks" (#1439; `workflow.md:1152-1160`). |
| **Background drift watch** | Produced N force-pushes and N canceled CI runs; retired (`decisions/2026-06-14-drift-watch-rebase-thrash.md`, `2026-06-15-retire-drift-watch.md`). |
| **Rule set by an agent's own judgment** | CLAUDE.md's second filter was "born from a session that labeled 60 issues `status:ready` when the brief said ~12, and added a CI step on its own judgment." |
| **Stale open PRs** | 44 open PRs (MEASURED, `list_pull_requests state=open`). 12 **authored** PRs are older than 30 days, for example #430 (Jun 18), #479, #520, #689, #727, #1019, #1376, #1432, #1629, #1638, #1778, #1827. Most were last touched within minutes of opening, so they look abandoned, not parked at the merge gate. Nothing in the documented lifecycle closes or sweeps them. |
| **Dependabot backlog** | 10 majors waiting since 2026-08-09, 46 days (#1472–#1476, #1478–#1481), plus 4 older patch/minor PRs (#761, #764, #1378, #1447) that predate `dependabot-auto-merge.yml` (landed `dc2c90ea5` on 2026-08-09) and were never armed. Two grouped patch/minor PRs (#2221, 17 updates; #2237, 34 updates) are open 5–9 days although that class should auto-merge. The cause was **not investigated** (likely red CI). Meanwhile *other* majors did merge: TypeScript 6→7 (#1485), vitest 3→4 (#1484) and @astrojs/react 5→6 (#1486) landed 2026-09-01/02, while the same TypeScript 6→7 bump for the root (#1478) is still open. Whether a human authorized #1484–#1486 cannot be seen from git. |
| **Draft PRs despite "never a draft PR"** | #2161 and #2227 are open drafts; #2227 was opened by `claude[bot]`. |
| **Unreproducible motivating statistic** | `workflow.md:73-76` says "50 merges, 48 of them on two days, 25 on the 17th, 23 on the 18th" over the fortnight to 2026-08-23. I measured **128** first-parent commits in 2026-08-09..23 (`git log --first-parent --since=2026-08-09 --until=2026-08-24 --format=%cd`), 31 on the 17th and 23 on the 18th. The claim does not reproduce on a full clone. It may have been measured on a shallow clone, which the same doc warns about at `workflow.md:1060-1064`. |
| **Reverts** | 1 `revert(…)` subject (#954), plus #1386, which reverted an "unmeasured optimization". There are few formal reverts, so the fix-forward culture dominates. |

## Where practice diverges from the doc

1. **The sanctioned rebase-merge for batched PRs never happens.** The doc calls it "the sanctioned `rebase-and-merge` case" (`workflow.md:95-103`). But all 983 commits since the queue started are single squashes titled `(#N)`, and the same doc says the queue's own method decides (`workflow.md:1037-1043`). Batched PRs lose per-item revert granularity on `main`. The two passages contradict each other.
2. **Batching did not cut merge frequency.** The 30 days before and after #1779 had the same count (237 vs 238). PRs got bigger; the number of interruptions did not fall.
3. **Human authorization is invisible on GitHub.** There are no approving reviews, and agents post and arm auto-merge under the owner's identity. The gate exists only in chat transcripts, which the doc itself calls "not a durable surface" (`workflow.md:1660-1662`).
4. **The release fold is untested.** 627 fragments are pending and there has never been a release after 1.0.0.
5. **PR titles are not gated.** #13 conformance on `main` is about 98% through discipline alone; the enforced hook only sees local commits.
6. **Stale-PR hygiene is undocumented.** 12 authored PRs have been open for 30+ days, and the Dependabot majors gate has become a backlog.
7. **The demo-deck rule is partially followed.** 49% of CSS-touching PRs overall, though rising to 73% in September.

## Surprises

- **The pre-merge card is the most-followed rule measured** (~99% of authored PRs since 8-26). Its `raise it by:` line demonstrably changes agent behavior: #2067 went from `medium` to `high` after the agent acted on it.
- The doc is unusually self-auditing: it corrects its own statistics ("do not drop the `--since`", "an earlier draft … staled a figure"). Even so, its headline batching statistic does not reproduce.
- Continuation briefs pre-authorize the *next* session's agent budget ("up to 8 agents, pre-authorized — don't ask"). A human-set number travels agent to agent through PR comments.
- The median PR in September is about 1,270 lines across 18 files. A human reviewer is plainly not reading diffs at that rate (~60 PRs/week). The card, not the diff, is the review artifact in practice.
- A single human account authors about 95% of `main`. Model trailers show at least 7 Claude model variants over five months.
