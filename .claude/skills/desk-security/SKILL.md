---
name: desk-security
description: >
  Run the 🛡️ security desk: own every security finding — CodeQL alerts, Dependabot's
  security group, secret scanning, and the sanitizer and API-key rules (HARD RULES #22,
  #24). Confirm each finding, start a fix session for a confirmed one, and never dismiss
  an alert: every finding stays open until the owner decides. Use when this session is
  told to be the security desk, or the owner asks for a security sweep.
argument-hint: "[sweep | codeql | deps | <alert or #PR>]"
---

# 🛡️ Security desk

Read first, by section: `engineering/workflow.md` §Desks; for sanitizers,
`engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md` §5 and §9 and
`2026-08-18-post-sanitize-injection-queue.md`; for the API key, `engineering/workflow.md`
§OpenRouter budget. Tag this session `desk:security` and `ui:pinned`.

**Read your lane first** (`engineering/workflow.md` §Desks): `npm run followups` and the open issues for this lane, the live `claim:` tags, and this lane's gotcha file. Start from that queue; when done, delete the follow-up a fix closes and write new traps and leftovers back.

## The pass

1. **Collect.** CodeQL results on `main` and on open PRs (each PR's CodeQL check run and
   its annotations); open Dependabot PRs in the `security` group; secret-scanning
   results; the `build:check` gates for #22 and #24; `skillspector-nightly.yml`; and
   Dependabot majors that fix an advisory (they are not in the `security` group).
2. **Confirm** each finding against the code: the input, the sink, and a concrete
   scenario that exploits it. A finding with no scenario stays open and goes to the
   owner as "unconfirmed, here is what I traced"; it is never dismissed.
3. **Fix.** A confirmed finding in a PR whose session is alive: message that session
   (it owns the fix). On `main`, or with no live owner: start a fix session from `main`
   (tags `desk:security`, `origin:desk-security`) with the alert, the scenario and a
   test that fails before the fix. **The repo is public**: the fix session describes
   its PR, commits and test names neutrally ("escape X in Y", never how to exploit
   it), keeps the exploit scenario out of the PR body, the 🚦 and ❓ cards, the
   `changelog.d/` fragment (neutral: "hardened X") and the test's name, and states
   #34's failing arm as "the new test fails before the fix". Put that embargo in
   the fix session's brief, word for word: the session will not read this skill. A severe finding goes to the owner first,
   for a private security advisory instead of a public PR. A security dependency bump that is red gets a fix
   session the same way; one that is green merges through the queue on its own.
4. **Report** to the command center: one fleet item per finding, at `needs-you` while
   it waits on the owner's decision, and `budget: N/10 today`.

## Lane

Yours: reading alerts and code, starting fix sessions, messaging sessions about their
findings. Not yours, ever: dismissing an alert, marking a false positive, adding an
allowlist entry (`SANCTIONED_*`) without the owner, touching a secret, or discussing an
unfixed vulnerability anywhere public (an issue, a PR body or comment, a commit
message, a branch name). Report it to the owner.
