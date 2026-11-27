---
"@laticent/lattice": major
---

**Breaking:** the deck key `cover:` is now `cover-layout:`, with the same words and the same look.

`cover-layout:` takes the same two words as `cover:`, in either order: a surface (`inverse`, `light`) and a composition (`plain`, `masthead`, `ledger`, `column`, `label`, `stage`, `frame`, `poster`). The slide classes are unchanged (`cover-light`, `cover-column` and the rest), so a migrated deck renders byte-identical. `cover:` is now a `key-renamed` error and the engine ignores it; `lint:deck --fix` renames it and keeps the words. The unknown-word warning is now `unknown-cover-layout`.
