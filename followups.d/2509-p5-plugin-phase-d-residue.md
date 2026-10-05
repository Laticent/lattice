---
origin: 2509
priority: P5
recorded: 2026-10-05
---

# Plugin phase D, what is left after its last consumers moved (#2509 P2)

why now   — #2509's P2 met the phase D followup's "done when": no consumer outside lib/plugins
            finds a drawn figure by a plugin's output class (`[data-lattice-figure]`, ratchet arm
            `drawnFigureClasses` 36 → 0) or a plugin-named prop (`drawn`, was `mermaid`), and the CLI
            honors `disabled` for bakes (`--disable-plugin`). The rest of that file's list was not in
            its "done when", and each item here is a decision or a separate change:
            - THE KERNELS: done (#2509 P5 → the plugin-browser-admission PR). A plugin kind may carry an
              in-tree-only `shared/` folder (`lib/packages/kinds.js` `plugin.codeDirs`; the importers read
              top-level files only, so a zip's copy is dropped), and Mermaid's five kernels live in
              `lib/plugins/mermaid/shared/`. Left for phase E: the importer should REPORT a dropped
              subfolder rather than drop it silently (inversion lens, P5).
            - THE LIBRARY COPIES are THREE builds, not two (scout, 2026-10-05): the payload
              `mermaid/dist/mermaid.min.js`, the committed `mermaid-v11-min.js` (the Export-to-Marp
              kit; `test/helpers/render.js` only hashes it), and the CLI bake's unminified
              `mermaid/dist/mermaid.js` (`render-worker.js`). Retiring the committed copy touches the
              kit builder, `marp-bundle.js`, `check-ownership.js`'s kit-copy parity row,
              `remote-ref.js`, `package.json` "files", `lefthook.yml`, `affected-tests.js` and the
              diagram gallery's `<script>`; `mermaid-library-parity.test.js` holds them equal meanwhile.
            - the pass interface was designed from ONE implementation: `describe()` keys merge
              unprefixed, and each pass runs its own boot wait;
            - the generated grammar field `runtimeDrawn` (and `RUNTIME_DRAWN`) carries the pre-"pass"
              name;
            - the runtime's double-load guard was renamed (`__llMermaidBootstrapLoaded` →
              `__llLatticeRuntimeLoaded`), so a page carrying a pre-2026-10-04 runtime AND a current
              one would boot both (no such page is known);
            - a deck's own `data-lattice-hydrate` / `data-lattice-settle` (and now
              `data-lattice-figure`) survive the slide sanitizer, so an author can forge a pending
              figure or a figure marker (pre-existing for the first two; the engine could refuse
              author-written `data-lattice-*`, as `lib/core/door-attr.mjs` does for code packages);
            - `tools/diagram-oracle.mjs` now extracts a figure by the marker, so a capture taken
              before #2509 and one after differ by the added attribute on every fence (a one-time
              boundary: re-capture both sides with the current tool);
            - the diagram component's manifest slot is still NAMED `mermaid` (its selector now reads
              the marker); renaming a slot is a manifest-schema change for every reader of slots.
where     — the files above; `engineering/decisions/2026-09-27-plugin-system.md` §11.
done when — each item is decided or done in its own PR, and this file is split or deleted.
evidence  — per item: engine byte identity, and the diagram gallery's CLI PDFs byte-identical.
verify    — tier 1 checker per item; tier 2 for a package-kind change.
