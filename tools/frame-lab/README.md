# Frame Lab

Every component's gallery, rendered by the engine, in a frame you can narrow. It answers one
question: if a slide could grow and shrink, would each component reflow and still look good?

```bash
npm run lab:build                    # → .scratch/frame-lab/, about three minutes
npm run lab:build -- --only table    # a few galleries
npm run tables:bakeoff               # the table-kind detection bake-off
```

Serve `.scratch/frame-lab/` over HTTP (the frames talk to the viewer with `postMessage`) and open
`index-local.html`. `index.html` is the same viewer without a document skeleton, for publishing
as an artifact.

## What the lab changes, and what it does not

Each frame hosts the real CLI render with three changes, all in the lab:

- The engine's shape labels (`data-family`, `data-orientation`) are removed, so only CSS responds.
- The slide has no height limit. It grows to its content, with a 16:9 minimum for its width so a
  full-bleed slide with nothing in normal flow keeps a shape.
- Type **holds** its 1280px-slide size (the responsive test: `cqi` is measured against a fixed
  1280px reference, so a narrower frame has to reflow) or **scales with the frame** (the engine's
  own behavior, where a narrower frame is a smaller copy of the same layout).

The viewer's overview is a headless measurement with type held: content that spills past the
frame's right edge, header or footer spill, and median slide height, at 1280, 960, 640, 480 and
360px. It cannot see content that overflows a box inside the slide, so look as well.

## Files

| Path | What it is |
|---|---|
| `build.js` | renders the galleries, builds one frame page per component, runs the scan, writes the viewer |
| `viewer.html` | the viewer page's template |
| `proto/` | the nine-kind responsive-table prototype (`table-types` in the viewer, with an on/off switch). The markup step stands in for the engine, the CSS is generated per column count. All nine layouts shipped in `lib/base/base.table-reflow.css`; with the switch off the tables return to the stage, so the entry shows the engine's own layouts |
| `bakeoff/` | the detection bake-off: `corpus.json` (225 tables, frozen 2026-11-03), `labels.json` (each table's kind, labeled by an independent agent before any detector existed), `bakeoff.js` (the scorer), `corpus.js` (re-extracts the corpus) |

The corpus and its labels are paired by id. Re-extracting the corpus is a re-labeling job, so
`corpus.js` writes `corpus.next.json` and never overwrites the committed file.

See `engineering/decisions/2026-11-03-responsive-tables.md`.
