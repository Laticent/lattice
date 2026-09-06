- The dagre layout engine no longer ships inside `lattice-runtime.min.js`. It is a
  separate `dist/lattice-dagre.min.js`, fetched only by a page that actually has a
  state chart — the shape Mermaid and the KaTeX provider already use. The runtime
  bundle drops from 243,431 to 216,937 bytes gzipped (−25.9 KiB, −10.9%) for every
  reader, including the ones whose decks have no state chart at all.
- An exported `.html` whose machines are all chains sheds a further 62.2 KiB raw /
  21.8 KiB gzipped: the CLI export inlines the engine only when a machine truly
  BRANCHES, decided by running the real dagre in Node over the deck's own topology
  rather than by asking whether the component is present. All 9 drawn machines in the
  shipped galleries are chains, so none of them pays for a layout that was computed
  and discarded. Rendered output is unchanged — 0 differing pixels across 33 pages.
- **Consumers embedding `lattice-runtime.min.js` directly:** load
  `lattice-dagre.min.js` beside it, with a `<script src>` *before* the runtime tag.
  Without it a state chart still draws, but a branching machine falls back to the
  numbered column; the runtime names the missing file on the console. Decks exported
  by Lattice carry both automatically.
