---
origin: 2417
priority: P5
recorded: 2026-09-27
---

# Plugin roadmap, phases E–G: the data layer, the chart family, the npm door

why now   — the rest of `engineering/decisions/2026-09-27-plugin-system.md` §7. Each phase
            ships on its own and deletes what it replaces. `checkPluginMigration` in
            `tools/check-ownership.js` must never rise. Phase D (Mermaid on the host, `bake` /
            `exec.bake`) shipped on its own branch, and its browser half with #2508 and #2509; its
            residue is decided (the plugin note §11) and what is open is
            `2509-p5-mermaid-library-copies.md`.
            E: the data layer, zip import and export of plugins in the CLI and the Studio
               (§4.10); this lifts the `plugin` refusal in `lib/packages/gate.js`.
            F: the chart family — `extensionPoints.kernel` and the registry reading chart
               kernels SHIPPED (the plugin-system note §11, "Phase F, the slot"). Left of F:
               the family's own code and the chart-frame stylesheet move into
               `lib/plugins/chart-family/` (a `styles` contribution and the dispatch as the
               plugin's module). The "renderer libraries → `optionalDependencies`" step has
               nothing to move (measured 2026-10-05: chart kernels import only the in-repo
               workspace libraries `@laticent/trama` and `@laticent/segno`, no npm dependency),
               so it is dropped from F. #287 separately.
            G: the npm door, after the LICENSE-EXCEPTIONS grant; `spec/LPM.md` goes to 1.0.
            PHASE E's FOUR DECISIONS ARE SETTLED (owner, 2026-10-04 — the plugin note §9, decisions
            6–8). Asked because they are trust calls, hard to reverse:
            1. What loads a plugin → EXPLICIT, for every plugin: the shipped default set, a deck's
               front-matter list, or a component that declares it; the Studio gets a Plugins tab in
               its settings. "Plugins are plugins": no styles-only special case.
            2. What a zip plugin's CSS may reach → its DECLARED TARGETS only (scoped under the host's
               `[data-lattice-hydrate="<target>"]` marker, or its own `.<name>`), token-only, through
               #22's style sink.
            3–4. Styles-only first? Where does the Studio keep one? → NEITHER YET: the zip channel
               WAITS for the code-package door, so a zip plugin can own a fence when it arrives.
            SO THE ORDER IS NOW (E0, explicit loading, shipped with #2509's PR — §9 decisions 6
            and 9):
            E (after the code-package door): zip import/export of plugins in the CLI and the
               Studio, with declared CSS targets.
            ACCEPTANCE CRITERION added 2026-10-04 (HARD RULE #25 inversion lens, phase D's browser
            half): the zip channel's resolver must REFUSE `highlight` and
            `render.exec.hydrate: "pass"` by rule, not by prose — LPM §10 says zips never carry
            them, and nothing enforces it until phase E builds the channel. A highlight grammar is
            registered even for a switched-off plugin, so a zip grammar would run on author input
            the user cannot switch off.
            ALSO FOR E (from #2509 P5): an importer that meets a plugin zip's `shared/` (or any
            subfolder) must REPORT it, never drop it silently; today `cli.js` `readSource` and
            `home.js` read top-level files only, which is safe only because the gate refuses
            every plugin zip whole.
            Settled already, and to keep: refuse `payload`, any `exec`, `syntax`, `hydrate`, `bake`
            and every script file by extension (`lib/packages/read.js`); a name that collides with a
            shipped or installed plugin is DISABLED with a diagnostic, never a failed build; every
            export records the non-shipped plugins it used (name + SHA-256).
where     — `engineering/decisions/2026-09-27-plugin-system.md` §4 and §7; `lib/plugins/`;
            `lib/packages/gate.js`, `kinds.js`, `render.js`, `cli.js`; the Studio's Library.
done when — each phase lands as its own PR with the ratchet still at 0, and this file is
            split or deleted as each phase is promoted to an issue.
evidence  — per phase: byte identity or export sign-off (dark and light renders via
            SendUserFile) where a render changes, as phase A and B did.
verify    — tier 2 adversarial trio for F (render-path and install changes), tier 1 for
            E and G, because trust and packaging decisions are hard to reverse.
