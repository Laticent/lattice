---
origin: 2509
priority: P5
recorded: 2026-10-05
---

# Mermaid ships as three library builds; retiring the committed one is an owner call

why now   — split from `2509-p5-plugin-phase-d-residue.md` (the rest of that file was decided or
            done, plugin-system note §11 "Phase D's residue, decided"). The THREE builds: the
            payload `mermaid/dist/mermaid.min.js`, the committed `mermaid-v11-min.js` (the
            Export-to-Marp kit; `test/helpers/render.js` only hashes it), and the CLI bake's
            unminified `mermaid/dist/mermaid.js` (`render-worker.js`).
            `test/unit/plugins/mermaid-library-parity.test.js` holds them equal meanwhile.
            Retiring the committed copy touches the kit builder, `marp-bundle.js`,
            `check-ownership.js`'s kit-copy parity row, `remote-ref.js`, `package.json` "files",
            `affected-tests.js`, the diagram gallery's `<script>` — and `lefthook.yml`, which makes
            it a hook-contract change (CLAUDE.md's second filter, row 2): it needs the owner's
            pick, with the options measured, not a maker's decision.
where     — the files above.
done when — the owner picks keep-three or retire-the-committed-copy, and the pick ships.
evidence  — the Export-to-Marp kit rendered by real marp-cli (`marp-kit-render.test.js`), and the
            diagram gallery's CLI PDFs byte-identical.
verify    — tier 1 checker.
