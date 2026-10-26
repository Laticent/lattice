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
               `marks.generated.css` (built from the members' manifests, not the family's).
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

**Step 1 built 2026-10-11 (kernel and CLI door, hardened by the adversarial trio), not finished.** The
owner's answers are §9 decisions 10 to 14 of the plugin-system note; the build log is its §11. Left in step 1:
1. **The Studio's door.** It must carry every rule the CLI door learned from the checker on the
   hardening: skip slides a shipped pass rebuilds (`lib/transformers/rebuilt-classes.js`, derived from
   the registry; the Studio's engine bundle has the registry, so derive the same list there and pin
   it with a test), the render-wide 400-fence allowance (`budget`), the host-side output cap applied
   in claim order, the `lp-<name>` id and class namespace and the prefix-overlap refusal
   (`pluginNameConflicts`), the fence-name pattern (`FENCE_NAME_RE`), and `pluginDigest` over BYTES. `docs/src/lib/code-packages/door.ts` / `door-run.ts` / `runner.ts` run
   component packages only. They need the fence path, and it has rules the CLI door already learned
   the hard way: pass `render(..., { codeFences: { names, run } })` built by `captureFences` /
   `substituteFences` (`lib/packages/code-door-fence.mjs`; the engine's LAST slot, and `names` turns
   highlighting off for those fences); load the renderer with `checkedWorkerScript(code, { fence: true })`
   and post `{ body, id }`; sanitize with `doorFinishFence` from `lib/core/door-attr.mjs`, not a copy;
   key results by DIGEST (`pluginDigest` rules: `pluginConsentText(code, fence)`, hashed with
   `crypto.subtle`), approvals under `plugin/<name>` (today `door.ts` keys approvals on the bare
   name), the 400-fence cap and `MAX_FENCE_CHARS`; refuse a fence name two plugins claim; and run
   both doors on one fixture in one test, so they cannot drift (HARD RULE #1). Add `CodePackagesNotice`
   support for plugins, and a fence-in-`docs/src/lib/single-slide-render` case.
2. **The placeholder** for a plugin's fence the deck did not declare (decision 11): drawn in the
   Nacre atmosphere (`docs/src/styles/nacre-loader.css`, `base.modifiers.css` "THE UNDERPAINTING"),
   a plugin mark from the `--mark-*` / `--shape-*` tokens (HARD RULE #29), palette-blind, with the
   plugin's name; and the strip whose Approve writes the `plugins:` line (`deck-plugins.mjs`'s
   writer). Website UI: screenshots at 1440 / 820 / 390. The web-image placeholder
   (`lib/core/remote-ref.js` `blockWebImages`) is the precedent for markup the engine styles.
3. **`lattice packages trust plugin/<name>`** (the door's refusal message already prints it).
4. **Step 2's gate** must run `refusePluginCode`, `codeSyntaxRefusal(code, { fence: true })`,
   `codeNameRefusal(pkg.name, knownClasses)`, and refuse a fence name that is a shipped plugin's or a
   highlight.js language or alias (`lib/packages/new-plugin.js:36` does it for the scaffolder only).
   The door takes the active list; the CLI half decides which installed plugins are active
   (declared in `plugins:`) and which are only offered (the placeholder case).
5. **A `lint:deck` warning** that attributes after a plugin fence's name are ignored today
   (`lib/core/lint-core.js`; `scanFences` already reads the full info string), so the field stays free
   to define later.
6. **Known limits to keep in §4.10 / §4.11 as written:** no links, remote images or fonts in output
   (`data:` only); a Marp export ships the raw code block.

**Built 2026-10-12 (the PR on branch `claude/plugin-phase-e-code-door`):** step 1 items 1 to 3 and 5, and the
gate half of item 4: the Studio's door (with the trio's findings fixed), the placeholder and Approve strip,
`lattice packages add` / `trust plugin/<name>` / render, the plugin gate (`refusePlugin`), subfolder
reporting, and the `lint:deck` warning. See the plugin note's §11. **Still open, for phase E's step 2 and 3:**
1. **A plugin's `styles.css` is stored and never delivered.** Decision 12: every selector rewritten under
   `[data-lattice-plugin="<name>"]` (and the roots of the plugins it declares it styles), before the engine's
   CSS in source order, no `@layer`, through #22's style sink (`lib/layout/bridge.js` `componentBlock` is the
   route to copy; `checkDocumentStyleSinks` and `checkCssTreeRewrapSinks` will each need a decision). Needs a
   `targets` field in `plugin.schema.json`. This is its own PR with the adversarial trio: a stylesheet is a
   document channel.
2. **Export provenance** (name + SHA-256 of each non-shipped plugin an export used) in
   `lib/core/reopenable.js`, which records none today.
3. **The Studio's Library cards for plugins, `plugin-admission.ts`, and `asset-store.js`'s id prefix** (a
   plugin record's id starts `a`; harmless, untidy). The Plugins tab is the only place a zip plugin shows.
4. **The Studio's export of a plugin zip** (`package-zip.ts` has a reader and no writer): a user cannot
   hand a plugin they imported to someone else from the Studio.
5. **Marp export** ships the raw code block for a plugin fence, as for a code package.
