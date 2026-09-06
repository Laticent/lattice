- The dagre layout engine is now delivered only where a state chart actually
  needs it. An exported `.html` whose machines are all chains sheds 63.7 KB raw
  / 22.4 KB gzipped: the export prepends the engine only when a machine truly
  BRANCHES, decided by running the real dagre in Node over the deck's own
  topology rather than by asking whether the component is present. All 13
  machines in the shipped galleries are chains, so all of them stop paying for
  a layout that was computed and discarded. Rendered output is unchanged —
  verified at 0 differing pixels across 33 pages.
