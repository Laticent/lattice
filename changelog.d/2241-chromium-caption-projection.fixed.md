- `--captions` now writes a caption track in a published install. The projection's first
  line was `require('jsdom')`, and jsdom is a devDependency — so outside this repo it threw,
  the failure scrolled past as a warning, and the deck shipped with only its authored caption
  overrides. Measured with `node_modules/jsdom` moved aside: `examples/read-along-captions.md`
  produced a 2-cue `.vtt` before and the full 27-cue track after. It runs in the Chromium the
  export already launched instead.
- `--captions` exports are faster: the projection no longer builds three jsdom windows per
  run (one of them per slide). Measured across the nine decks that ship a committed `.vtt`,
  with the two arms alternating over four rounds: 47.99s → 27.36s in total, 2.0–2.9s off each
  deck. Every exported artifact is byte-identical.
