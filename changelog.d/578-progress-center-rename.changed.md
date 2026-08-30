- **The `progress-centre` Form cell is now `progress-center`.** The last UK-spelled
  identifier in the engine, renamed across the Cell directory and its two files, the
  `region` enum in `cell.schema.json` and `frame.schema.json`, ten Frame manifests, the
  progress Tile, `lib/forms/index.js`, and the docs-site Form diagram. Internal only —
  no deck-author surface names it, the id never reaches the DOM (the rail's class is
  `.tile-progress`), and nothing persists it, so no deprecation alias is needed. Two
  prose references to the footer's `footer-centre` zone went with it; the
  `--footer-center-*` tokens were already US-spelled.
- **Corrects the surviving-spelling count in HARD RULE #21 and `engineering/house-style.md`.**
  Both said 71 British spellings remain in living prose, of which about 39 were this cell.
  That cluster is gone, so about 32 remain — this supersedes the count in the house-voice
  entry, which was accurate when it shipped.
