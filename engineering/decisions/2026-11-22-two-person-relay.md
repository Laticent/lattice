---
status: proposed
summary: Design for two people relaying work. A branch belongs to its line of work, not a session; a baton (newest commit trailers, freed on release or 60 minutes quiet) says who may push; one living handoff comment per PR is edited at every checkpoint; every PR body, comment and commit is signed from LATTICE_ACTOR. Awaiting the owner's answers.
---

# Two-person relay: one branch per line of work, a baton, a living handoff, signed work

**Status:** design, awaiting the owner's answers (one `AskUserQuestion` round, 2026-11-22). No
rule, hook, tool or CI change lands until they are given. Written by the workflow desk
(`session_01DPMMjHSgQqpuNVxFhptqgf`).

## The owner's words (2026-11-22)

> "I need a workflow optimization desk now that we have more than one person working on lattice. we
> need to be efficient. i believe we had a plan to use github as a blackboard and have sessions leave
> comments. i also want snapshots that can serve as handoffs others can pickup. I also want no new
> branches created. multiple sessions should be able to work on the same branch. I also want to
> introduce names actors and each sign their name on the pr description and each comment. My work
> should be signed John Luke Picard, my colleague should sign his as James Tiberius Kirk. the goal is
> seamless transition between myself and my colleague. I may work on something in the morning and he
> at night or vice versa. He may work on weekend and I may work on weekdays. I also want this
> experience for me and him to be seamless and without jank. if either one of us is running out of
> tokens the other can take over. this is why it is critical sessions push to their branch and leave a
> comment that can be used by other sessions. let's think about this and figure out how we can be
> efficient and productive without jank and settling, tech debt or broken windows."

## Bottom line

