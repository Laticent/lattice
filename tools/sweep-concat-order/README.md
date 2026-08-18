# `sweep-concat-order` — the #1527 render sweep, re-derivable

The evidence for `engineering/decisions/2026-08-17-palette-concat-flip.md`.
Committed because that note faults the two passes before it for publishing
figures nobody else could reproduce:

> Neither prior note committed the nine-slide source or recorded which `divider` /
> `closing` / `takeaway` instance it took from a gallery that contains several of
> each.

## What it does

`sweep-body.md` is nine slides lifted verbatim from
`test/integration/baseline-decks/gallery.md` — `divider`, `code`, `roadmap`,
`list takeaway`, `gantt`, `kanban`, `piechart`, `checklist`, `closing accent`.
`sweep.mjs` renders it PNG-per-slide across every theme in `themes/` in both
`color-mode:`s and records a SHA-256 per slide. `compare.mjs` diffs two
manifests and reports both the grid figures and the DISTINCT ones — two
theme-modes are one state when their whole before-fingerprint matches, which is
how 64 grid states collapse to 36.

`--no-split` is deliberate and applies to both sides: the rig needs page N to
stay slide N, so a pagination difference cannot masquerade as a color one.

## Running it

Needs `CHROME_PATH`. Render each side from its own tree — a git worktree at the
base commit is the "before":

```sh
git worktree add /tmp/wt-base <base-sha> --detach
ln -s "$PWD/node_modules" /tmp/wt-base/node_modules
node tools/sweep-concat-order/sweep.mjs /tmp/wt-base /tmp/sweep-before before
node tools/sweep-concat-order/sweep.mjs "$PWD"    /tmp/sweep-after  after
node tools/sweep-concat-order/compare.mjs
```

Roughly 5 s per theme-mode, so ~6 minutes a side for 32 themes.

`compare.mjs` reads `/tmp/sweep-{before,after}/manifest.{before,after}.json`.
The HTML sidecars each render leaves behind are what
`tools/check-slide-contrast.js` reads for the per-run AA diff:

```sh
node tools/check-slide-contrast.js /tmp/sweep-before/*.html
node tools/check-slide-contrast.js /tmp/sweep-after/*.html
```

## Scope, stated so nobody over-reads it

Nine slides, not the whole gallery: a component reading a token this deck does
not paint will not appear. Text runs only — rails, chips, bars and diagram
fills are not measured here. It compares renders; it does not judge them.
