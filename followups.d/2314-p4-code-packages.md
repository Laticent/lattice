---
origin: 2314
priority: P4
recorded: 2026-09-23
source: https://github.com/Laticent/lattice/pull/2314
---

# Code packages behind a trust prompt (phase 6)

Spec: `engineering/decisions/2026-09-23-portable-packages.md`.

```text
why now   — the owner chose to let packages carry JavaScript; this is the riskiest phase and comes last.
where     — FIRST the helper toolkit a sandboxed transform receives (note §3.5: all 28 shipped transforms import engine helpers, and state-chart measures layout); then transform contract v1; consent pinned to a SHA-256; Studio sandboxed iframe; CLI child process under --permission.
done when — a user transform renders in the Studio and the CLI after consent, and is refused without it.
evidence  — the adversarial trio's findings folded in; the Studio sandbox proven on the real surface.
verify    — full adversarial trio (#25).
```

## Why PR #2314 stopped short of this (2026-09-24)

Not started, on purpose. §8 orders it last so no earlier phase waits on it. It needs the full
adversarial trio on what actually ships, and it starts with the helper toolkit that no
transform can run without. Until then, a package carrying `transform.js` is refused by name
at every door: the Library import, a `.lattice` project, `lattice packages add` and
`lattice packages export`. `packages-cli.test.js` and `lattice-file.test.ts` pin each refusal.
