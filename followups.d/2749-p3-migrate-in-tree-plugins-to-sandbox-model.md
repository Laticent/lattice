---
origin: 2749
priority: P3
recorded: 2026-10-17
source: https://github.com/Laticent/lattice/pull/2749
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-npm-plugin-threat-model.md §6
---

# A separate effort from the npm-plugin decisions: move in-tree plugins that run code in the viewer's browser or in Node onto the sandbox model.

why now   — the owner decided on 2026-10-17 that one model applies to every plugin: it renders in
            the sandbox, returns a fragment, and the host sanitizes and shows it. Mermaid does not
            follow it today: its `bake` runs in a Node-driven page and its `hydrate` runs
            `mermaid.min.js` in the exported file's browser, both outside the sandbox.
where     — engineering/decisions/2026-10-16-npm-plugin-threat-model.md §6 rows 3 and 4 (the
            rule this migration serves; that note is the other half of this work and does not
            wait for this one); lib/plugins/mermaid/mermaid.manifest.json (`hydrate`, `bake`, `payload`);
            lib/plugins/math/math.render.js (loads KaTeX into the engine's Node process); lib/plugins/function-plot/ (hydrate + payload); lib/core/code-sandbox.js;
            engineering/decisions/2026-09-27-plugin-system.md §4.7 and §4.10.
done when — a list of every in-tree plugin that ships `hydrate`, `payload` or `bake`, with a
            migration plan or a recorded exception for each; no new plugin ships browser code.
evidence  — the list, produced by grepping every `*.manifest.json`; the cost of moving mermaid
            measured before the plan is chosen (diagram quality, export size, offline use).
verify    — tier 2 checker; mermaid is shipped output, so an export change needs owner sign-off.

Inventory 2026-10-18 (every `lib/plugins/*/*.manifest.json`, read for `payload` and `render.exec`; and the plugin folders for `*.hydrate.js`, `*.bake.js`, `*.render.js`):

| Plugin | Browser code (`hydrate`/`payload`) | Node-side code (`bake`, or a render that loads a library) | Plan |
|---|---|---|---|
| `mermaid` | `mermaid.hydrate.js` (108 KB, `exec.hydrate: "pass"`) and payload `mermaid.min.js` (3.2 MB, `when: "used"`) | `mermaid.bake.js` (38 KB, `exec.bake: "subprocess"`) | Needs an owner decision; see the measurement below. Exception until then |
| `function-plot` | `function-plot.hydrate.js` (4 KB, `exec.hydrate: "browser"`) and payload `function-plot.js` (vendored 1.25.4) | none | Plot in the sandbox and return SVG; the hydrate only attaches a library to an element. Exception until then |
| `math` | none | `math.render.js` (16 KB) loads KaTeX into the engine's Node process | Run KaTeX in the locked page; shipped output must stay byte-identical (golden check) |
| `anima`, `avatars`, `chart-family`, `code`, `icons`, `sparks` | none (manifest has no `payload` or `exec`) | none | Already on the model or pure data. `anima.render.js` and `code.render.js` run in the engine, not a library load: not examined further |

No new plugin ships browser code (no manifest other than the two above declares `payload` or `exec`).

Mermaid cost, measured 2026-10-18 on this container with the current bake path (a one-slide `flowchart LR A-->B-->C` deck against a one-slide plain deck, `.html` export): 2,216,222 bytes against 2,202,922 (**+13.3 KB**), 4.1 s against 1.9 s to render (**+2.2 s**, the Chromium subprocess), the diagram baked as inline SVG with no Mermaid library in the file (0 references to `mermaid.initialize` or `mermaid.run`). The PDF is 10.8 KB. So the default export already ships a baked diagram; what is left in the browser is the `hydrate` pass (click links, per `mermaid.hydrate.js:1077`) and the payload for decks that need it. Moving the bake into the locked page changes no export bytes if the SVG is identical, and needs the diagram golden check to prove that; **it is an export-affecting change, so it stops for the owner's sign-off with dark and light renders (CLAUDE.md QUALITY BAR)**. Not measured: diagram quality against a bake in the locked page, and decks that use the payload.

