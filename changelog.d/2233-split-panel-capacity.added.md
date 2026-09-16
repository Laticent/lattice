- `split-panel` now declares a content-capacity contract, so an over-long panel
  warns before it clips instead of after. The numbers are measured with
  `tools/calibrate-capacity.js` at the component's own 16-words-an-item density:
  the flat block is the landscape budget (`sweet` 3 / `soft` 4 / `hard` 5) and
  `adapt.capacity` tightens the two families that measured lower — `square` to 3
  and `tall` to 2. `tall` is the binding family, which is why a three-item
  `split-panel` splits at portrait and not at 16:9.
