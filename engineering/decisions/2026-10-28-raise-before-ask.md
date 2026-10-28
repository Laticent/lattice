---
status: shipped
summary: >
  The owner was driving the pre-merge confidence loop by hand and watching sessions file small work as follow-ups
  (149 in 14 days). Four moves: below VERY HIGH the agent runs a raise loop of up to three rounds before asking;
  `npm run evidence` plans the real surfaces a diff owes (Playwright engines, macOS / Windows / iOS Simulator
  dispatch); a checker agent, never the maker, grades the card; and a new followups.d/ item must say
  `deferred: large|blocked|off-path`. The owner is asked to merge, never to check by hand.
---

# Raise before ask: the agent drives confidence up, a checker grades it, follow-ups justify themselves

**Adopted** 2026-10-28, owner ruling on all four options below.
**Changes:** `engineering/workflow.md` §Pre-merge card, `followups.d/README.md`, CLAUDE.md
(DEFAULT OPERATING MODE table, HARD RULES #18 and #28), `tools/agent-card.js`,
`tools/followups.js`, new `tools/evidence-plan.js` (`npm run evidence`).

## 1. The problem, in the owner's words

> It is a pain for me to supervise and ask for the confidence level and ask to raise it. […]
> I really should not be asked to do manual checks anymore, though sometimes I have to spot
> check things that are visual. I also notice the model settling: leaving jank behind, adding
> follow-ups for simple and moderate things, leaving broken windows, and general tech debt.

## 2. Why it happened: four holes in the rules, not in the tools

The tools already exist: Playwright runs Chromium, WebKit (`webkit-phone`, `webkit-tablet`) and
Gecko; `platform-suites.yml` runs real macOS, Windows and iOS Simulators. The rules left each one
optional.

| Hole | What the rule said | What it produced |
|---|---|---|
| `raise it` was a line, not an action | Name the one thing that would raise the card, then ask | The owner ran the loop by hand: "what's the level?" → "do the thing" → "now?" |
| The maker graded its own card | The confidence level is derived by the author | Drift to `high` because the work felt thorough, which §Pre-merge card already warned about |
| Surfaces were remembered, not planned | #23 says drive the real surface | Per-PR CI is Chromium + one WebKit job; Gecko, WebKit e2e and the iOS/macOS/Windows suites ran only when someone remembered |
| A follow-up needed no reason | #18 forbids filing on-path work, in prose | 149 items filed in the 14 days to 2026-10-28, 89 of them `severity: low`; 239 recorded in October against 113 in September |

Measured on `c9a40f3`: by month, `grep -h '^recorded:' followups.d/*.md | cut -c11-17 | sort | uniq -c`;
the 14-day window counts items with `recorded` from 2026-10-15 to 2026-10-28 and their `severity`.
Of all 351 items, 201 are `severity: low`.

## 3. The decision

Four moves, each the owner's pick from three options (the rejected ones are listed so nobody
re-proposes them without new evidence).

**A. The raise loop.** Below `VERY HIGH`, the agent executes its own `raise it` line, regrades,
and repeats, for up to three rounds, before asking. It stops early only when the blocker is out of
its reach: a taste call, something irreversible, or a surface no runner here can reach. The card
gains a `raised` row listing the rounds. *Rejected:* no cap (diminishing returns burn time);
loop only below `HIGH` (leaves the exact `HIGH → VERY HIGH` gap the owner was pushing by hand).

**B. `npm run evidence`.** It maps the diff to the surfaces it reaches and prints a command for
each: the Playwright engines, the three widths, the integration tier, and a
`workflow_dispatch` of the matching platform suites. It reuses `platform-suites-plan.js`, so the
suite selection is the same rule the workflow applies. *Rejected:* adding Gecko/WebKit e2e to
per-PR CI (every PR pays, and it is a CI-contract change); local-only with no dispatch (misses real
Mobile Safari).

**C. A checker grades the card.** One Opus `checker` agent per merge ask reads the artifacts and
sets the level and `limited by`. The maker writes `graded_by` naming it; `npm run card` refuses
`self`. *Rejected:* checker only on blast-radius work (routine PRs keep the inflation); self-grade.

**D. Follow-ups justify themselves.** A new `followups.d/` item needs
`deferred: large|blocked|off-path — <why>`, and the card shows `left behind`. Anything small or
moderate on the path is fixed in the PR, and no reason covers a regression the PR caused (#18). *Rejected:* card row only (relies on the owner noticing);
the gate plus a triage of the existing 351 in this PR (a separate, bigger piece of work, §6).

**E. No manual-check asks.** Unchanged from the owner's message, so not put as an option: the agent
never asks the owner to verify behavior. A taste call on a visual is the one exception, and it goes
with the artifact attached. Export bytes keep their Quality Bar sign-off.

## 4. What the gates enforce, and what they cannot

| Rule | Gate | Hole |
|---|---|---|
| `graded_by` present and not the maker | `tools/agent-card.js` refuses `self`, `maker`, `me`, `this session` | A maker can type "checker" without spawning one. The checker's agent id on the PR is the evidence |
| Below `VERY HIGH`, the loop ran | `raised: none` is refused unless the level is `VERY HIGH` | A round that did nothing still counts as a round |
| `left behind` present | required on the card | The count is the maker's |
| New follow-ups carry `deferred:` | `checkFollowups` via `build:check`, for items recorded on or after 2026-10-29 | The gate checks the shape. Whether `large` is true is the checker's job. Backdating `recorded` evades it. A date, not an origin PR number, because the card grader found that an origin cutoff would eject open PR #2953 (its item: origin 2953, recorded 2026-10-28) from the merge queue |

## 5. Cost

- **Checker:** one Opus agent per merge ask, which this repo already runs on blast-radius work.
  It runs at `effort: medium` unless the work earned the trio.
- **Raise loop:** at most three rounds. Most rounds are commands from `npm run evidence`: a WebKit +
  Gecko e2e pass, or a platform-suite dispatch (2–4 min of free macOS/Windows minutes, measured in
  `platform-suites.yml`'s header).
- **Per-PR CI:** unchanged. No job or step is added.

## 6. Not done here

The 351 existing items are grandfathered rather than re-triaged. A pass that fixes or closes the
small ones is worth doing on its own branch; it is filed as
`followups.d/2955-p1-triage-the-grandfathered-followups.md`, and that file carries the new
`deferred:` field.
