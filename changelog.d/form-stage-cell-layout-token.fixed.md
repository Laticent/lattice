- **Fixed: a `<!-- _class: list bullet -->` slide gets the `.cell-stage` clip cell
  its six sibling variants already had.** The wrap decision let ANY token in the
  class list veto, and `bullet` also names the bullet CHART — a `canvas` component —
  so the list's body was left unwrapped and lost the bounded box the overflow probe
  walls. The decision now follows THE layout token (the first one naming a known
  layout, i.e. the component the slide is), the same first-match scan
  `layoutTokenFor` already uses. Measured across every component × variant
  combination the manifests declare (273): exactly one answer changes.
