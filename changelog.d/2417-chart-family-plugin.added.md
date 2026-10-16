- The chart family is a plugin (`lib/plugins/chart-family/`): it offers the `kernel` extension point,
  and every chart fills it from the `kernel` block its manifest already carries. A host can switch
  it off (`createEngine({ plugins: { disabled: ['chart-family'] } })`, `--disable-plugin
  chart-family`): each chart slide then shows the list it was written as, carries
  `data-lattice-off="chart-family"`, and the render reports `plugin/component-needs-plugin`. On a
  host that narrowed its default set, a chart slide class loads the family. Default renders are
  byte-identical.
- Plugin manifests gain `contributes.extensionPoints` (spec/LPM.md §3.3): a slot a plugin offers and
  components fill. Filling a slot is requiring the plugin.
