- **Breaking: Form can no longer be disabled or configured.** The deck-wide `form:`
  front-matter key and the per-slide `form` / `no-form` tokens are retired, along
  with `readFormMode`, `FORM_MODES` and the mode argument threaded through all three
  render paths. Every slide composes as Form. A deck still carrying `form: off` now
  renders WITH the masthead band, bay and progress rail; `lint:deck` warns and names
  the consequence rather than refusing the deck, and the specific chrome controls
  (`class: no-progress`, `no-header`, `no-footer`, `no-paginate`) are unaffected.
- **Changed: sovereignty is a property of a Frame, not the absence of Form.**
  `FORM_TOGGLE_SKIP` is now `SOVEREIGN_FRAMES` — the nine Frames that declare one
  Cell instead of the chrome-hosting Frame's nine. `applyFormToggleToHtml` is
  `applyFormToHtml` and takes no deck source, because there is nothing left to read.
- **Changed: `form` is engine scaffolding, not an author modifier.** It leaves the
  universal `chrome` vocabulary (so autocomplete and lint no longer offer it) and
  joins `STRUCTURAL_ROOT_CLASSES` in the ownership gate, beside `chart-frame`.
