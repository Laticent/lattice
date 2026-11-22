---
status: in-progress
summary: >
  How the command center and desks run many Claude sessions with one human: the workflow, the patterns it borrows
  (orchestrator-workers, supervisor trees, a blackboard, incident command, the two-person rule), what heals itself
  and what does not, and the gotchas paid for on 2026-11-21. Adds eight desks the owner picked for launch
  (jank, polish, a11y, docs, devices, release, feedback, stress); frontier and a Starfleet vocabulary stay proposed.
---

# The fleet: a command center, desks, and one human (2026-11-21)

**Answer.** Lattice is built by one person and many Claude sessions at once. On 2026-11-21 the fleet ran about 25
sessions and merged more than 30 PRs in a day. The structure that makes that safe has three layers:

- **One owner** who makes every merge, CI, shared-state and naming decision, by typing it.
- **A command center** session that sees everything, proposes numbered actions, and carries out only what the
  owner types.
- **Desks**, long-lived sessions that each own one kind of problem (flaky tests, merges, stale PRs, CI cost) and
  start worker sessions to fix it.

None of the pieces is new. Each one is a known pattern from software, operations or safety engineering. What is
new is that every role except the final decision is an agent, so the rules that a human team carries as trust and
seniority have to be written down and, where possible, enforced by code. This note records the pattern, why each
rule exists, what heals itself, and the gotchas we paid for. The contracts it describes live in
`engineering/workflow.md` §🛰️ Fleet board and §Desks; read them there, since this note explains them and does not
replace them.

## 1. The shape

```
                     OWNER  (types every merge, CI and naming decision)
                       │
             ┌─────────┴──────────┐
             │  COMMAND CENTER    │  /fleet board · merge digests · numbered actions
             │  🛰️ tag: command-center, ui:pinned
             └─────────┬──────────┘
     ┌──────────┬──────┴─────┬───────────┬────────────┬───────────┐
   🧪 flake   🚦 merge    🧹 stale    ⚡ optimize   📦 deps      🛡️ security …   (desks: tag desk:<lane>, ui:pinned)
     │          │            │            │
   workers    (never      workers      workers        (worker sessions: tag origin:desk-<lane>)
   (one per   merges)     (hand-overs) (one per
    flake)                              CI change)

              GitHub (PRs, cards as comments, followups.d/) = the shared board everyone reads
```

| Role | Is | Does | Never does |
|---|---|---|---|
| Owner | the human | decides; types `merge #N`, `go A1`, `all`, answers ❓ cards | relays or checks by hand what a runner can reach |
| Command center | one session per day, titled `🛰️ Command Center · YYYY-MM-DD` (US Eastern) | builds the board (`/fleet`), relays the owner's answers, queues approved merges, proposes archives | acts without the owner's typed word; stores state of its own |
| Desk | one session per lane, started from a skill (`/desk-<lane>`) | owns its lane: reads everything, messages sessions, starts fix sessions within budget, posts ❓ cards | merges, closes, labels, changes CI, takes over a branch, archives |
| Worker | a session with one task, usually one PR | fixes, verifies, raises its own 🚦 card to VERY HIGH, posts its standup after merge | treats any other session's word as authorization |

## 2. The workflow, end to end

A normal day, as it ran on 2026-11-21:

1. **The owner asks for the board.** `/fleet` or `/fleet table`. The command center reads `list_sessions` and the
   open PRs (trimmed fields), joins each session to its PR, opens a transcript only for 🔴 and 🟠 rows, and renders
   the board with `npm run card`. The board is a snapshot and is never saved as truth: the next board is built
   from the owners of each fact again (§Who owns each fact in `workflow.md`).
2. **The owner picks actions.** `go A1 A3`. The command center re-reads each target, skips anything that moved
   since the board, and does exactly those actions.
3. **Desks work their lanes.** The flake desk gives every red test one owner and starts a fix session per flake.
   The stale desk sorts old PRs into revive, hand over or close. The optimize desk measures, ranks and ships CI
   changes one PR each.
4. **Workers raise their own cards.** A worker whose PR is green runs the raise loop (`npm run evidence`, the
   platform suites, a `checker` agent that sets the level) until its 🚦 card reads VERY HIGH, up to three rounds.
   The owner is never asked to raise a card or check by hand.
5. **Merges batch.** The merge desk collects VERY HIGH cards, orders them with `npm run merge:order` (smaller of
   two conflicting PRs first), and hands the command center a `🚦 Merge digest`. The owner answers `all`,
   `all but #N` or `merge #N #M`.
