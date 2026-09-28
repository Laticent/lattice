---
origin: 2417
priority: P5
recorded: 2026-09-27
---

# Plugin roadmap, phases E–G: the data layer, the chart family, the npm door

why now   — the rest of `engineering/decisions/2026-09-27-plugin-system.md` §7. Each phase
            ships on its own and deletes what it replaces. `checkPluginMigration` in
            `tools/check-ownership.js` must never rise. Phase D (Mermaid on the host, `bake` /
            `exec.bake`) shipped on its own branch; its browser half is
            `2417-p5-plugin-phase-d-browser-half.md`.
            E: the data layer, zip import and export of plugins in the CLI and the Studio
               (§4.10); this lifts the `plugin` refusal in `lib/packages/gate.js`.
            F: the chart family — `extensionPoints.kernel`, chart kernels read from the
               registry, renderer libraries move to `optionalDependencies` (#287 separately).
            G: the npm door, after the LICENSE-EXCEPTIONS grant; `spec/LPM.md` goes to 1.0.
where     — `engineering/decisions/2026-09-27-plugin-system.md` §4 and §7; `lib/plugins/`.
done when — each phase lands as its own PR with the ratchet still at 0, and this file is
            split or deleted as each phase is promoted to an issue.
evidence  — per phase: byte identity or export sign-off (dark and light renders via
            SendUserFile) where a render changes, as phase A and B did.
verify    — tier 2 adversarial trio for F (render-path and install changes), tier 1 for
            E and G, because trust and packaging decisions are hard to reverse.
