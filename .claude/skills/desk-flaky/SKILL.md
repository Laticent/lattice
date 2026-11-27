---
name: desk-flaky
description: >
  Run the 🧪 flake desk: own every red or flaky test a session did not cause, or that nobody has reported before. Take a census,
  give each flake exactly one owner (an existing session or a new fix session), and drive
  each one to a root-cause fix under HARD RULES #33 and #34. Use when this session is told
  to be the flake desk, when the owner asks to "coordinate flaky tests", or when the
  command center dispatches one. NOT for fixing one test you met yourself: fix it per #33.
argument-hint: "[census | assign <test> | status]"
---

# 🧪 Flake desk

Read first, by section: `engineering/workflow.md` §Desks (your powers and budget), then
`engineering/decisions/2026-11-06-flaky-tests.md` §What a flaky test is and §HARD RULES
#33 and #34. Tag this session `desk:flaky` and `ui:pinned` (`set_session_tags`).

**Read your lane first** (`engineering/workflow.md` §Desks): `npm run followups` and the open issues for this lane, the live `claim:` tags, and this lane's gotcha file. Start from that queue; when done, delete the follow-up a fix closes and write new traps and leftovers back through a session you start. A test never becomes a follow-up (HARD RULE #33): it gets an owner and a fix.

## The pass

1. **Census.** `list_sessions` (`mine: true`), then read the sessions tagged
   `flaky-test`, the 🔴/🟠 ones, and any whose summary names a red, hang, flaky test or
   retry. Ask live sessions with one `send_message` each, in this format:
   `test: <file:line name> | project | seen: <run URL> | rate | status: fixing on <PR> / not started / parked`.
   Also read the last nightly and platform-suite runs (`/desk-deps-nightly` hands you those).
2. **One owner per flake.** Key each flake by file and test name.
   - A session already fixing it keeps it.
   - Two or more fixing the same test: do NOT pick by who was first. Follow §Desks
     "When sessions collide": run every competing fix on the same machine and the
     same input; ask each session for its own numbers; table them with the cost of
     switching (a PR in the merge queue re-runs full CI if pulled); and send the owner
     a ❓ decision card. Never tell a session to drop, revert or pull its work: only
     the owner decides that.
   - Not started: start a fix session from `main` (`create_session`, tags `flaky-test`,
     `desk:flaky`, `origin:desk-flaky`) with a brief that names the test, the run URL, the
     flaky shape if known (F1 to F10), and #33/#34's evidence: failing arm, repeat green
     alone, green under load.
3. **Hold the line.** No retries, skips, longer timeouts or `followups.d/` notes for a
   test. Switching one off needs the three-part `// disabled:` reason. Say so to any
   session that tries.
4. **Report** to the command center: one `send_message` with a fleet item per flake
   (level, title, pr, session, state) and `budget: N/10 today`, with its `meter:` ledger, which also rides on every gate message to the command center (a card announcement, a 🧱 line).

5. **Claim before fix.** When a session reports a flake you already assigned, tell it
   who owns the fix and where, so it does not write a second copy.

## Lane

Yours: messaging sessions about their flaky tests, and starting fix sessions. Also yours
(owner, 2026-11-24): every **fleet-wide blocker** the command center routes here, test or
not: a red on `main`, a tool or dependency missing from the sandbox image, a broken runner or
hook that two or more sessions hit (`engineering/workflow.md` §Desks, "Blockers go to the
command center"), except a nightly, golden-bless or platform-suite red and a break a
dependency bump caused, which stay with the deps desk. Give each one owner, tag the fixing session `claim:blocker:<slug>`, and
tell the command center the owner and tag so it can tell every affected session. A fix that
changes a CI job or step, a hook or the environment's settings goes to the owner first
(CLAUDE.md, SECOND FILTER). Not yours: merging, labels, another session's branch, a red test a session's own change caused
(that session fixes it, HARD RULE #33), and a non-test bug that only one session hits (the command
center answers that one).
