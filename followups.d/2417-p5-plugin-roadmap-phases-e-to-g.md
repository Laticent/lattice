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
            PHASE E IS BLOCKED ON FOUR DECISIONS, found by reading the code on 2026-09-29
            (the handoff after #2475 asked for it; it was held back rather than built on guesses,
            because trust decisions are hard to reverse). Lifting the refusal in `gate.js` is one
            line; what the lift MEANS is not written down anywhere:
            1. What loads a data-layer plugin into a deck. §4.8 loads a plugin "because the deck
               uses it", derived from its fences or `detect` — a styles-only plugin has neither,
               so nothing can ever find it used. Candidates: (a) a user component's
               `plugins: { requires }` names it (the §9-decision-5 relationship, today in-tree
               only — `COMPONENT_PLUGINS` joins user components "with the data layer"); (b) a
               deck front-matter opt-in (`plugins: [name]`); (c) every installed plugin, always
               — which §4.10's reproducibility clause exists to contain, since an installed plugin
               would then change every deck on the machine. Recommendation: (a) plus (b), explicit
               and recorded in the export; never (c).
            2. What its CSS may reach. Component packages pass `lib/layout/gate.js` (`gateCss`,
               selectors scoped to the component's class); a plugin has no class of its own. May it
               restyle a SHIPPED plugin's output (function-plot's `.function-plot`, Mermaid's
               `.mermaid-svg`)? That is the likely use, and it reaches into another plugin's DOM,
               so the gate needs a rule: its own `.<name>` scope only, or declared targets.
            3. `diagnostics` in the zip channel carries nothing today: api 1's plugin-reported
               diagnostics are refused (LPM §3.3 — only the host reports, only
               `deprecated-alias`, which needs a fence). So "styles-only" is the whole channel until
               a data plugin can own a fence — and a data plugin's fence is the code-package door
               (§9 decision 3), which is its own phase.
            4. Where the Studio keeps one. The Library has stores for themes, components, finishes
               and scenes (`docs/src/components/studio/*-library.ts`) and one import funnel
               (`library/import-parsed.ts`); a fifth kind needs a store, a Library row, the export,
               and the preview frames reading its CSS — the "CLI and the Studio" half of done-when.
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
