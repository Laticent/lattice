# lib/components — the component catalog

One folder per component, grouped into buckets (`anchor/`, `chart/`,
`statement/`, ...). Each component folder ships:

- `<name>.manifest.json` — the machine contract (validated by `index.js`)
- `<name>.styles.css` — the component's palette-blind CSS
- `<name>.transform.js` — optional render-time HTML transform
- `<name>.docs.md` — the human docs (slots, variants, anti-patterns)
- committed gallery PDFs (light + dark)

`index.js` is the loader + validator: `loadAll()`, `groupByBucket()`, the
`FUNCTIONS`/`FORMS`/`SUBSTANCES`/`BUCKETS` vocabularies, and `validate()` —
a pipeline of single-concern manifest checkers (see the file header).

**Where to look things up:** a component's own `<name>.docs.md` for usage;
`dist/docs/components.json` for the machine catalog; `design/design-system.md`
for what a component/variant/token IS.

**The underscore contract:** a folder starting with `_` (like
`chart/_chart-family/` or `connect/_qr-card/`) is bucket-scoped shared
infrastructure, NOT a shippable component — the loader and the CSS walker
both skip it. Shared chart helpers live in `chart/_chart-family/`
(`chart-family.js`, `svg-legend.js`, `mark-detail.js`, `transform-utils.js`).

**Gotcha:** generic HTML list/section walking belongs in `lib/core/`
(`html-lists.js`, `section-walk.js`) — never copy those into a component,
and never import a component from `lib/core`.

*(File lists here are a snapshot — `ls` is the truth if they ever disagree.)*
