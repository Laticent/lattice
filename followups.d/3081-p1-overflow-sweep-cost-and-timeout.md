---
origin: 3081
priority: P1
recorded: 2026-11-08
area: infra
severity: low
swimlane: .github/workflows/overflow-nightly.yml
deferred: blocked — the evidence is two scheduled nightlies, which only run after the fix merges
source: https://github.com/Laticent/lattice/pull/3081
---

# Confirm the overflow nightly has 2x headroom after the --chrome-pdf fix

why now   — the cost regression is found and fixed: the shared vector PDF writer (268f0a3f9, #2404)
            cost ~3 s a deck, and the sweep now renders with `--chrome-pdf`. Measured on a 4-vCPU
            sandbox: 1703 s -> 643 s for 504 decks (908 s on a CPU-contended run), same verdict
            on every deck. What is left is
            the runner's own number, which nothing before the merge can produce.
where     — `.github/workflows/overflow-nightly.yml`, the `⏱ sweep cost` line in the sweep step.
done when — two consecutive scheduled nightlies print `⏱ sweep cost` under 1350 s with
            `(chrome PDF writer)`; then delete this file. If either is over, shard the sweep.
evidence  — the two cost lines, quoted with their run links.
verify    — read the nightly logs.

progress  — scheduled nightly 1 of 2 (run 81, `main@978728bb`, 2026-11-09):
            `⏱ sweep cost — 507 decks in 733s at 2 workers: 1.45 s/deck (chrome PDF writer)`,
            https://github.com/Laticent/lattice/actions/runs/42600201917. Under 1350 s.
            The sweep step took 12 min 14 s of the job's 45. Nightly 2 is the next scheduled run.
