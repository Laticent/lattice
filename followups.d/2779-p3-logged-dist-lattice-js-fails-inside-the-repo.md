---
origin: 2779
priority: P3
recorded: 2026-10-22
area: infra
severity: low
swimlane: engineering/development.md
source: this session, 2026-10-22
---

# `node dist/lattice.js <deck>` fails inside the repo: the manifest loader scans `dist/styles/`

why now   — a fresh agent trying the built CLI first hit it and lost several minutes before using `node lattice.js`.
found     — after `npm run build`, `node dist/lattice.js deck.md out.png` throws `Invalid manifest:
            dist/styles/manifest.json: name must be a non-empty string …`. `loadAll(__dirname)` (the bundled copy of
            `lib/core/manifest-loader`) walks every folder under `dist/` and reads `dist/styles/manifest.json`, the
            CSS-module manifest that `tools/build-css.js` writes, as if it were a component manifest.
where     — `listComponentFolders` and its `root`; the CSS-module manifest's name or location.
done when — the built CLI renders a deck from a checkout, or `engineering/development.md` says to use `node lattice.js`.
verify    — run the built CLI on `examples/pane-photo-fit.md` after `npm run build`
note      — `node lattice.js` at the repo root works and is what the test tier uses.
