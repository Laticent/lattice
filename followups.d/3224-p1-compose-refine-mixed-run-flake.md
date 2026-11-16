---
origin: 3224
priority: P1
recorded: 2026-11-16
area: website
severity: medium
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: blocked — no reproduction in about 1,300 runs on the branch and on main; waits on a failing run's trace
---

# compose-refine.spec.ts:92 failed once on webkit-tablet, cause unknown

why now   — HARD RULE #33. "Refine in Compose is not offered over a run that mixes styles" failed once in 251, on
            webkit-tablet, in a full studio-*/compose-*/filo-* run of PR 3224's branch (production build, local sandbox,
            default workers). At line 97, after `selectIn(page, 'Alpha beta', 'Alpha')`, the button "Refine selection" was
            never visible (15 s). That run's trace was lost: Playwright wipes `test-results/` at the start of each run.
where     — docs/e2e/compose-refine.spec.ts:92 (`selectIn`, `openWithModel`); the Refine control in
            docs/src/components/studio/StudioShell.tsx (shown on `hasSelection`, no `data-out` step, never in More).
done when — a failing run's trace shows the cause, the cause is fixed at its root with a failing arm, or #33's three-part
            `// disabled:` reason is written if the cause cannot be found.
evidence  — No failure since, anywhere. On the branch (cfb14b2f): 10/10 alone, 12/12 at 8 workers, 100/100 at
            `--workers=4 --repeat-each=50`, and three full five-engine runs (242/0, 259/0, 437/0). On main (b1524d7e):
            the full webkit-tablet studio/compose/filo set 102/0, and the spec 100/100 at `--workers=4 --repeat-each=50`.
            Two hypotheses were refuted by arms, so do not re-try them: ProseMirror's 20 ms focus timer (a 30 ms main-thread
            hold after `setBaseAndExtent` did not break it), and the kernels' late object pass (holding the authoring-door
            chunk until after the selection did not break it). The flaky-test coordinator (session_01DPMMjGRrXa1LZJVMty2i9z)
            set this outcome: no reproduction, so record it UNVERIFIED with this repro command.
verify    — on a production build (`cd docs && npm run build:e2e && npx astro preview --port 4321`), keep the traces OUT
            of `test-results/` so the next run cannot wipe them:
            `npx playwright test $(ls e2e/ | grep -E '^(studio|compose|filo)-.*\.spec\.ts$' | sed 's#^#e2e/#')
            --project=webkit-tablet --trace retain-on-failure --output=<a folder outside docs/>`
