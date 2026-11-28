- **Breaking:** `mode:` is now `drawing:`. Its value `boardroom` is now `clean`, `sketch-clean` is now `sketch-headings`, and `sketch` stays. `lint:deck --fix` rewrites an old deck.
- The engine no longer reads `mode:`. A deck that still writes it renders clean until `lint:deck --fix` rewrites it:
  `mode: sketch-clean` becomes `drawing: sketch-headings`. The old key is a `key-renamed` error.
- `drawing: sketch-headings` stamps one class, `sketch-headings`, where `mode: sketch-clean` stamped two
  (`sketch sketch-clean-body`). Every sketch rule matches it, and its body text stays in the clean face.
- The per-slide classes follow: `sketch-clean-body` is `sketch-headings`, and the per-slide opt-out `boardroom` is
  `no-sketch`. (`clean` is already an `image` and `scene` variant, so the opt-out does not reuse it.) Each old class
  is an `unknown-class` error, and its fix writes the new one. Class names in an exported HTML deck change with them;
  the rendered pixels do not.
- The lint rule `unknown-mode` is now `unknown-drawing`.
