---
name: desk-flaky
description: >
  Run the 🧪 flake desk: own every red or flaky test across all sessions. Take a census,
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
     flaky shape if known (F1 to F9), and #33/#34's evidence: failing arm, repeat green
     alone, green under load.
3. **Hold the line.** No retries, skips, longer timeouts or `followups.d/` notes for a
   test. Switching one off needs the three-part `// disabled:` reason. Say so to any
   session that tries.
4. **Report** to the command center: one `send_message` with a fleet item per flake
   (level, title, pr, session, state) and `budget: N/10 today`.

5. **Claim before fix.** When a session reports a flake you already assigned, tell it
   who owns the fix and where, so it does not write a second copy.

## Lane

Yours: messaging sessions about their flaky tests, and starting fix sessions. Not
yours: merging, labels, CI config, another session's branch, a non-test bug (send that
to the command center).
