---
"@laticent/lattice": patch
---

The Studio chat's instructions to its model now describe the current engine: notes as `@say{…}` and its three siblings, variants in `@meta`'s `class=`, and no layout, fence or field that does not exist.

Each fix was checked against the code it describes.

- `preview_speech` no longer names the front-matter `say:` map or a `say:` line, both removed by four-notes; it reads `@say{…}`, then chart narration, then the slide text, and skips a hidden slide.
- `find_text` and `replace_text` name fields as the finder labels them: speaker notes, slide alt text, handout, comment.
- `chart_from_data` points at `read_guide chart-from-data`, not at read_component.
- The authoring rules put variants and modifiers in `class=` (`@meta{layout=list-steps, class=timeline}`), and place a full-slide photo with `image` and `class=spotlight`: there is no `bleed` layout. They no longer point at skeletons "below", which the chat agent never receives inline. The primer's variant line shows the same `@meta` form.
- The edit-block protocol asks for the whole slide from its `@meta{…}` line, and gives ```` ```math ```` as its example fence: there is no ```` ```chart ```` fence.
- The deck canon no longer names an `escalateTo` field the model never sees.
- `glossary:` is built from `terms:` definitions, not `acronyms:`.
- The language directive on every deck-content turn tells the model to keep layout names and `@meta{…}` records untranslated, not `_class` directives.
