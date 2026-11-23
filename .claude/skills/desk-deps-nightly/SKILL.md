---
name: desk-deps-nightly
description: >
  Run the 📦 dependency + nightly desk: keep Dependabot PRs moving (find why a grouped
  bump is red, fix patches, summarize majors for the owner) and route every red nightly,
  golden-bless or platform-suite run to an owner the same day. Use when this session is
  told to be the deps/nightly desk or the command center dispatches one.
argument-hint: "[deps | nightly | <#PR or run URL>]"
---

# 📦 Dependency + nightly desk

Read first, by section: `engineering/workflow.md` §Desks and §Dependency updates — where
the line is drawn, then `engineering/gotchas/ci.md`. Tag this session `desk:deps-nightly` and `ui:pinned`.

**Read your lane first** (`engineering/workflow.md` §Desks): `npm run followups` and the open issues for this lane, the live `claim:` tags, and this lane's gotcha file. Start from that queue; when done, delete the follow-up a fix closes and write new traps and leftovers back through a session you start.

## Dependencies

1. **List** open `dependabot/*` PRs, except the `security` group and any bump that
   fixes an advisory: those belong to `/desk-security`. Patch and minor bumps
   auto-merge on green (`dependabot-auto-merge.yml`), so only a red one or a major
   needs you.
2. **Red bump:** read the failing job and find the root cause (e.g. a `docs/patches/` file
   that no longer applies after a Playwright bump). Start one fix session from `main`
   for it (tags `desk:deps-nightly`, `origin:desk-deps-nightly`), or message the session
   already on it. Do not push to Dependabot's branch.
3. **Major:** read the changelog and the diff, and send the owner a ❓ decision card
   (merge, hold or pin) with what breaks. Majors always wait for a human.

## Nightly

1. **Read** the latest runs of the nightly workflows (`*-nightly.yml`), `golden-bless.yml`,
   `platform-suites.yml`, and `ci.yml` on `main`. Route by kind: a `perf-nightly`
   regression goes to `/desk-optimize`, a `skillspector-nightly` red to
   `/desk-security`, a red `ci.yml` on `main` that is not a test is yours to fix.
2. **A red test** goes to `/desk-flaky` (HARD RULE #33 makes the first session after a
   red nightly its owner; you are that session, and the flake desk assigns the fix).
   **A held golden** (the bless held a page change its source does not explain) goes to
   the owner, who alone dispatches `bless_held`. **Never re-run a job by
   hand.** `platform-suites-supervisor.yml` already re-runs once when the runner lost
   the job before any test reported; anything else is a red test (#33).
3. **Report** to the command center: one fleet item per red run or PR, with
   `budget: N/10 today`, with its `meter:` ledger.

## Lane

Yours: Dependabot PRs, nightly and platform runs, fix sessions for them. Not yours:
merging a major, dispatching `bless_held`, editing a workflow file (that is a CI change:
the owner's call).
