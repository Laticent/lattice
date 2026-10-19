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


Math feasibility, measured 2026-10-19 (the npm-plugin-safety PR): the vendored `katex.min.js` (272 KB, under the door's
1 MB cap) runs as a fence renderer in the LOCKED sandbox page (`openPackageSandbox`, `runPackage`) and renders all 80
formulas in the math docs, fixtures, gallery and examples, plus a malformed one, **byte-identical** to `renderTex` in
Node (81 in all). `test/integration/parity/math-sandbox-parity.test.js` pins it, and goes red when one option differs (6 of 81).
Cost: 447 ms to open the sandbox once, then about 4.4 ms per formula against 0.9 ms in Node (the memo would cut repeats
in both). So moving math changes no export bytes. Dark and light renders of `examples/math-form-frame.md` went to the
owner for sign-off; **math moves after that sign-off, not before.** Mermaid and function-plot are not measured yet.

Mermaid's CLI bake, moved 2026-10-19 (the npm-plugin-safety PR): `render-worker.js` now draws in the LOCKED page. It
runs in the code sandbox's browser (`launchCodeSandbox`, the OS sandbox on where the machine allows it), on a synthetic
origin the worker answers from Lattice's own files, under a CSP that admits those files and nothing else. Before, it
ran on a `file:` page with `--no-sandbox`. A flowchart image node's `file:` picture is re-addressed onto the origin,
answered through the same file confiner, and its address is restored in the SVG. Evidence: 32 of 32 gallery and
fixture diagrams are byte-identical, and so are the PDFs of `examples/mermaid-diagram-surface.md`,
`dark-diagram-fills.md` and `mermaid-init-merge.md` and the fixtures' HTML and PDF. No export bytes changed, so there
is nothing to sign off. Still open: Mermaid's `hydrate` in the previews and in the plain `.html` export's click
links (owner decision 15, previews), function-plot, and math.

function-plot in the CLI captures, moved 2026-10-19: every export that captures a page (PDF, PNG, PPTX, `--player`,
`--read`) loads a copy of the page without the library. The plugin's hydrator is marked `drawnByHost`
(`hydrateScript`'s `hostDrawn`), so its placeholders wait. `lattice.js` then draws them in the locked page
(`lib/export/locked-figures.js`) by running the plugin's own `hydrate` there, sanitizes each
drawing with the slide sanitizer in a separate page, and writes it back. The plain `.html` keeps the library and its
zoom (decision 16). Evidence: the PDF and `--player` files of `examples/plugin-system-phase-b.md`,
`math-form-frame.md` and `marp-export-fidelity.md` are byte-identical before and after, and a debug run showed the
capture page with `window.functionPlot` undefined while the kept `.html` still holds the library. No export bytes
changed. Still open: function-plot in the previews (decision 15), and math.

math in the CLI, moved 2026-10-19: before a deck's real render, the CLI collects its formulas with one render and
typesets them all in the locked page (`lib/export/math-typeset.js` and `math-typeset-worker.js`: KaTeX as a fence
renderer in `openPackageSandbox`). Each result is sanitized, and KaTeX's own bytes are kept when the sanitizer
removed nothing. Every render then reads the results through `math.render.js`'s `setTypesetter`; KaTeX is never
loaded into the CLI's process (pinned by a `require.cache` probe in `math-locked.test.js`). If the locked page
cannot start, the formulas are typeset in-process with one warning (the owner's D-A). Evidence: the HTML of
`math.fixtures.md`, the gallery and `math-form-frame.md` is byte-identical, and so are the PDFs of the first and
last. The gallery's PDF differs run to run on `main` too: two old runs differed on page 33, where the new run matches
one of them. Cost: +1.3 s on `math-form-frame.md` (3.1 s to 4.4 s), the locked page's launch. Still open: the
previews (decision 15) and the library API (D-A).
