---
origin: 2439
priority: P3
recorded: 2026-09-27
---

# `--fluid` and plain HTML exports link a plot's library by a `file://` path

why now   — the CLI export page injects function-plot as `<script src="file:///…/node_modules/
            function-plot/dist/function-plot.js">`. A PDF is captured on the exporting machine, so
            that is fine there; but the `--fluid` viewer and a plain `--html` export keep the tag,
            so a copy opened on any other machine shows each plot's config instead of the plot.
            Predates the plugin system; found reading the code in #2439's review, not rendered.
where     — `lattice-emulator.js` (`pluginHydrateScript`, `toFluidViewer`), `lib/plugins/hydrate-script.js`.
done when — a `--fluid` / `--html` export opened from a different directory draws its plots
            (the library inlined, or baked like `--player`), proven by an integration test that
            moves the output before loading it.
evidence  — the test, and a screenshot of the moved export.
verify    — tier 1 checker (it changes export bytes: export sign-off applies).
