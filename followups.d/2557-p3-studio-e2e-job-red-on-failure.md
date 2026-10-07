---
origin: 2557
priority: P3
recorded: 2026-10-07
---

# Decide whether the nightly Studio E2E job should turn red when a spec fails (owner's call: CI contract)

why now   — three Guide specs sat red on main for days (fixed in this PR) while every Studio E2E run
            showed green. By design: `studio-e2e-nightly.yml`'s "Run Studio E2E" step records
            `failed=true|false` and stays green so the artifact upload and the rolling-issue steps
            always run (the shape perf-, preview- and integration-nightly share). The alarm is the
            rolling issue, filed only on a scheduled or unfiltered run on `main`; a dispatch run
            with `spec:` files nothing and still reads green, which is how the 2557 brief found
            "the e2e job passes with these red".
where     — .github/workflows/studio-e2e-nightly.yml, after the issue steps (and the same shape in
            the `security` job).
options   — (a) keep it: the rolling issue is the alarm. Costs nothing; a dispatch run on a branch
            can still look green while red. (b) RECOMMENDED: add a last step,
            `if: always() && steps.e2e.outputs.failed == 'true'` → `exit 1`, so the job ends red
            after the report and the issue steps have run. One step, no extra runtime; every
            red spec then shows as a red run, dispatch included. (c) drop the output and let the
            step fail: loses the artifact/issue steps' ordering guarantee — no.
done when — the owner picks; under (b) a dispatch run of a deliberately failing spec ends red and
            a green run is unchanged.
verify    — tier 0; it is a CI-contract change, so it is asked, not taken (CLAUDE.md second filter).
