---
"@laticent/lattice": patch
---

Lint no longer counts an old `<!-- _class: … -->` comment as setting a slide's class: `meta-class-overridden` now names only two `@meta` records that each set the class.

Since the cut, the engine ignores the old comment, but this rule still treated it as a class setter. A slide with `<!-- _class: kpi -->` followed by `<!-- @meta{headline=left} -->` got a warning that `kpi` was dropped, which described a class the engine never read. That slide now gets only `legacy-directive-comment`, the "not read" error with its whole-deck fix. Two records that both set the class still warn, as before.
