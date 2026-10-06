# chart-family

Draw a chart slide from what the author wrote. A section whose class names a member of the chart
bucket (`_class: bar`, `line`, `gantt`, `radar`, … 24 of them) is handed to that member's kernel,
which builds the figure from the section's first list or table; the family then wraps the figure
in the chart frame (eyebrow, title, subtitle, figure, caption). Authors never name this plugin:
they write a chart slide, and every chart's own page (`lib/components/chart/<name>/<name>.docs.md`)
is the authoring contract. A deck never needs to list `chart-family` in its `plugins:` front matter:
every chart class loads it.

This is a **plugin** (`engineering/decisions/2026-09-27-plugin-system.md` §5, phase F) with one
contribution, an **extension point**: the `kernel` slot. It names no chart. Each chart FILLS the
slot from its own manifest.

## The `kernel` slot

```jsonc
// lib/plugins/chart-family/chart-family.manifest.json
"extensionPoints": {
  "kernel": { "bucket": "chart", "role": "transform", "entry": "transformSection", "description": "…" }
}
```

A component fills it by being in the `chart` bucket and declaring the slot's block — `kernel`, which
is the slot's name because the manifest names no other `block` — holding the facts the family cannot
derive:

```jsonc
// lib/components/chart/gantt/gantt.manifest.json
"kernel": { "figureClass": "gantt-chart", "marks": [ … ] }
```

and by shipping `gantt/gantt.transform.js`, which exports `transformSection(html, ctx)` (the `role`
and `entry` above; the contract is the header of
`lib/components/chart/_chart-family/chart-family.js`). `tools/build-chart-registry.js` reads the
slot from the plugin registry and freezes every fill into
`lib/components/chart/_chart-family/chart-registry.generated.js`, the table the family dispatches
on. A new chart is a folder drop and `npm run build`.

**Filling the slot is requiring the plugin.** A chart writes no `plugins` block for the family: the
build records every filler as a component that requires it (`COMPONENT_PLUGINS`), so a deck that
uses a chart class loads the family even on a host that narrowed its default set, and a chart
slide on a host that switched the family off reports `plugin/component-needs-plugin`.

The build fails, naming both sides, when a component declares `kernel` outside the `chart` bucket,
when a filler's `<name>.transform.js` is missing or does not export `transformSection`, or when two
members claim one figure class.

## Switched off

`createEngine({ plugins: { disabled: ['chart-family'] } })` (or `--disable-plugin chart-family` on
the CLI): a chart slide renders the list or table it was written as, inside the ordinary slide
frame, and its `<section>` carries `data-lattice-off="chart-family"` so the browser runtime does not
draw it either. The render carries one `plugin/component-needs-plugin` diagnostic per chart class.

## What the plugin contributes

| Role file | What it holds |
|---|---|
| `chart-family.manifest.json` | the `kernel` slot |
| `chart-family.fixtures.md` | the conformance cases |

The family's code is not in this folder yet: the dispatch and the frame are
`lib/components/chart/_chart-family/`, and the chart-frame stylesheet is in the CSS bundle. Moving
them here is the rest of phase F (`followups.d/2417-p5-plugin-roadmap-phases-e-to-g.md`).

**In api 1 a slot is in-tree only, both ways:** the family is shipped, and so is every filler. A
zip component's `transform.js` is code, which the package gate refuses at import
(`lib/packages/read.js` marks it), and only the generated registry is ever dispatched; the signature `transformSection` is called with is the
family's, versioned by its `api`.
