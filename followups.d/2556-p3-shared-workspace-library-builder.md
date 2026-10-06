---
origin: 2556
priority: P3
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2556
---

# Eight copies of the workspace-library builder

why now   — tools/build-{cadenza,calco,lente,ltt,segno,suono,trama,vetrina}-lib.js are ~300-line
            near-copies (staging, sweep, install, --check). #2556 added the eighth, by convention.
            A fix to one (#2117's concurrency fix) has to be made eight times.
where     — tools/build-*-lib.js → one tools/lib/build-workspace-lib.js taking name + entries.
done when — every builder is a few lines over the shared one, and every `*-lib:check` still passes.
evidence  — `npm run build:check:all` green; byte-identical dist/ for all eight.
verify    — maker-checker (it touches CI-run build steps).
