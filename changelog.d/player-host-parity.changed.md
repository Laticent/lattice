- **Changed: the Studio's Webpage export now packs a player the way the CLI does.** It glyph-subsets
  the embedded fonts (the `examples/html-player.md` export drops from 1,095,824 to 918,858 bytes),
  and its player script is now the CLI's byte for byte: the Studio's bundle had re-printed the
  inlined transport kernels, so its script and CSP hash differed. Both hosts run one prune
  orchestration (`lib/export/player-prune.js` `prunePlayerHtml`) and one assembler tail
  (`lib/export/player-seal.mjs` `sealPlayer`), and a new integration test asserts the same bytes from
  each on a fixture that fires every pass. The CLI's `--player` output is unchanged. The Studio's
  export date is pinned to the epoch, as the CLI's is.
