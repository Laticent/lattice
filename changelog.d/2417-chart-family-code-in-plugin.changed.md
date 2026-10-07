- The chart family's code and stylesheet live in its plugin now. The section dispatch and chart
  frame moved from `lib/components/chart/_chart-family/chart-family.js` to
  `lib/plugins/chart-family/chart-family.dispatch.js`, the generated dispatch table to the plugin's
  `shared/chart-registry.generated.js`, and the chart-frame stylesheet to
  `chart-family.styles.css`, the plugin's `styles` contribution. In `dist/lattice.css` that sheet
  now sits in the plugin slot, after the forms and accent finishes rather than before the
  treatments; every element's computed style is unchanged across the tracked decks, and the
  Guide's focus and highlight inside a chart paint as before. Rendered HTML is byte-identical.
- Moved module paths (no compatibility shims: pre-GA): `lib/components/chart/_chart-family/chart-family.js`
  is now `lib/plugins/chart-family/chart-family.dispatch.js`, and
  `lib/components/chart/_chart-family/chart-registry.generated.js` is now
  `lib/plugins/chart-family/shared/chart-registry.generated.js`.
- A plugin that offers an extension point ships `<name>.dispatch.js`, the module that calls its
  fillers (spec/LPM.md §2); the build fails a slot with no dispatch, and a dispatch with no slot.
