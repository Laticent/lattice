---
status: in-progress
summary: Design for two people relaying work. A branch belongs to its line of work, not a session; a baton (newest commit trailers, freed on release or 60 minutes quiet) says who may push; one living handoff comment per PR is edited at every checkpoint; every PR body, comment and commit is signed from LATTICE_ACTOR. Decided 2026-11-22: the owner picked every recommendation.
---

# Two-person relay: one branch per line of work, a baton, a living handoff, signed work

**Status:** decided 2026-11-22 (the owner picked every recommendation in one `AskUserQuestion`
round in the workflow desk's session; see §Decisions). The build lands in the same PR. Written by the
workflow desk (`session_01DPMMjHSgQqpuNVxFhptqgf`).

## Decisions

- D1 Baton: 60-min lease, 30-min checkpoint floor (cadence as written in the note).
- D2 Branches: one branch per line of work, for its whole life; continuing/handing off/taking over never creates a branch.
- D3 Signature: LATTICE_ACTOR env var (picard / kirk) validated against a committed roster; unset → tools refuse to sign.
- D4 Merge: either person may merge any PR (no gate change); build now, Kirk reviews on the PR when back (Nov 27) and objections get changed.

## Decisions, revised 2026-11-23

After the command center's red-team and inversion reviews, the owner answered in the command center
(an `AskUserQuestion` at 12:27 UTC, verified in its transcript):

- **D1 lease, replaced: "No: only explicit release."** No clock frees a branch. A branch frees only by its
  holder's release (at a checkpoint the rules name, at 90%, or when done) or the owner's typed "take
  over". Why: the 60-minute lease stranded work. A session waiting overnight for an answer lost its branch,
  and the answer landed in a session that could no longer push; the lease also never expired on some tips
  (R2). **The cost the owner accepted:** a session that dies without releasing holds its branch until the
  owner says "take over". The push-time reading that fed the lease is gone with it.
- **U3′, replaced: "Checkpoint, keep working."** At 75%: checkpoint and make the work easy to take over,
  then keep working; release-gate work never pauses. At 90%: checkpoint, stop and release. Why: pausing
  everyone at 75% threw away the point of two accounts and could leave nothing running in release week.
  The cost U3′ accepted (all work stops at 75% with nobody awake) is gone.
- **Merge timing: "we don't want to settle, tech debt, broken windows or jank."** Instead of the offered
  options (merge a core now, defer, or merge all now), the owner asked for no split: every red-team finding
  fixed at the root before merge, and the cross-account behavior proven as far as a simulation honestly
  can, with the remaining gaps stated.

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

## As built (2026-11-22, PR #3427)

The build follows D1-D4. Review by the adversarial trio (red team, inversion, checker) changed six
things in the design above; where this section and the text above disagree, this section wins.

| Design said | Built | Why |
|---|---|---|
| holder = newest **non-merge** commit's trailers | holder = newest commit, **merges included**, that carries a `Claude-Session:` trailer | rule 5 tells the holder to merge the remote in; skipping merges made a holder who had just pushed read as free, and a person's web commit read as an unknown holder for 60 minutes |
| lease from the commit time | lease from **GitHub's push timestamp** for the tip (repository activity API), or the living comment's `updated_at`; a push GitHub does not list yet reads as just made | a commit date is set by the committer's clock and can predate the push by hours, so a commit made at 09:00 and pushed at 10:05 read as expired at once |
| `baton: released` frees it until the next push | the release **pins the tip** (`head:` line); it holds only while the tip is unchanged | a time comparison let two sessions both read free after a release |
| the living comment is any comment with the marker | the **oldest comment that starts with the marker, written by our own login** | the repository is public; a stranger, or one of our own cards quoting the marker, could become the living comment and free every baton |
| `take` edits the living comment to name the new holder | `take` checks, and on a free baton pushes an empty claim commit (revised 2026-11-23, after the simulated handover); **the push takes the baton**, and the holder's next checkpoint updates the comment | two racing `take` edits could name the loser as holder; a ref push lands for exactly one |
| a checkpoint every 30 minutes caps loss at 30 minutes | the cap was false: the pre-commit hook can run the whole unit suite (about 6 to 10 minutes) and refuses red work. A comment-only checkpoint renews the lease; a session that stops loses what it had not pushed | the inversion review measured the hooks |

Also added: `npm run relay -- trailer` prints the `Relay-Actor:` line (nothing writes it for you; a hook
would be a CI-contract change), checkpoint before any wait on a person, and a taker parks a ready PR with
`npm run pr:park` before pushing. The CLAUDE.md rule text is compressed from the proposal above to fit the
file's 16,500-token ceiling, and #31 gained one clause: on a relay branch, merging a conflicting `main` in
overrides #16's rebase.

The owner answered the PR's ❓ card on 2026-11-22 (in the workflow desk's session):

