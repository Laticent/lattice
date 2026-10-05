---
origin: 2354
priority: P3
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2354
---

# Desktop CI: also run when the JavaScript half of the save seam changes

why now   — `.github/workflows/desktop.yml` runs only on `desktop/**`. The seam's JavaScript
            half, `docs/src/lib/platform.js`, and every Studio save call site live under
            `docs/`, so a PR that breaks a desktop save never triggers the desktop job. The
            checker on #2354 raised it. The census test in `docs/src/lib/platform.test.ts`
            already catches a save that bypasses the seam, on every PR; what it cannot catch is
            a change to the seam's IPC contract with `desktop/src-tauri/src/lib.rs`.
where     — `.github/workflows/desktop.yml` `on.pull_request.paths` (and the push paths).
done when — the owner has decided whether `docs/src/lib/platform.js` joins the trigger paths.
            Adding it changes the CI contract: each such PR then pays a ~16-minute desktop job.
evidence  — the owner's decision, and if yes, one PR touching only platform.js that triggers
            the job.
verify    — self-review (a one-line trigger change), once the owner has decided.