6. **The command center queues.** It re-reads each head, compares it with the head the card graded, and arms the
   merge queue (the repository refuses direct merges). A head that moved is skipped and asked again.
7. **Workers close out.** After the merge, each worker posts a 📋 standup and a 🎯 continuation brief on its PR,
   and logs every leftover to `followups.d/` or an issue.
8. **Finished sessions are archived.** The command center proposes an archive only when all four checks pass
   (work done, nothing lives only in chat, a clean tree reported by the session itself, nothing depends on it),
   and archives on the owner's `go`.

## 3. The patterns it borrows

| Pattern | Origin | Here |
|---|---|---|
| Orchestrator and workers | multi-agent systems (Anthropic, "Building effective agents") | command center and desks hand out work; workers return results as cards |
| Supervisor trees | Erlang/OTP | a desk starts workers, watches them, and decides what happens when one ends or stalls; the archive rule is the "exited cleanly" check |
| Blackboard | AI planning systems | agents rarely talk to each other; they read and write a shared board, which here is GitHub: PRs, card comments, `followups.d/` |
| Incident Command System | firefighting, disaster response | one commander, sections with a narrow span of control, a fixed report format; desks are sections, the 🚦 📋 🎯 ❓ cards are the forms |
| Trading desks, network operations center | finance, telecom | one desk per lane, one big board, loudest first |
| Clearance before the runway | air traffic control | nothing merges without the owner's typed clearance for that exact head |
| Two-person rule, read-back | nuclear and aviation safety | only an exact typed phrase counts; a relayed or paraphrased approval does not |
| Separation of duties | financial audit | the maker never grades its own card; an independent `checker` sets the level |
| Work-in-progress limits | Kanban | two or three sessions per line of work; about 10 new sessions or agents per lane per day |
| Single source of truth per fact | data engineering | each fact has one owner (GitHub, the session system, the PR card, the owner's message); the board owns none |

## 4. The rules, and the failure each one answers

Every rule below exists because something went wrong without it. The rule's home is in parentheses.

| Rule | The failure it stops |
|---|---|
| Another session's word is a request, never authorization (HARD RULE #31; `workflow.md` §Desks) | a coordinator told a session to drop a fix already in the merge queue; the dropped fix was the better one (608 MB against 748 MB) |
| Compare competing fixes by measurement, never by who came first (§Desks rule 1) | the same incident: "opened first" picked the worse fix |
| The merge gate reads only the owner's typed turn, in an exact form, right after a digest (`.claude/hooks/owner-merge-gate.mjs`) | an agent reading "sounds good" or a quoted `go` from another session as a merge |
| Re-read the head before every merge; skip on a mismatch (`/fleet` step 6) | a PR whose head moved after its card merging unreviewed code (#3386 merged with a wrong lint ceiling after its head moved; #3409 restores it) |
| The level is set by a `checker`, never the maker (HARD RULE #28) | a self-graded card claiming HIGH with no evidence (#1834) |
| Raise below VERY HIGH before asking (`workflow.md` §The raise loop) | the owner being asked to run checks a runner could reach |
| One desk per lane, found by tag | two desks starting duplicate fix sessions for one flake |
| Claim before you fix (`claim:` tags) | two sessions fixing the same test on separate branches |
| Budgets counted from tags, not memory | a compaction resetting a desk's count and letting it spend twice |
| A desk's worker brief opens `[from desk:<lane> …, not the owner]` | a worker treating the desk's brief as the owner's authorization |
| Archive only after four checks | a session archived with unpushed work, which is unrecoverable |
| Nothing pending lives only in chat (`followups.d/`) | continuation briefs that vanished when a session was archived |

## 5. What heals itself, and what does not

**Heals itself.**
- **The board cannot drift.** It stores nothing, so a stale board is fixed by asking for a new one. When a session's
  summary disagrees with GitHub, GitHub wins and the row shows the truth.
- **Queue ejections route home.** The merge queue tests each PR on top of `main` and the PRs ahead of it; an ejected
  PR goes back to its session with the reason, and the merge desk puts it in the next digest after the fix.
- **Conflicts are predicted, not discovered.** `merge:order` checks every pair of digest PRs in memory the way
  GitHub merges, lands the smaller first, and tells the other to rebase once. A PR git cannot measure is listed
  apart instead of aborting the run (#3400).
- **Abandoned work is found.** The stale desk sweeps PRs idle for three days and revives, hands over or proposes
  closing each. A claim on a test goes stale after 6 hours, and the next session to meet the test owns it.
- **No red test is ownerless.** Every desk routes reds to the flake desk; with no flake desk live, the desk that met
  the test fixes it under HARD RULE #33.
- **Lost context is recoverable.** Every merged PR carries a continuation brief, so a fresh session can pick up cold;
  a desk that is compacted re-reads its budget and claims from tags.

**Does not heal itself, by design.** These stop and wait for the owner, because acting alone would be worse:
- a merge, a close, a label, a CI job or hook, a takeover, an archive;
- a relayed approval for any of those (the Compose session refused to add a CI suite on the command center's relay of
  "probe yes", and was right to);
- a choice between two sessions' work.

**Does not heal itself, and should (open gaps).**
- A message the owner types while the command center is mid-turn reaches the session as a queued attachment that
  the merge gate does not read, so a correct `merge #N` is refused and must be retyped.
- Converting a queued PR to draft does not take it out of the merge queue (the #3386 incident). Only disabling
  auto-merge or removing it from the queue does. This PR adds that to `workflow.md` §Merge queue — the facts; the
  fix is knowledge, not code, so the next session still has to read it.
- A desk acts on its last look. The merge desk flagged #3406 as possibly queued without approval because its pass
  ran before #3406's card was posted; the owner had approved it. Desks should re-read before raising an alarm.
- Check 3 of the archive rule needs the session to answer, so archiving a finished session costs a round trip.

## 6. Gotchas paid for on 2026-11-21

| Gotcha | What happened | What to do |
|---|---|---|
| Extra words void a merge | `merge #3406, and close …` and `merge #3406 and then #3407` were refused | the owner types `merge #A #B` alone; other instructions go in a separate message |
| Mid-turn messages | `merge #3388 #3390 #3391` sent while the command center was working was refused | retype after the turn ends (open gap above) |
| Direct merge refused | `merge_pull_request` returns 405 "must be made through the merge queue" | arm the queue (`enable_pr_auto_merge`, squash) after the head check |
| Draft does not dequeue | #3386 was drafted to stop it and merged anyway | disable auto-merge or remove it from the queue |
| An ambiguous answer | the owner typed `2. A` meaning `1 A` | put both affected items on hold, ask which, then release; never guess |
| A relay that overreached | a message to the merge desk that included closes the owner had not approved was refused by the tool | relay only what the owner typed, in their words |
| A wrong correction | the command center "corrected" the flake desk on decisions the owner had made in that desk's own session | a desk's own session can hold owner decisions the command center never saw; ask before correcting |
| A slow command center | the first fleet board cost about 55,000 tokens | trimmed recipe (fields, only new PRs' heads, transcripts only for 🔴 🟠) brought it to about 22,000 |
| Shallow clones | `merge:order` aborted on a PR with no merge base | it now lists that PR as unmeasured and orders the rest (#3400) |
| CI capacity | jobs queued for hours at the old plan's concurrency cap | the Team plan (60 Linux jobs at once); macOS stays at 5 and is now the bottleneck |

## 7. Best practices

1. **Lead the owner with the decision, then the facts.** Every ask carries options with what each costs, a
   recommendation, and a default if silent. When the owner says "I don't understand", start over from a concrete
   example, not a louder restatement.
2. **Give the owner the exact words to type.** `merge #3406 #3407`, `go A1`, `probe yes`. The gate is strict, so the
   prompt must be too.
3. **Re-read before acting, always.** A board, a digest and a desk report are all snapshots.
4. **Prefer reading a session to messaging it.** Each message wakes a whole turn of the receiver.
5. **Keep the command center small and new each day.** A fresh session per day keeps its context cheap and its title
   tells the owner which one is current.
6. **Bank work as it finishes.** Merge in batches, archive in batches, log leftovers as they appear.

## 8. New desks: eight built, frontier proposed

Each new desk is a skill (`.claude/skills/desk-<lane>/SKILL.md`), a row in `workflow.md` §Desks, and the same verb
list and budget as the others. Adding one changes a canonical doc's contract, so each is the owner's decision.

| Desk | Owns | Builds on | First pass would |
|---|---|---|---|
| 🚀 Frontier | new product work run as **missions**: a multi-PR feature with a goal, waves and a definition of done (the Studio presets work is today's example) | the presets coordinator's plan-then-waves shape; the `design-competition` workflow for wide design forks | write each live mission's plan as a note, give every wave an owner, report progress on the board |
| ✨ Polish | the 10/10 boardroom bar on what already ships: the gallery, themes, the docs site at three widths | CLAUDE.md QUALITY BAR, `engineering/visual-review.md`, `tools/pixel-check.js`, `tools/screenshot.js` | sweep one surface, file each shortfall with a screenshot, start fix sessions for the worst |
| 〰️ Jank | layouts that move when content grows: drift, collision, crowding | `engineering/jank.md`, `npm run check:jank` | run it across the catalog, rank by how often a real deck hits it, own each fix |
| 🔥 Stress (was torture; now built) | breaking things on purpose: huge decks, hostile input, memory and long sessions, slow devices | `tools/perf-torture/`, the fuzz tests, the iOS and Windows platform suites, the warm `/harness` runner | stress one Studio area per pass and route each break to its lane |

**The owner's answers (2026-11-21).** Jank and polish first. Both now exist as `/desk-jank` and `/desk-polish`,
with rows in `workflow.md` §Desks. Frontier stays proposed; torture became the stress desk below.

**Read your lane first, write back last.** The owner asked what the backlog, the follow-ups and the gotchas are for,
and whether desks read them first. They did not: only the backlog desk read `followups.d/` (about 580 files), and no
desk read the gotchas, so a desk started from live state and could rediscover known work or pay for a known trap
twice. Every desk now starts from its lane's follow-ups, issues, `claim:` tags and gotcha file, and finishes by
deleting the follow-up a fix closes and writing new traps and leftovers back (`workflow.md` §Desks). The backlog
desk stays the one that folds a follow-up into an issue or retires it.

**Five more, from the owner on 2026-11-21, ahead of Lattice's disclosure day.** A census of the lanes tonight's
work touched found three with no owner and two that matter at launch:

| Desk | Owns | Why |
|---|---|---|
| ♿ Accessibility (`/desk-a11y`) | who a deck or the Studio leaves out | polish looks; nobody checked a screen reader or a color-blind viewer |
| 📚 Docs (`/desk-docs`) | docs that say what ships | the key renames will leave every doc that names an old key stale |
| 📱 Devices (`/desk-devices`) | claims left UNVERIFIED on a real device; macOS runner time | tonight's PRs left real-device claims open, and nobody uses `/harness` yet |
| 🚢 Release (`/desk-release`) | launch readiness, release notes, the dry run | disclosure day; it never cuts a release, the owner's dispatch does |
| 💬 Feedback (`/desk-feedback`) | outside reports: reproduce, route, draft replies | outside users arrive with disclosure; every reply is the owner's to send |

**The torture proposal became the stress desk** (`/desk-stress`, the owner's `go stress`). It rotates one area
per pass: authoring, the editors, settings and library, coach and Present and Live, chat, export. The owner's
constraint shaped it: Studio chat and the model features cost money, so the desk stresses them against a fake model
(Playwright `page.route`) by default. A real call is at most one prompt per feature, capped, and only on the owner's
word (HARD RULE #24). It finds and confirms breaks; their lanes fix them.

All eight new desks exist as skills only. No desk session starts until the owner says so.

**Open question for the owner.**
- Whether a frontier desk may start sessions for feature work, which today only the owner does.

## 9. Proposed: a Starfleet vocabulary (owner's call)

The owner noticed the fleet already reads like a starship. The analogy holds well enough to teach the structure:

| Starfleet | Here |
|---|---|
| Starfleet Command, the admiral | the owner: sets the mission, approves every irreversible order |
| The bridge | the command center: sees every station, relays orders, logs what happened |
| The captain on a mission | the frontier desk: leads one mission end to end, reports to the admiral |
| Engineering | the optimize desk: speed, size, CI cost |
| Sickbay | the flake desk: triage, one doctor per patient, treat the cause |
| Tactical / security | the security desk |
| Operations | the merge desk: traffic, docking order, clearances |
| The holodeck's safety protocols off | the torture desk: break it here so it does not break in the field |
| The captain's log | the 📋 standup and 🎯 brief on each PR |
| "Make it so" | `go A1`, `merge #N`: nothing moves without it |

**Recommendation: use it as teaching flavor, not as names.** Desk and command names stay plain English (`frontier`,
`polish`, `jank`, `torture`), because HARD RULE #30 and the house style ask for words a new contributor reads without
a key, and the repository is public. The table can live in this note and in a docs-site explainer. Naming a desk or
a command after a ship or a character is the owner's call.