- **Rescue refs (D1: B).** A session that loses the race pushes its rejected commits, without force, to
  `relay-rescue/<branch>/<session>` with `npm run baton -- rescue`; the holder merges it into the line and
  deletes it. Built in this PR.
- **Automatic signatures (D2, D3: yes to both).** A commit-msg step writes `Relay-Actor:` from
  `LATTICE_ACTOR`, and SessionStart warns when it is unset. Both are hook changes, so they are the next
  PR in this line of work after this one merges, with the adversarial trio and the card grader:
  `followups.d/3427-p1-relay-actor-commit-msg-hook.md` and
  `followups.d/3427-p2-session-start-actor-warning.md`.
- **Usage pauses (D4: A), superseded.** The owner's answer was that each paused session asks again in
  its own chat, with no #31 exception. The second usage round then made the 75% pause the session's own
  rule (U3, revised, below), so there is no relayed pause left to ask about.
- The three vetoes stand (merge-not-rebase on relay branches, the compressed rule text, §As built).

## Usage checkpoints (decided 2026-11-22)

The owner added a requirement in the workflow desk's session: every running session hands off at 25, 50,
75 and 90% of the account's weekly usage. Two `AskUserQuestion` rounds settled it (about 20:12 and 21:00
UTC); the second, after the owner asked for a deeper look, replaced the first round's answers to U1 and
U3.

**How a session reads the level (verified 2026-11-22).** Every session's transcript carries
`rate_limit_event` entries: Claude Code writes one each time the account's rounded weekly percentage
moves. A session reads its own:

```
list_events(session_id=<own id>, kinds=["rate_limit_event"], limit=100)   # no cursor: newest last
→ rate_limit_event.internal_anthropic_catchall.rate_limit_info.unifiedWindows.seven_day.utilization
```

The desk's session read 0.27, 0.28, 0.29 and 0.30 this way (the top-level `utilization` matched). No
command center, settings change or hook is needed, so the status-line probe is dropped. Caveats: the field
sits under `internal_anthropic_catchall` and is undocumented, so it can change; when it cannot be read, the
session treats the level as unknown and says so. `get_session`'s `rate_limit_info` drops `utilization`
(only `status`, which flips to `allowed_warning` at about 25%), which is why the percentage first looked
missing. At the limit itself, the CLI injects: "Usage limit reached — grace window active. Wrap up: finish
or checkpoint; don't start subagents or long work."

