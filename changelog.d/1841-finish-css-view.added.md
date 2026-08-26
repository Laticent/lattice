- **Added: the Finish designer shows the CSS it generates, read-only.** It was the
  last faculty whose generated CSS an author could not see at all. The view sits
  under the live specimen, tracks the recipe as you tune the layers, names the slug
  Save and Export would actually write, and copies to the clipboard in one click.
- **Read-only is the honest surface here, not a shortcut.** A finish recipe is a
  structured four-layer object and its CSS is a projection with no inverse: the
  opaque `@media print` and `.lattice-exporting` faces are emitted twice from one
  source specifically so they cannot drift, and a wash `type` swap is a whole
  different slot set — which is why a deck's `finish-override:` overrides by
  regenerating the finish rather than by racing a rival custom property. An editable
  view would detach the CSS from the recipe the PDF and PPTX paths actually render,
  so what you saw would stop being what you shipped. `CodeField` grew a `readOnly`
  mode for it rather than the Studio growing a second code surface.
