- **Breaking:** `logo-finish:` folds into `logo:`. The logo line now takes the file and its words, in any order: `logo: brand.svg bottom-center accent-ink lg`. `lint:deck --fix` rewrites an old deck.
- The engine no longer reads `logo-finish:`. A deck that still writes it shows the logo at its defaults (top right,
  watermark, medium, every slide) until `lint:deck --fix` moves the words. The lint is an error, `key-renamed`: alone,
  the line is renamed in place; beside a `logo:` line, its words join the file, a word already there keeps its axis,
  and the old line goes.
- Every word on the `logo:` line that is not a placement, color, plate, size or scope word is the file, so a path, a
  URL, `lattice` or a `data:` URI reads the same with words around it. A second file token is usually a misspelled
  word, and the new `unknown-logo` warning says so and offers the nearest word. It replaces `unknown-logo-finish`.
- The retired `logo-style:`, `logo-on:`, `logo-x:`, `logo-y:` and `logo-scale:` keys now fold into the `logo:` line.
- The Studio's Chrome → Logo controls write their words on the `logo:` line, after the file, and the Logo field edits
  the file without dropping them. An exported bundle that drops a local logo file keeps the words.
- The slide classes do not change (`logo-bottom-center`, `logo-lg`, ...), so the rendered pixels do not either.
