---
status: proposed
summary: >
  Design for a durable handoff folder. Each line of work keeps handoffs.d/<slug>/HANDOFF.md plus
  artifacts/ on its own work branch. The baton holder updates it, it travels with every handover,
  and the session removes it in the last commit before the merge ask; a new rule inside the existing
  build:check fails when it would reach main. The PR's living handoff comment becomes a summary npm run card generates from HANDOFF.md. The
  owner decided the shape, place, lifecycle and single source on 2026-11-23. The size and secret
  limits are desk defaults the owner can veto. Nothing is built yet.
---

# Handoff folder: `handoffs.d/<slug>/` on the work branch, removed before merge

**Status:** proposed; the build has not started. The owner made decisions H1, H2, H3 and H5
in the workflow desk's session (`session_01DPMMjHSgQqpuNVxFhptqgf`). H4 is the desk's default, open
to the owner's veto. This note is docs only: no tool, gate or workflow rule changes until the
follow-up PR in §Implementation slices.

**Builds on** the two-person relay, PR #3427
(`engineering/decisions/2026-11-22-two-person-relay.md`, `engineering/workflow.md` §Relay). That PR
makes a branch belong to its line of work, adds the baton (who may push) and the living handoff
comment. This note adds the place a line of work keeps what a comment cannot hold. If #3427 changes
before it merges, the slices below change with it.

## Decisions (owner, 2026-11-23)

- **H1 Shape.** `handoffs.d/<line-of-work-slug>/HANDOFF.md` plus `artifacts/`. HANDOFF.md holds the
  owner session(s), the status, the 🎯 brief, the open questions with their full context and the
  owner's earlier words quoted exactly, the agent budget used, and gotchas and know-how. `artifacts/`
  holds recipes, small renders, judge packets and measurement tables.
- **H2 Where.** On the work branch itself. The baton holder updates it, it travels with every
  handover, and each line of work has one folder, so two PRs never edit the same file and the merge
  queue never ejects one on a conflict (#1593).
- **H3 Lifecycle.** Removed before merge. A new rule inside the **existing** `build:check` fails when
  `handoffs.d/` would reach `main`; no new CI job or hook. What is worth keeping moves to
  `followups.d/` or a decision note first.
- **H4 Size and secrets** *(desk defaults, not asked separately; the owner can veto either)*. 5 MB cap
  per folder; any single file over 1 MB needs a reason line in HANDOFF.md. Never an environment value
  or a key. GitHub secret scanning is the backstop.
- **H5 One source.** The PR's living handoff comment becomes a short summary that `npm run card`
  generates from HANDOFF.md, so a session updates one thing.

## Why

The presets desk took over a colleague's Wave 1 and found five kinds of state that lived nowhere
durable:

| # | What was lost or nearly lost | Where it lived |
|---|---|---|
| W1 | Gaps G2, G3 and G4 were named but defined nowhere | the colleague's session |
| W2 | The round-6 recipes (`candidates.json`, the study gallery), so the looks that scored 8.5 cannot be reproduced | a sandbox that was reclaimed |
| W3 | The agent budget used: "3" in one session, "4" in the other | two sessions' heads |
| W4 | Know-how: the route budget, the export byte-diff method, the pinned `marp-cli` install, Firefox failures that happen only in the sandbox | reached the taker through one lucky peer message |
| W5 | Artifact links | per-account private on claude.ai, so Kirk cannot open Picard's links |

The living handoff comment from #3427 fixes when a handoff is written (at every checkpoint, before a
session stops). It does not fix what fits in it. A GitHub comment holds at most 65,536 characters,
carries no files, has no diff history a reader can blame, and is not checked out with the code. W2
and W4 need files next to the code; W5 rules out the one file store each account already has.

## The axes

