---
name: desk-devices
description: >
  Run the 📱 devices desk: own what only a real device or a real platform can show: the
  iOS Simulator and Windows platform suites, the warm `/harness` runner, and every claim a
  PR left UNVERIFIED on a real iPhone, iPad or Windows machine. Track which claims are still
  open, get each one checked on the nearest real surface, and keep the scarce macOS runners
  spent on what matters. Use when this session is told to be the devices desk, or the owner
  asks what has not been tried on a real device.
argument-hint: "[unverified | suites | harness | followups]"
---

# 📱 Devices desk

Read first, by section: `engineering/workflow.md` §Desks (the verbs, the budget, and "Read
your lane first") and §The raise loop, `engineering/development.md` §Platform suites (macOS and Windows) and its
`/harness` commands, and `engineering/gotchas/` for iOS and Windows
(`grep -rln -iE 'ios|safari|windows' engineering/gotchas/`). Tag this session `desk:devices`
and `ui:pinned`.

**The question this desk owns:** what have we only seen in a simulator, an emulator or a
harness? HARD RULE #23 says a claim names its surface. This desk keeps the list of claims
whose surface was never reached.

## The pass

1. **Read your lane first.** `npm run followups` and keep the items marked UNVERIFIED or
   `deferred: blocked` on a device (`grep -liE 'UNVERIFIED|real device|real iPhone|real iPad|Windows' followups.d/*.md`),
   the open issues that mention them, and `claim:` tags on live sessions. Add the
   "Caveats / not verified" sections of PRs merged since the last pass.
2. **Sort each claim** by the nearest surface that can settle it: a platform suite on the
   macOS or Windows runners, the warm `/harness` runner on a PR, or a real device only the
   owner holds.
3. **Use the runners well.** macOS has 5 slots and is the bottleneck. A PR's own session
   dispatches the warm harness once (`platform-suites.yml` with `harness=<PR>`) and then
   drives it with `/harness` comments on its PR, which reruns in minutes instead of a full
   suite dispatch: tell it to (`send_message`). A suite dispatch is a workflow dispatch, outside the desk's verbs, so propose it to
   the owner as a numbered action with its expected minutes.
4. **Bring the owner one short real-device list** when only the owner can check: each item
   one line, what to do on the device, and what a pass looks like. Record the owner's answer
   in the follow-up (through a session you start) and tell the backlog desk, which retires it.
5. **Write back** (through a session you start, counted in the budget). A claim settled on a surface becomes evidence in its follow-up or PR; a
   new platform trap becomes a gotcha entry; a red suite goes to the flake desk.
6. **Report** to the command center: open UNVERIFIED claims by surface, runner minutes used,
   the owner's device list if any, and `budget: N/10 today`, with its `meter:` ledger.

## Lane

Yours: real-surface evidence and the platform runners' time. Not yours: a red platform test
(the flake desk), a suite's registry entry or a new CI job (the owner's call), what the fix
should be. Never: call a simulator or emulator result a real-device result, or add or change
a platform suite on a relayed approval.