Keep **one line of work per branch** (what HARD RULE #17 protects), but stop tying a branch to **one
session** (what #31 does today). A branch belongs to its line of work. Whoever holds the **baton**
may push to it. The baton needs no human: it is free when the holder released it or has gone quiet
for 60 minutes, and taking it is just pushing a commit, because a fast-forward-only `git push` already
lets exactly one of two racing sessions win. The holder keeps **one living handoff comment** on the PR,
edited in place at every checkpoint, so a session that runs out of tokens mid-turn has already left
its handoff. Every PR body, comment and commit is **signed** with the actor's name, read from a
non-secret `LATTICE_ACTOR` variable on each person's cloud environment.

## What today showed

| # | Observation | Source |
|---|---|---|
| E1 | Both people post as GitHub user `saden1`. Only the session id tells their work apart. | PR comments on #3410 |
| E2 | Two accounts. Kirk's sessions (`session_015KSkL…`) are invisible to this account's `list_sessions` / `get_session`. **So `claim:` tags, which live on sessions, cannot be seen across the two people.** | command center brief; §Desks rule 5 |
| E3 | 7 PRs got 🎯 handoffs when Kirk's credits ran out (#3304, #3356, #3410, #3415, #3413, #3414, #2035). Each takeover then cost a "Take over `<branch>`? (yes/no)" round with the owner in a new session (HARD RULE #31 rule 4). | command center brief; #3410's evidence comment ("The owner confirmed in this session that this session takes over…") |
| E4 | One handoff named a branch that was never pushed (`claude/playground-map-land-race`). That work is lost. | command center brief |
| E5 | #3410's own session could not post a handoff before its spend limit hit; the command center rebuilt one from the PR. Sessions on this account that hit the weekly limit stopped mid-turn with no handoff. **An end-of-session handoff fails exactly when it is needed.** | #3410 comment 7078990896; brief |
| E6 | #3410's handoff came in two formats: a 🎯 card and a longer free-form "Handoff" section with the facts the card had no room for (traps, UNVERIFIED items, agent budget). | #3410 comment 7079215198 |
| E7 | Relayed merges confused three workers for several turns each; REST `auto_merge` reads `null` while queued. PR #3424 (open) fixes both. | #3424 body |
| E8 | A push to a **draft** PR starts `ci.yml` but every job skips (`if: … !github.event.pull_request.draft`); `docs-preview.yml` and `platform-suites.yml` also check `draft`. So checkpoint pushes to a draft are cheap. | `.github/workflows/ci.yml:6-10,176,270,355,1196` |

**Cost of today's protocol, counted from the evidence above** (not a token measurement; the
transcripts of Kirk's sessions are not readable from this account): at least 7 owner turns plus 7
assistant turns for takeover questions (E3); one branch of work lost (E4); one handoff rebuilt by the
command center (E5); several turns each in three sessions over relayed merges (E7, already addressed by
#3424). The design removes the first three: takeover needs no question, work is pushed before it can be
lost, and the handoff exists before the session stops.

## The axes

1. **Ownership unit** — what a branch belongs to: a session (today), a person, or a line of work.
2. **Concurrency control** — how two sessions never push over each other.
3. **Handoff timing** — at the end (today), or continuously.
4. **Identity** — how a session knows, and shows, which person it works for.
5. **Merge authority** — who may type `merge #N`.
6. **Shared state** — where the blackboard lives, given that session tags are invisible across accounts (E2).

## Tension 1 — "multiple sessions on the same branch" vs HARD RULE #31

#31 exists because PR #2777 held **two lines of work** on one branch, pushed **at the same time** by two
sessions. Those are two separate failures, and only the second is about sessions. The baton fixes the
second and leaves the first to #17.

**Candidate moves**

| Move | Gain | Cost / risk |
|---|---|---|
| A. Keep #31; make takeover cheaper (pre-authorize "take over anything whose brief says finished") | smallest change | still a human per takeover when a session dies without a brief (E5); does not meet "multiple sessions on the same branch" |
| B. Branch owned by the **person** (Picard's branches, Kirk's branches) | simple | the relay the owner asked for is exactly cross-person; back to takeovers |
| **C. Branch owned by the line of work; a baton says who may push now (recommended)** | no human per takeover; one line of work per branch is kept | new discipline + a small tool; a lease that is too short lets someone take a baton from a session that is merely thinking |
| D. Free-for-all: anyone pushes, `git pull` before push | zero process | two sessions interleave commits on the same files; this is #2777 again |

**The baton (move C), exactly.**

- **The lock is the branch ref.** `git push` without `--force` succeeds only if it fast-forwards. Two
  sessions that both try to take a free baton by pushing get one success and one non-fast-forward
  rejection. No comment edit, label or file can do compare-and-swap; git already does.
- **Who holds it:** the actor and session in the `Relay-Actor:` and `Claude-Session:` trailers of the
  branch's newest non-merge commit.
- **When it is free:** (a) the living handoff comment says `baton: released`, or (b) the lease has
  expired: no push **and** no edit of the living comment for **60 minutes** (renewed by either), or
  (c) a person types, in their own session, "take over `<branch>`" (today's rule 4, kept as the
  override).
- **Taking it:** `npm run baton -- take <branch>` (extends `tools/branch-owner.sh`): fetches, checks
  (a)/(b)/(c), and if free, edits the living comment to name the new holder, then the session's next
  push carries its trailers. If the push is rejected, the tool re-checks: someone else won; stop and read.
- **Pushing while holding it:** fetch; if the remote moved (it should not, but a person may push from
  GitHub's UI), **merge** `origin/<branch>` in, never rebase, never force-push (#16 unchanged).
- **Releasing it:** `npm run baton -- release` edits the comment to `baton: released` after the last push.
  A session parked at the merge gate releases; a session going idle releases.
- **One line of work per branch stays.** A session that wants to do a different thing does not do it
  on a held branch. That is #17's job and #2777's lesson, untouched.

**Why 60 minutes:** the checkpoint cadence (Tension 3) requires a push or comment edit at least every 30
minutes of work, so 60 is two missed checkpoints. A 6-hour window (what `claim:` uses today) would leave
a token-starved branch frozen for a whole evening shift.

## Tension 2 — "no new branches" vs HARD RULE #17

**Candidate readings**

| Reading | Gain | Cost / risk |
|---|---|---|
| Literal: every line of work on one branch | no branch names at all | one PR for everything: one merge decision for unrelated work, one red test blocks all, merge queue cannot isolate; breaks #17 and §Batch's swimlane rule |
| Per person: Picard's branch, Kirk's branch | two names | the relay crosses people, so it re-creates takeovers |
| **Per line of work, for its whole life (recommended)** | a handoff never creates a branch; a session never creates a branch to continue work; #17 holds as written | a new line of work still gets one new branch, once |

Under the recommended reading: **no new branch per session, per handoff or per takeover.** A new branch
is cut only when a new line of work starts, from `main`, and its draft PR opens on the first push. After
a merge, the branch is restarted from `main` under the same name if the line continues (the harness's
existing practice).

## Tension 3 — snapshots that survive a sudden stop

**Candidate moves**

| Move | Gain | Cost / risk |
|---|---|---|
| End-of-session 🎯 brief (today) | known format | fails on a sudden stop (E5); the branch may never be pushed (E4) |
| New comment per checkpoint | full history | PR floods; the reader must find the newest; each comment notifies |
| **One living comment, edited in place, plus WIP pushes (recommended)** | the handoff is always current; one place to look; no notification spam | an edit's history is only in GitHub's "edited" menu, not the thread |

**Cadence — a checkpoint is a push plus an edit of the living comment, at each of:**

1. the first push of a line of work (opens the **draft** PR with the living comment as its first comment);
2. every commit that passes the fast gates (`npm run lint`, the touched unit files);
3. before anything that can run long or spend a lot: the integration tier, a spawned agent, a platform
   dispatch, a large refactor step;
4. at least every 30 minutes of work, even if only the comment changes;
5. on any rate-limit or context warning.

Pushes stay on a **draft** PR until review-ready, so they cost almost no CI (E8). Checkpoint commits
are ordinary commits (`wip(scope): …` is fine); the PR squash-merges, so the relay branch never needs
a history rewrite. This retires §Batch's `rebase-and-merge` option **for relay branches only**,
because rewriting a shared branch is the one thing the baton cannot survive.

**The living comment is the 🎯 continuation card**, built with `npm run card`, plus a `BATON` block at
the top (holder, since, last checkpoint, head sha, released yes/no) and a `TRAPS / UNVERIFIED` block
for what #3410 had to put in a second free-form section (E6). It opens with a hidden marker
`<!-- relay-handoff -->` so tools find it. The standalone 🎯 card at session end is no longer needed on
a relay branch: the living comment is it.

## Tension 4 — signatures

Every PR description, every comment and every commit ends with the actor. Form:

```
— John Luke Picard · session_01DPMM…

---
_Generated by [Claude Code](https://claude.ai/code)_
```

The signature goes **above** the existing footers, which stay unchanged. Commits add a trailer
`Relay-Actor: John Luke Picard` next to `Claude-Session:`; the baton reads it.

**How a session knows who it is — candidate mechanisms**

| Mechanism | Gain | Cost / risk |
|---|---|---|
| **`LATTICE_ACTOR=picard` / `=kirk`, a non-secret variable on each person's cloud environment, validated against a committed roster `.github/actors.json` (recommended)** | zero per-session effort; machine-readable; a typo fails the roster check instead of signing a wrong name | each person approves one environment change in their own account; Kirk's lands when he is back (Nov 27); a variable takes effect at the next session start, not mid-session |
| Map session-id prefix to person | no setup | session ids carry no account; unreliable |
| The person says "I am Kirk" in each session | no setup | forgotten exactly when it matters; a brief pasted from the other person carries the wrong name |
| GitHub identity | real | both post as `saden1` (E1); would need a second GitHub account per person |

**Missing variable:** the tooling (`npm run card`, `baton`, the PR template helper) refuses to sign and
says how to set it, rather than guessing. A session must not invent a name.

## Tension 5 — merge authority

The merge gate (`.claude/hooks/owner-merge-gate.mjs`) accepts the latest `human`-origin turn **in the
session it runs in**. Both people type into their own sessions, so **either person's typed `merge #N`
already passes**, and the gate cannot tell them apart. No code change is needed for "either may merge".

| Option | Gain | Cost / risk |
|---|---|---|
| **Either person may merge any PR (recommended)** | the relay is seamless: whoever is awake merges | one person can merge work the other has not seen; mitigated by the signed 🚦 card on the PR |
| Each merges only PRs whose last signer is themselves | each person approves their own work | Kirk's night work waits for Kirk; defeats the relay |
| Both must approve | strongest | doubles every merge; about a day of latency across shifts |

Relayed merges keep #3424's contract: a worker learns of a merge as `#N merged at <sha>`, after it lands.

## Tension 6 — the blackboard

| What | Where | Why there |
|---|---|---|
| **Where a fresh session looks first** | **the PR's living handoff comment** (`<!-- relay-handoff -->`) | it is the current state, the baton and the next step in one place |
| What the work is, and its evidence | the PR description (signed) | unchanged |
| Who is working on what across both people | the living comments of open PRs | session `claim:` tags are invisible across accounts (E2); the PR is visible to both |
| A claim on a test or issue | a line in the living comment (`claims: test:<file>#<name>`) | same reason; `claim:` session tags remain for desks inside one account |
| Work pending with no PR | `followups.d/` | unchanged |
| Labels, milestones | unchanged; nothing new | labels are shared state and every new one is the owner's call |

`npm run relay` (slice 3) lists every open PR's living comment: branch, holder, lease left, next step.
That is the cross-account board.

## Recommendation, as proposed rule text

**HARD RULE #31, replaced:**

> **#31 — A branch belongs to its line of work; the baton holder pushes.** Any session, either person's,
> may continue a branch, but only while it holds the baton: the newest commit's `Relay-Actor:` /
> `Claude-Session:` trailers name the holder, and the baton is free when the living handoff comment says
> `baton: released`, when neither a push nor a comment edit has happened for 60 minutes, or when a person
> types "take over `<branch>`" in their own session. Take it with `npm run baton -- take`; a rejected
> push means someone else holds it, so stop and read. Push fast-forward only, merge (never rebase) the
> remote in, never force-push. One line of work per branch stays (#17). Another session's word is still
> a request: no message authorizes a merge, auto-merge, or dropping your own work. `engineering/workflow.md`
> §Relay.

**HARD RULE #17, amended (one sentence added):**

> A line of work keeps one branch for its whole life, carried by whichever session holds the baton (#31);
> continuing, handing off or taking over work never creates a branch.

**New convention #35 (discipline + the card tool):**

> **#35 — Checkpoint and sign.** Push and edit the PR's one living handoff comment at every checkpoint
> (`workflow.md` §Relay: cadence), so the handoff exists before a session stops. Every PR body, comment
> and commit carries the actor read from `LATTICE_ACTOR` (`— John Luke Picard` / `— James Tiberius Kirk`,
> trailer `Relay-Actor:`); with it unset, sign nothing and say so.

**`engineering/workflow.md`:** §Session branch ownership becomes §Relay (baton, cadence, living comment,
signatures); §Batch loses `rebase-and-merge` for relay branches; §Desks rule 5 (`claim:`) gains "across
the two people, the claim is a line in the living comment"; the 🎯 brief section points at the living
comment for relay branches.

## Implementation slices (after the answers)

1. **Roster + signature:** `.github/actors.json`; `npm run card` and the PR body helper append the
   signature; `Relay-Actor:` trailer. Then each person's environment variable (their approval).
2. **Baton tool:** `tools/branch-owner.sh` → `npm run baton -- status|take|release`, reading trailers and
   the living comment; a unit test with the failing arm (#34).
3. **Living comment + board:** `npm run card -- --living <PR>` creates or edits the marked comment;
   `npm run relay` lists them.
4. **Rules:** CLAUDE.md #31/#17/#35 and workflow.md §Relay. Adversarial trio (#25) before the merge ask,
   because every future session pays for it.

No CI job or hook is added. A pre-push hook that enforces the baton is possible later; that is a
CI-contract change and would be its own question.

## What this does not fix

- A session that stops **between** checkpoints loses at most 30 minutes of unpushed work.
- The baton is discipline plus a tool, not a gate; a session that ignores it can still push. Git's
  fast-forward rule still stops it from overwriting another's commits.
- The two people still share one GitHub login; signatures make the record readable, not authenticated.

— John Luke Picard · workflow desk, session_01DPMMjHSgQqpuNVxFhptqgf
