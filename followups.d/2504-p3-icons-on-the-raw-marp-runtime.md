---
origin: 2504
priority: P3
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2504
---

# Draw icons on a raw Marp preview (the runtime's half)

why now   — the engine draws icons everywhere it runs, but on a raw Marp preview (no Lattice
            engine) `lib/runtime/index.js` dispatches `^{…}` with no drawings loaded, so the span
            stays code (inline-icons note § 12). The runtime host already fetches a plugin's
            payload from beside itself (lib/plugins/host-browser.mjs); the icons data script is not wired into it.
where     — lib/plugins/host-browser.mjs (fetch lattice-plugin-<name>.js for a data plugin whose
            `detect` matches the page's inline code), docs/scripts/sync-playground-assets.mjs (stage
            it beside the runtime too), lib/runtime/index.js (re-run the inline pass when it lands).
done when — a marp-cli render of examples/inline-icons.md with the runtime draws every icon.
evidence  — the marp-cli HTML screenshotted.
verify    — tier 1 checker.
