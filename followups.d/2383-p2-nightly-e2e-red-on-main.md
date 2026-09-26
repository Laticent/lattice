---
origin: 2383
priority: P2
recorded: 2026-09-26
---

# Six Studio e2e specs fail on main, deterministically, and pass in no CI job

why now   — the full nightly e2e run (`npm run test:e2e -- --grep-invert @perf`, all projects) on the fit-register PR had 773 passed and 6 failed. Re-running those five spec files on `origin/main` at cac079e, from a clean `npm ci` + `npm run build` worktree, gives the SAME 6 failures with the same assertions, so the fit-register PR did not cause them. Per-PR CI runs none of them, so they will stay red until the nightly job is read.
where     — docs/e2e/inline-grammar-marp-mirror.spec.ts:75 (expects 14 pill/mark boxes, gets a different count); docs/e2e/split.spec.ts:206 (a component pick leaves `data-split-collapsed` on the split container); docs/e2e/status-pill.spec.ts:212 (the "Section rail off" affordance's click times out); docs/e2e/theme-import-style-sink.spec.ts:59 and :205 (the "Refused Beaconing" notice never appears, and the style-sink box count assertion fails); docs/e2e/studio-shell-parity.spec.ts:160 @minfont (Previous-slide control: shell left 1060 vs app 1039 at 1280px Craft). status-pill.spec.ts:186 and compose-fenced-code.spec.ts:193 were flaky (passed on retry) on both.
done when — each spec passes on main in its project, or the spec is corrected because the product changed on purpose. Never skipped or quarantined to get green.
evidence  — a `npx playwright test <files> --project=desktop --project=minfont` run on main with 0 failed.
verify    — tier 0 gates; a checker if the fix touches the Studio shell layout or the theme-import sanitizer (HARD RULE #22).

rechecked — 2026-09-26: STILL OPEN, the same six failures at the same lines. Run: `npx playwright test`
            on the five files, `--project=desktop --project=minfont --retries=0`, against an `astro
            build` of origin/main 283f47a plus PR #2390 (served by scripts/preview-e2e.mjs): 26 passed,
            6 failed — inline-grammar-marp-mirror:75, split:206, status-pill:212,
            theme-import-style-sink:59 and :205, studio-shell-parity:160 @minfont. #2390 touches none of
            these surfaces (its Studio change is the one-slide preview's scale cap), so it is not a
            clean-main run; re-run on a clean main build before the fix to be sure of the baseline.
