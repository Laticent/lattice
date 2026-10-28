---
origin: 2904
priority: P1
recorded: 2026-10-27
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-26-fonts-policy.md
source: https://github.com/Laticent/lattice/pull/2904
---

# The CLI camera skips loading its own bundle when a deck script has already defined the global it would load

why now   — The red-team pass on PR 2904 read `lib/export/cli-camera.js` and found it does not load the real PDF-compose bundle when `globalThis.LatticePdfCompose?.captureSlide` already exists on the page.
where     — `lib/export/cli-camera.js` (the guard near line 36) and the bundle it installs. A deck `<script>` that defines the global first would receive the `toDataUri` bound to the per-run secret.
done when — The camera installs its bundle unconditionally, or checks a per-run token the deck cannot know, and a test shows a deck script that predefines the global does not get the secret.
evidence  — Reasoned from the source, not run. Impact is bounded to the folders the camera confines reads to (the deck's folder, the Lattice install, the palette and stylesheet folders).
verify    — `node --test` on a new case that renders a deck whose `<script>` sets `globalThis.LatticePdfCompose = { captureSlide() {} }` and expects the real camera to run.
