# lib/forms — the Form composition catalog

The Form model (**Form = Frame + Cell + Tile**) as a folder-per-noun
catalog, mirroring how `lib/components` works. What a Form IS:
`design/forms.md`.

- `index.js` — manifest loader + validator (the engine-read source of truth).
- `frame/<name>/` — selectable structural frames.
- `cell/<name>/` — shared, resolution-blind slot definitions (e.g.
  `masthead/` with its lift transform).
- `tile/<name>/` — registry rows; several carry a `<name>.transform.js`
  (`meta`, `progress`, `watermark`).
- `schema/` — the JSON schemas for all three nouns.

**Gotcha:** `index.js` is Node-only (reads the filesystem) — the browser
must never import it. The individual tile transforms ARE pure and are
bundled into the runtime; keep that split intact.
