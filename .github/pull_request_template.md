<!--
PR conventions for this repo — both the typed `create pr` AND the Create-PR
button should follow this. Keep them in parity.

TITLE — the same convention as commit messages (`git log` / CLAUDE.md):
  area(scope): short summary
Imperative, lower-case, no trailing period. Examples:
  fix(drawing-board): update scroll slide-number on iOS via IntersectionObserver
  feat(coach): add title-incomplete rule + share ask/pacing definitions
Not "Update files", a bare branch name, or a vague summary.

BODY — lead with one or two plain-language sentences, then the sections below.
Delete a section only if it genuinely doesn't apply. Be honest about what was
NOT verified. A small before → after table helps when several things shifted.
-->

## Problem / Why

<!-- What's broken or missing, and why it matters. -->

## What changed

<!-- The fix, concretely — name the files / functions touched. -->

## Tests

<!-- What you ran or added, and which gates passed (unit / integration / biome).
     "None — docs only" is a fine answer.

     CHANGING SHARED STUDIO UI CHROME? (a control's accessible name, role,
     presence, or location) The Studio e2e suite is NIGHTLY — off this PR gate —
     so a chrome change can pass every gating tier and still break specs that
     only run overnight (the #780 drift). Before merging:
       - update the `CHROME` map + helpers in docs/e2e/studio-fixture.ts;
       - `grep -rn "<old accessible name>" docs/e2e` — sweep EVERY hit, not the
         one line a reviewer flagged;
       - run `npm run test:e2e:smoke` (or the touched specs) and STATE whether
         the e2e suite was actually run.
     Full checklist: engineering/development.md § "Studio e2e suite". -->

## Performance

<!-- REQUIRED for any change with perf intent (HARD RULE #19); delete this whole
     section if the PR doesn't touch performance. Paste the before/after from
     `npm run bench` (same machine), confirm the committed baseline.json was
     re-blessed, and note the bench scenario that covers the optimized path.
     A win without a reproducible measurement is unproven. Example:

       | dataset            | before ms | after ms |    Δ% |
       |--------------------|-----------|----------|-------|
       | normal (jargon)    |     37.4  |    31.2  | −16.6 |
       | stress (jargon x6) |    107.2  |    88.5  | −17.4 |

     baseline.json re-blessed · bench:check within band · scenario: <which>. -->

## Caveats / not verified

<!-- Anything you couldn't verify (e.g. a live on-device check), follow-ups, or
     "none". Flag breaking changes here, led with **Breaking:**. -->

<!-- CLOSING ISSUES — bind a keyword to EACH issue number, or only the first closes:
       Closes #1, closes #2, closes #3   (NOT "Closes #1, #2, #3" — that closes only #1)
     One per line works too. The pr-closing-keywords check enforces this. -->
