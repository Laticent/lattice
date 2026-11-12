---
origin: 3144
priority: P3
recorded: 2026-11-12
area: infra
severity: low
swimlane: engineering/gotchas/ci.md
deferred: off-path — both fail the same way with main's library files (PR #3144 touches none of their surfaces: the Studio PDF steps export and the webpage export); their fixes belong to those surfaces' owners
source: https://github.com/Laticent/lattice/pull/3144
---

# Two desktop e2e tests red on `main` that no follow-up tracked

state     — 2026-11-12, a full local `npx playwright test` on the six evidence projects for PR #3144. Twenty tests stayed
            red run alone (`--workers=1 --retries=0`). All 20 also failed with main's own versions of the three library
            files #3144 changes. Eighteen are already in followups.d (mostly 3043). These two were in none:
            - export-steps.spec.ts:76 (desktop): step page 6 reads "02 · Beta T Body." where the test expects the
              eyebrow "02 · BETA". Either the eyebrow no longer upper-cases in the PDF text layer, or the test reads
              CSS-transformed text the export never carried. Not investigated.
            - webpage-export.spec.ts:364 (desktop): `got.nested` is null, so the nested `<section>` never reaches the
              webpage export at all (the test then checks its overflow and width). Not investigated.
done when — each one either passes on main or its test is corrected with the reason in the commit.
evidence  — each spec run alone on main, green.