| Axis | Options considered | Picked |
|---|---|---|
| **A1 Where it lives** | on `main` · a separate handoffs branch · the work branch · PR comments only · claude.ai Artifacts · Actions artifacts | the work branch (H2) |
| **A2 How long it lives** | forever · until the next session picks it up · until merge | until merge (H3) |
| **A3 What enforces the end** | nothing · a new CI job · a hook · a rule inside `build:check` | a rule inside `build:check` (H3) |
| **A4 How many sources** | comment and folder each hand-written · folder is the source, comment generated | folder is the source (H5) |
| **A5 What it may hold** | text only (like `followups.d/` evidence) · text plus small images · anything | text plus small images, no PDFs, capped (H4, §Contents) |

## Rejected options

**On `main`, like `followups.d/`.** `followups.d/` works on `main` because an item changes rarely and
each change is a reviewed PR. A handoff changes at every checkpoint, at least every 30 minutes of work
(#3427 D1). On `main`, each checkpoint would need its own PR through the merge queue, and the state
would land after the work it describes. It would also put half-finished work state into every clone.

**A separate `handoffs` branch.** One branch shared by every line of work brings back the race the
baton removes: two sessions on two different lines of work would both push to it, and a
fast-forward-only push rejects one of them for reasons that have nothing to do with its work. The
folder would also not travel with the code it describes, so a taker who checks out the work branch
sees nothing, and a session that forgets the second push leaves a handoff that is out of date with no
sign of it. It adds a long-lived branch, which D2 (one branch per line of work) argues against.

**Delete on pickup.** The taker reads the folder and deletes it. That survives one handover and loses
everything at the second: the know-how in W4 is exactly what the third session needs too. It is the
failure in W1, repeated by design.

**No check.** Removal before merge would rest on memory. The cheapest gate is a few lines inside a run
every PR already makes. Without it, the first forgotten folder puts a few megabytes of stale work
state on `main`, where every gate that walks the tree then reads it.

**Remove before the PR leaves draft.** It saves one CI run, but the raise loop and any handover on a
ready PR then have nowhere to write (§Lifecycle, What this costs).

**PR comments only** (#3427 as it stands). Ruled out by the 65,536-character limit and by having no
files (W2). **claude.ai Artifacts.** Ruled out by W5: each link is private to one account. **GitHub
Actions artifacts.** They need a workflow run to create them and expire after at most 90 days, and
neither person can attach one from a session without a dispatch.

## The contract

### Layout

```
handoffs.d/
  <slug>/
    HANDOFF.md
    artifacts/
      README.md          optional: one line per file if HANDOFF.md's index gets long
      candidates.json
      study-gallery.md
      round-6-judge-packet.md
      route-budget.tsv
      cover-a.png
```

- **`<slug>` is the work branch's name with a leading `claude/` removed and every other `/`
  turned into `-`** (`claude/presets-wave-1` → `handoffs.d/presets-wave-1/`). D2 makes a branch one
  line of work for its whole life, so the slug never changes. The gate does not check the slug
  against the branch: a PR run checks out `refs/pull/<N>/merge` and a queue run checks out
  `gh-readonly-queue/…`, so CI never sees the branch name in the tree. The slug only helps a reader.
- **One folder per branch.** A tree with two folders under `handoffs.d/` is an error: it means one
  line of work merged another's branch.

### HANDOFF.md

Front matter that tools read, then fixed sections that people read.

```markdown
---
line: presets-wave-1
pr: 3401
status: active            # active | parked (baton released) | closing (items being moved out)
owners:
  - John Luke Picard · session_01…
  - James Tiberius Kirk · session_015…
budget: 3 of 4 agent runs (Opus)
updated: 2026-11-23T18:40:00Z
head: 0b81839
---

# Presets Wave 1

## 🎯 Brief
(the fenced 🎯 continuation card, workflow.md §The continuation brief)

## Open questions
### Q1 Does G3 cover the dark cover slide?
Context: …, with the measurements and the options considered.
> "keep the cover as quiet as the agenda slide" (the owner, 2026-11-21, session_01…)
Recommendation and default if silent: …

## Gaps and definitions
- **G2** — …  **G3** — …  **G4** — …

## Agent budget
| Session | Agent | Effort | Why |
|---|---|---|---|

## Gotchas and know-how
- Route budget: …
- Export byte-diff method: …
- `marp-cli` is pinned at …; install it with …
- Firefox fails in the sandbox only because …

## Artifacts
| File | What it is | Made by | At commit |
|---|---|---|---|
| `artifacts/candidates.json` | the round-6 recipes | `node …` | `0b81839` |
```

Each section answers one of W1 to W4: **Gaps and definitions** is W1, **Artifacts** (with how each
file was made and at which commit) is W2, **Agent budget** is W3 (one row per run, so the count is a
sum, not a memory), and **Gotchas and know-how** is W4. **Open questions** keeps the owner's words
exactly, in quotes, with date and session, because a paraphrase of an owner decision is how a later
session re-asks a settled point (CLAUDE.md DEFAULT OPERATING MODE #3). An exact quote is an external
string under `engineering/house-style.md` §1, so the US-English audit must not rewrite it; slice 2
checks that the audit and the typed-glyph census leave quoted lines alone.

**The repository is public, and so is every branch.** The owner's quoted words become public. Quote
only what the owner said in a session about the work, never anything marked private, and never
personal details.

### Contents and limits (H4, desk defaults)

- **5 MB per folder**, counted over every file under `handoffs.d/<slug>/`.
- **A file over 1 MB needs a reason line** in HANDOFF.md's Artifacts table (`reason: …` in its row).
- **Text plus small images.** Recipes, JSON, Markdown, TSV/CSV tables, scripts, and PNG, WebP or JPEG
  renders. **No PDFs:** `checkCommittedPdfs` already fails on a PDF no `PDF_OWNERSHIP` rule claims,
  and pull requests never commit PDFs (CLAUDE.md, cloud sandbox section). CI renders the PR's decks;
  a render worth keeping in the folder is a PNG of the slide in question. No archives and no symbolic
  links, as in `followups.d/` evidence folders.
- **Never a secret.** No environment variable values, no keys or tokens, no `.env` contents, no
  claude.ai links (W5: they do not open for the other person anyway). GitHub secret scanning is the
  backstop, not the check: it runs after the push, when the secret is already public.
- **Nothing for an unfixed vulnerability**, by the same rule as `followups.d/` evidence folders.
- **Every gate that reads the tree reads it**, as for `followups.d/` evidence: a script passes Biome,
  prose passes the US-English audit. Slice 2 lists which gates walk the folder and fixes any that
  would misfire on it (for example a deck-shaped `.md` picked up by `lint:deck:all`).

The cost to the repository is bounded: the folder never reaches `main`, and a squash merge keeps only
the final tree, so clones of `main` never fetch it. That depends on the merge queue's
`merge_method: SQUASH` (`workflow.md` §Merge queue — the facts). **A branch that ever carried
`handoffs.d/` squash-merges only**: the `rebase-and-merge` that `workflow.md` §Batch allows for a
batched PR would replay every checkpoint commit, folder included, into `main`'s history. #3427 rule 5
already turns it off for relay branches. The branch commits stay reachable on GitHub through the PR's
`refs/pull/<N>/head`.

### Lifecycle

1. **Create** the folder with the first checkpoint of a line of work (#3427 §Relay rule 6): the PR
   opens as a draft, and the folder goes in the same push.
2. **Update** it at every checkpoint, in the same commit as the work when there is one. The holder
   writes it; nobody else pushes to the branch (#3427 rule 2).
3. **Keep it through ready, CI and the raise loop.** The folder stays while the PR is ready, so the
   raise loop's judge packets, measurements and checker results (`workflow.md` §The raise loop) have a
   home, and a taker on a ready PR (#3427 rule 7, or a 75% or 90% budget pause) finds the same folder
   a taker on a draft does. The presence check (below) fails only in the merge queue, so ready-PR CI
   stays green with the folder present.
4. **Close** it in the last commit before the merge ask: `npm run handoff -- close` (slice 1). It
   moves nothing on its own. It lists every open question, gap and artifact, and the session moves
   each item worth keeping into `followups.d/`, a decision note or an issue. Recipes and tables can
   go in a `followups.d/` evidence folder, which takes text only and at most 512 KB
   (`followups.d/README.md` §Evidence folders); a PNG or a larger file stays reachable through the
   permalink instead. Then `close` prints a permalink to the folder at the current head, removes the
   folder with `git rm -r`, and writes the permalink into the living comment.
5. **Ask to merge** once CI is green on that head. `npm run queue:precheck`, which every merge ask
   already runs (HARD RULE #16), refuses while `handoffs.d/` is in the tree (slice 2), so a session
   cannot reach the ask with the folder still there.
6. **Reopen** if the PR needs more work after close: the taker parks it (`npm run pr:park`, #3427
   rule 7) and restores the folder with `git checkout <permalink-sha> -- handoffs.d/<slug>`.

**What this costs.** The close commit is a new head, so ready-PR CI runs once more on it unless the
session folds the removal into the last raise-loop fix. The rejected alternative removes the folder
before the PR leaves draft, which costs no extra run but leaves the raise loop and any handover on a
ready PR with nowhere to write, which is the W2 and W4 loss this note exists to stop. Only the owner's
merge needs the folder gone, and CLAUDE.md DEFAULT OPERATING MODE #7 already makes a new head
need a fresh ask, so the removal sits
just before the ask.

### One source (H5)

`npm run card -- --living <PR>` reads HANDOFF.md instead of a hand-written YAML card. The living
comment keeps the `BATON` block that `npm run baton` and `npm run relay` parse (holder, since,
checkpoint, head, next), then a short summary generated from HANDOFF.md: status, owners, budget, the
🎯 brief, the open question titles, and a link to `handoffs.d/<slug>/HANDOFF.md` at the head commit.
The `TRAPS` and `UNVERIFIED` lists that #3427 puts in the comment's `relay:` block move to HANDOFF.md
sections. `CLAIMS` stay in the comment, copied from HANDOFF.md, because `npm run relay` reads claims
from the comment to show the board across both accounts.

Two cases where the pushed HANDOFF.md is not enough, and what the comment carries then:

- **A comment-only checkpoint** (#3427 rule 6: the work is red, or the hooks would outlast the window).
  The pushed HANDOFF.md is behind the work exactly then. The comment gets one free-text
  `since last push:` field, written by `card --living --note "<text>"`, that says what changed and is
  not yet pushed. The next push folds it into HANDOFF.md and clears it.
- **After close.** There is no HANDOFF.md to read. `card --living` falls back to #3427's YAML card
  (with its `relay:` block and `CLAIMS`) and adds the permalink to the closed folder.

## The `build:check` rule

A new arm, `checkHandoffs`, in `tools/check-ownership.js`. It runs everywhere that file runs: the
existing `build:check` (the CI `lint` job and the pre-push hook), `npm run build` (whose first step is
the ownership gate, `tools/build.js`) and `build:check:all`. The format is defined once, in a new
`tools/handoff.js`, the way `checkFollowups` only surfaces `followupProblems()` from
`tools/followups.js`. The arm reads committed files (`git ls-files handoffs.d`, as `checkCommittedPdfs`
does), so an untracked scratch folder never trips it. No CI job, step or hook is added (CLAUDE.md
SECOND FILTER row 2).

**Two kinds of check, because the same arm runs on a work branch too.** The pre-push hook runs
`build:check`, and `platform-suites.yml` and `golden-bless.yml` run `npm run build` when a session
dispatches them on a work branch (`workflow.md` documents branch dispatches, and #3427 rule 6 lists a
platform dispatch as a checkpoint). A rule that failed whenever `handoffs.d/` exists would block every
checkpoint push and every one of those runs, which is the opposite of H2.

- **Shape: always an error**, locally and in CI. At most one folder; a HANDOFF.md with the front
  matter above; total under 5 MB; a reason line for any file over 1 MB; no PDF, archive or symbolic
  link.
- **Presence: an error only in the merge queue**, when `GITHUB_EVENT_NAME` is `merge_group`. The
  queue's run tests the exact tree that lands, so this is the one place the folder is certainly headed
  for `main`. Every other run, a ready PR's `pull_request` run included, prints a notice and passes.
  In GitHub Actions the notice is a `::warning::` line, so it shows on the PR's checks.

`npm run queue:precheck` is the earlier guard: it refuses the merge ask while the folder is in the
tree, so the queue error is the backstop for a session that skipped the precheck, not the usual way a
session finds out. A queue ejection costs one queue run; the precheck costs nothing.

The exact error text (merge queue):

```
handoffs.d/<slug>/ is in a merge-queue tree, so it would land on main. A handoff folder lives
on its work branch and the session removes it in the last commit before the merge ask
(engineering/decisions/2026-11-23-handoff-folder.md §Lifecycle). Move what is worth keeping to
followups.d/, a decision note or an issue, then run `npm run handoff -- close`.
```

The notice (everywhere else):

```
handoffs.d/<slug>/ present (fine on a work branch). Close it before the merge ask:
`npm run handoff -- close`.
```

## Implementation slices (a later PR, after #3427 merges)

One PR, one commit per slice (`workflow.md` §Batch a session's slices).

1. **Tool: `tools/handoff.js`, `npm run handoff`.** `init` writes the skeleton for the current
   branch; `check` reports shape problems (the function the gate calls); `close` runs §Lifecycle step
   4. Unit tests cover each shape problem. Reuse `tools/followups.js` for the evidence-folder move and
   `tools/card.js` for the 🎯 card. Check `dist/engineering/capabilities.md` first (HARD RULE #15).
2. **Gate: `checkHandoffs` with a failing arm, and the precheck refusal.** Add the arm and a unit test
   that proves each kind can fail (HARD RULE #34): a fixture tree with a folder and
   `GITHUB_EVENT_NAME=merge_group` goes red; the same tree with `pull_request`, with
   `workflow_dispatch` and with no variable passes with the notice; a 6 MB fixture and an untracked
   folder show that shape counts committed files only and fails in every context. Add the refusal to
   `tools/queue-precheck.sh`. Before adding the arm, list every gate that walks the whole tree and run
   it over a sample folder, so a deck in `artifacts/` does not trip `lint:deck:all`, and a quoted owner
   line does not trip the US-English audit or the typed-glyph census.
3. **`npm run card -- --living` reads HANDOFF.md** (H5), with the `since last push:` note and the
   fallback after close, keeping the `BATON` block and `CLAIMS` intact for `npm run baton` and
   `npm run relay`.
4. **Docs: amend `workflow.md` §Relay** (added by #3427): the folder in rule 6's checkpoint, the
   close step before the merge ask, squash-only for a branch that carried a folder, and §The living
   handoff comment as a generated summary. Add a `handoffs.d/README.md` with the contract above. The
   CLAUDE.md table row for an idle session names the continuation brief; pointing it at the folder
   changes a canonical doc's meaning (SECOND FILTER row 4), so the PR puts that one-line change to the
   owner as an option, not a silent edit.

Slices 1 to 3 are internal tooling that no user of the engine sees, so they should owe no
`changelog.d/` fragment; the build PR confirms that against `changelog.d/README.md`.

## What this does not fix

- **A session that stops before its first push** leaves no folder, as it leaves no living comment.
  #3427 rule 6 (checkpoint at the first push and every 30 minutes) is the only defense.
- **A folder that is out of date** is still out of date. The gate checks shape and presence, not
  whether HANDOFF.md matches the work. The `updated:` and `head:` fields make staleness visible to the
  next reader; they do not prevent it.
- **Secret scanning is after the fact.** A pushed key is public the moment it lands; rotation is the
  only fix. The rule against secrets is discipline.

— John Luke Picard · workflow desk
