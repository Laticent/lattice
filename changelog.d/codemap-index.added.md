- **A generated code map: `dist/engineering/codemap.md`.** It answers "where does X live?" with
  one line per folder, code part (with its layer), plugin and workspace library. `npm run build`
  writes it (so `npm install` and every cloud session have it), and `build:check` fails a PR that
  adds a folder or a code part without a one-line purpose. The purposes come from `PARTS` in
  `tools/structure.js` (each part now carries an `about`), the plugin and library manifests, and
  a short `FOLDERS` table in `tools/build-codemap.js` for folders that hold no code.
  `lib/README.md`'s hand-written folder table, which listed 21 of the 29 folders, is replaced by a
  pointer to the map. New scripts: `npm run codemap:build`, `npm run codemap:check`.