- **U1 (revised) Source: each session reads its own level** at every checkpoint (the 30-minute floor and
  each of the checkpoint moments in §Relay rule 6), as above. At 25 and 50%: checkpoint, then continue.
  The command center's `usage N` broadcast is optional, not the mechanism: it only prompts a session to
  read its own level now. A broadcast never pauses a session by itself (#31: no message stops a
  session's work). When a session cannot read its level, it says `usage level unknown` at each
  checkpoint and carries on; if a broadcast then says 75% or more, it checkpoints, releases the baton
  and asks the owner in its own chat whether to pause. *The owner's last recorded answer was "command
  center only", given before the investigation found this source; the self-read is confirmed at the
  merge card.*
- **U3 (revised) At 75%, every session pauses by default** (the owner's answer: "Everyone pauses").
  It checkpoints, runs `npm run baton -- release`, and writes, in the living comment AND in its own chat,
  `paused at 75% (seven_day <pct>); I can't judge my own criticality`. A session never declares itself
  critical. It then checks `list_sessions` for a live session tagged `command-center` on its account: if
  there is one, it says the command center will propose which sessions resume; if not, it says only the
  owner can resume it. It resumes when the owner says `keep going`, typed in that session or relayed from
  a keep list the owner approved in the command center. Resuming starts with `npm run baton -- take`:
  the other person's session may have taken the branch meanwhile, and then the session stays paused and
  says so. Resuming continues the session's own work, so a
  relayed resume is not on #31's list (stopping, dropping, reverting, pulling). The pause is the
  session's own rule, not another session's order, so D4's second ask is moot and #31 needs no exception.
  Critical work for a keep list is still release-gate work (meta, Segno), red-on-main fixes (#33), and
  work needed to reach a merge the owner already asked for.
- **U2 At 90%, for a session kept past 75%:** checkpoint, then `npm run baton -- release`, so a session on
  the other person's account (a separate weekly limit) can take the branch at once. Mandatory.
- **U4 Spend past 75%.** The raise loop is capped at 1 round; no new multi-agent fan-outs; only the
  mandated card checker runs. Work that needs the adversarial trio is **not started** past 75%: it waits
  for the reset, and the trio is never skipped; work whose trio stage falls past 75% stops at a checkpoint
  before it. A card that could not be raised says so in its `raised` row, and the usage cap is a stop
  reason for the raise loop.
- **The cost the owner accepted:** when 75% arrives with nobody awake, all work stops until someone
  answers, and up to 25% of the week can go unused.
- **Accounts.** Each account's meter is separate, and Kirk's sessions are invisible to Picard's command
  center, so each person's command center reaches its own sessions only.

These are workflow rules in `engineering/workflow.md` §Relay; no tool, hook or CI step changes.

## The simulated cold pickup (2026-11-23)

The owner approved a simulation: a fresh session on this account played James Tiberius Kirk
(`LATTICE_ACTOR=kirk`, GitHub only, starting cold), session `session_01DPMMjGBqfQgvcc5CHWpJQ8`.
Credit for the findings below is that session's.

**What worked.** From the PR body, the living comment and §Relay alone it found the protocol;
`npm run baton -- status` gave a clear FREE with its reason; `npm run relay -- trailer` and `-- sign`
printed the Kirk lines.

**Where it stopped, correctly, before taking the branch:**

1. **The rules were not yet in force.** §Relay and the new #31 live only on the unmerged branch; `main`'s
   #31 still forbade pushing to another session's branch. The relay rules apply once this PR merges, not
   to the PR that introduces them.
2. **The handoff contradicted §Relay.** The 🎯 card's STANDING ORDERS still said "push only to your own
   branch; never push to another session's (#31)". Fixed: "push only while you hold the baton".
3. **`take` did not mention rule 7** on a ready PR. Fixed: it refuses with the `npm run pr:park` hint.
4. **No rule for a branch parked at the merge gate**, where any push voids the owner's 🚦 card. Fixed: a
   parked branch is not takeable unless the owner reopens it (§Relay rule 8, `release --gate`).
5. **An owner approval recorded in another session cannot be checked from Kirk's side.** By design: under
   #31 the owner's word arrives in the session that acts.
6. **No instructions for setting `LATTICE_ACTOR`**, and a stale handoff line that this worker "signs
   inline as picard on the desk's word". Fixed in §Signatures; the line is gone.
7. **The PR disagreed with itself on the leftover test refs.** There are three:
   `claude/relay-race-probe-1795380296`, `relay-rescue/claude/relay-race-probe-1795380296/session_RACEaaaa`
   and `…/session_RACEcccc`.

The owner chose to fix these, merge, and re-run the simulation on real work under rules that are in force.

### The simulated handover (2026-11-23, throwaway draft PR #3482)

The owner approved a second run in #3427's budget (command center, 14:08 UTC). Picard's session put
#3427's code on the throwaway line `claude/relay-sim-handover`, wrote its living comment and released the
baton at `1208389`. Kirk's session (`session_01DPMMjGBqfQgvcc5CHWpJQ8`, `LATTICE_ACTOR=kirk`) picked it
up cold. #3427 had not merged, so `main`'s #31 still applied, and the owner typed "OK to push to #3482" in
Kirk's session (14:55 UTC, verified in its transcript).

**What happened, all on real GitHub.**

| Step | Who | `baton status` after |
|---|---|---|
| release at `1208389` | Picard | FREE (released at `1208389`, still the tip) |
| one commit `b4675b4`, trailers `Relay-Actor: James Tiberius Kirk` + Kirk's session, pushed fast-forward | Kirk | YOURS (to Kirk) |
| `card --living 3482` (holder line names Kirk), then `release` | Kirk | FREE (released at `b4675b4`) |
| take back: `1208389` is an ancestor of `b4675b4`, so nothing was forced | Picard | FREE; the board shows Kirk as holder, released |

**What the taker hit, and what changed.**

1. **A worktree with linked `node_modules` fails the pre-push gate** (38 "file belongs to no part" paths
   outside the repo). It was Kirk's setup, not the commit. §Relay rule 4 now says to work in a checkout
   with its own `npm install`.
2. **`card --check` refused a `relay:` block**, so the exact living card could not be dry-run. `--check`
   now validates the block.
3. **`baton take` recorded nothing**, though its name suggests a claim: two sessions could both read
   FREE, both start work, and the loser found out only at its first push. **Now `take` claims
   atomically**: on a free baton it pushes an empty commit (`chore(relay): take the baton`) carrying the
   taker's trailers on top of the tip, without `--force`. Git lands only the claim that fast-forwards, so
   the second taker is refused (exit 1) before it has done any work.
   - *Why a commit on the branch ref.* The ref is the only compare-and-swap GitHub gives us. The living
     comment cannot lock: both people share one login, so either can edit it, and a GitHub comment edit
     has no "only if unchanged". A separate `relay-claim/<branch>` ref would be atomic on its own but not
     with the branch, so a session could hold the claim ref while another pushes to the branch.
   - *What it costs.* One empty commit per handover, which the squash merge folds away, and the
     pre-push hook (about a minute) before the claim lands. The commit has the tip's own tree, so it
     changes no file; on a draft PR its CI run is cheap.
   - *What it does not change.* `take` on a baton you hold, or on a branch that does not exist yet,
     pushes nothing. A held baton still needs the holder's release or a person's "take over".
   - *Proven on real GitHub* (#3482, 2026-11-23), two `take` runs started at the same moment each time:
     - Race 1, from `b4675b4`: one claim landed (`4436dfb`, stand-in `session_RACEbbbb`). The loser was
       refused by GitHub's ref lock (`[remote rejected] … cannot lock ref … but expected b4675b4`), not by
       git's "non-fast-forward", and so exited 3 ("NOT yours") instead of 1. `take` now reads that refusal
       as a lost race too; the test uses the real message.
     - Race 2, from `4436dfb` after the stand-in released (its `release` renamed the comment's holder to
       itself, the checker's finding 1): one claim landed (`26f326d`, stand-in `session_RACEcccc`), and
       the loser exited 1 with "Not taken … Do no work here".
     - Take-back: the race-2 loser was Picard's session, so the stand-in released and Picard's
       session ran `take` again alone. Its claim `1f1fb76` landed on `26f326d`, and Picard's session
       wrote the closing handoff and released, leaving the throwaway line FREE under a real session.
4. **The sim line's only setup commit was empty**, so Kirk's note had no file to go in, and it went in
   this note on the sim line. That throwaway branch never merges; this section is the record.
5. **UNVERIFIED: a second real GitHub account.** Both sessions share one login, so the signatures make
   the record readable but not authenticated (see "What this does not fix"). It stays unverified until
   Kirk runs the tools on his own account (he is back 2026-11-27).
6. **The rules were not in force for the run.** #3427 had not merged, so `main`'s #31 still applied,
   and the push rested on the owner's OK typed in Kirk's session, as the handoff's TRAPS line said it
   would.

## Checkpoint rules and the usage watch (2026-11-23)

Two owner directions typed in the command center on 2026-11-23 (verified in its transcript, 12:06 UTC),
relayed by the workflow desk: "write the checkpoint rules" and "set the usage watch, this needs to be
cannon and durable". Earlier, the owner had answered "yes, update in place" when asked whether a handoff
is duplicated or updated at each level.

- **Checkpoint rules** (`workflow.md` §Relay): finish the step and stop there; push only what passes the
  hooks (`wip:` if partial, never `--no-verify`); write the plan instead of pushing broken work; mark the
  PR draft, or the card stale; update the handoff in place. At 75%, pause and ask; at 90%, release.
- **Usage watch**: a recurring scheduled task on the command center, every 2 hours, that reads its own
  `rate_limit_event` and broadcasts `usage N` once per crossed level per week. It is the backstop for idle
  sessions, which take no turns and so read nothing. Each new command center re-creates it on its first
  `/fleet` if it is missing (`.claude/skills/fleet/SKILL.md`). Created 2026-11-23 as
  "Usage watch: checkpoint at 75% and 90%" (`7 */2 * * *`).
- **Fan-out trigger** (the owner's "do all three", command center, 12:12 UTC, item 2 as relayed): a session
  about to launch more than about 5 agents, or a workflow, checkpoints first, because a large fan-out can
  carry usage past 90% between two watch ticks. In `workflow.md` §Relay and `orchestration.md` §Cost
  controls.

## The command center's review (2026-11-23)

An independent red team and Munger inversion, run from the command center on #3427 and #3454, found
fix-level defects (folded in here) and design-level questions (put to the owner separately):

| # | Finding | Fixed by |
|---|---|---|
| R2 | the lease never expired on a tip GitHub lists as a branch creation or force-push, not a push (demonstrated on `claude/carbone-first-category-followup`) | first fixed in the lease (every tip activity counted); then removed at the root with the lease itself (revised D1) |
| R4 | rescue refs were orphaned: the loser could not post, the tools did not list them, and merging one could hand the baton to the dead session | `rescue` posts a marked PR note; `status` and the board list rescue refs; the holder is read first-parent; rescued work is described in the note, not the handoff |
| R5 | an owner answer could be stranded when the lease lapsed during the wait | checkpoint right after an owner answer; quotes say where they were typed |
| R6 | a usage stop looked like finished work | `release --pause` writes `pause: usage stop at <time>` (now used at 90%); the board shows it |
| R7 | any session on the shared login could write `baton: released` or a gate | both count only under the tip holder's own `holder:` line |
| R8 | a parked session's refresh dropped the gate | a refresh at the parked head keeps `released` and the gate |
| R9 | only the weekly window was read | read every window and act on the highest |
| R10 | branches with no open PR do not appear on the board | at the root: `baton take` refuses a branch that exists with no open PR (open a draft first), and `status` says when the PR is missing or closed |
| R11 | the board read the PR's commit list, which stops at 250, oldest first | it reads the newest 100 from the tip and walks first-parent |

## What this does not fix

- A session that stops loses what it had not pushed (see §As built).
- The baton is discipline plus a tool, not a gate; a session that ignores it can still push. Git's
  fast-forward rule still stops it from overwriting another's commits.
- The two people still share one GitHub login; signatures make the record readable, not authenticated.

— John Luke Picard · workflow desk, session_01DPMMjHSgQqpuNVxFhptqgf
