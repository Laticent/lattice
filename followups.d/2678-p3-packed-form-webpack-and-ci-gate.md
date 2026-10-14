---
origin: 2678
priority: P3
recorded: 2026-10-14
area: infra
severity: low
swimlane: engineering/decisions/2026-09-23-portable-packages.md
source: https://github.com/Laticent/lattice/pull/2678
---

# Measure the packed slide form through webpack, and decide whether its parity check becomes a gate

```text
why now   — #2678 published `slides.css` and `palette/<name>.slides.css`. It matches the CLI
            on 51 of 51 slides in all 33 palettes, linked and through Vite 8.2.2. Webpack is the
            other bundler a consumer uses and is unmeasured, and nothing in CI keeps the pair
            matching the CLI: `tools/palette-slide-parity.js` is on-demand.
where     — tools/palette-slide-parity.js (the `--bundled` arm takes any built stylesheet),
            docs/src/lib/published-palette.test.ts (the Vite build), .github/workflows/ci.yml.
done when — (1) a webpack build of the pair is run through the `--bundled` arm on at least
            indaco and cuoio-dark and the result is in §10 of the decision doc; (2) the owner
            has chosen whether a reduced parity run joins CI. (2) adds a CI job, which is the
            owner's call (CLAUDE.md, second filter): bring the measured cost, do not add it.
evidence  — the harness output for the webpack arm; for (2), the measured wall-clock of a
            two-palette, one-gallery run.
verify    — tier 0 gates for (1); (2) is a decision, not a change.
```
