studio: +1260
playground: +900
home: +1010
Present now walks a stepping slide (`_build`, `_focusSteps`) on one slide: the step painter and cursor
(`lib/core/step-state.mjs`, about 660 gzip bytes minified) and DeckPreview's `step` prop ship wherever DeckPreview or
the transport loads. Given back first: DeckPreview imported `stepEnter` from present-transport.mjs, which pulled the
whole transport into the home route (+2227 there); the two pure step functions moved into step-state.mjs and the
transport re-exports them, so home carries only the painter. The page-per-step export's kernel lives in its own module,
`lib/core/step-pages.mjs`, which only the lazy export path and the CLI load (about 200 gzip bytes kept off every route).
The owner's D2 adds the jump entry to the cursor and Present (a build entered by a jump starts at step 0) and the
autoplay rest entry. CI measured studio +1377, playground +1049 and home +1141 at f32e15a with the export kernel still in
step-state.mjs; less the ~200 moved out, these numbers carry a little room for gzip variation.
