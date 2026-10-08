---
origin: 2417
priority: P5
recorded: 2026-09-27
area: engine
severity: low
swimlane: engineering/decisions/2026-09-27-plugin-system.md §7
---

# Plugin roadmap, phases E and G: the data layer and the npm door

why now   — the rest of `engineering/decisions/2026-09-27-plugin-system.md` §7. Each phase
            ships on its own and deletes what it replaces. `checkPluginMigration` in
            `tools/check-ownership.js` must never rise. Phase D (Mermaid on the host, `bake` /
            `exec.bake`) shipped on its own branch, and its browser half with #2508 and #2509; its
            residue is decided (the plugin note §11) and what is open is
            `2509-p5-mermaid-library-copies.md`.
            E: the data layer, zip import and export of plugins in the CLI and the Studio
               (§4.10); this lifts the `plugin` refusal in `lib/packages/gate.js`.
            F: the chart family — DONE (the plugin-system note §11, "Phase F, the slot" and
               "Phase F, the family's code"): the dispatch is `chart-family.dispatch.js` and the
               chart frame is the plugin's `styles` contribution. Kept in
               `lib/components/chart/_chart-family/`: the kernels' shared helpers and the generated
               `chart-finish.generated.css` (built from the members' manifests, not the family's).
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
verify    — tier 1 for E and G, because trust and packaging decisions are hard to reverse.

**Mapped 2026-10-07 (the P4 of #2577's brief), not built.** Phase E is three pieces of work, in
this order, and none fits inside another feature's PR (HARD RULE #17):
1. **A fence-level code door (the prerequisite).** The shipped door (`lib/packages/code-door.js`,
   `code-door-core.mjs` `claimedSlides`, `lib/transformers/code-packages.js`, the Studio's
   `docs/src/lib/code-packages/`) claims whole SLIDES by class. Nothing claims, captures or
   substitutes a FENCE, so §9 decision 3 ("a fence renderer is `body → html`") has no hook yet.
   It also needs `refuseCode` (`code-shape.mjs`) to admit a plugin `render.js` and `trust.js` keys
   for `plugin/<name>`. An engine transform, so it takes the adversarial trio (#25).
2. **The CLI half.** Plugins are compiled into generated registries at build time
   (`tools/build-plugin-registry.js` → `registry.generated.js`, `grammar.generated.mjs`), and
   `admitPlugins` (`host-grammar.mjs`) reports an unknown name and nothing more, so a zip plugin
   needs a RUNTIME merge into the grammar and `installPlugins`, a collision rule that disables
   (today `resolve.js` fails the build), per-deck CSS through #22's style sink
   (`lib/layout/bridge.js` `componentBlock` is the route to copy), a `targets` field in
   `plugin.schema.json`, the `gate.js` plugin branch with the `highlight` / `hydrate: "pass"`
   refusals, subfolder reporting in `cli.js` `readSource` and `home.js` `readFolder`, and export
   provenance (name + SHA-256) in `lib/core/reopenable.js`, which records none today.
3. **The Studio half.** `package-zip.ts` (a plugin writer and reader; `readPackagesFromZip` drops
   subfolders silently too), `asset-store.js` (no plugin kind), `PluginsSettings.tsx` (shipped
   plugins only), `plugin-admission.ts`.

Three questions are still the owner's before step 2 or 3 starts: where the Studio keeps a zip
plugin (§9 decision 8 defers it to this phase); whether decision 7's "token-only gates" REFUSE a
hex literal or an unscoped selector, or only report it as a component import does today
(`lib/packages/import-gate.js` `REFUSING_RULES` refuses off-device rules only); and the fence
door's contract (what a fence renderer is handed, and whether a deck's `plugins:` admission also
gates the door's consent). Fixed on the way: the Studio's Library import dropped a code-free plugin
zip with no word; both doors now refuse a plugin by name with one string (`PLUGIN_REFUSAL`).
