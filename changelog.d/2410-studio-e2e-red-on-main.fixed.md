- **Fixed: picking a component in the Playground with the preview collapsed shows the component.**
  The pick switches Edit to Explore, and a preview collapsed in Edit kept deferring the render,
  so Explore went on showing the previous deck under the new component's name. A pick (and a
  gallery load) now expands the preview, the same as any other `toPreview` route.
- **Fixed: a webpage export with "Strip speaker notes" ships the scrubbed deck again.** Since
  web images became placeholders (#2387), the bake read the authored render instead of the
  scrubbed one, so a note's whitespace came back in the exported slide. On a deck with a web
  image, no candidate cut could ever match either, so the export always fell back.
- **Fixed: a site palette change no longer blinks the presenter view off or resets the talk
  clock.** Rewriting the Stage let go of its host nodes, and the presenter view, its talk
  clock and the Stage pill were keyed on those nodes rather than on the Stage being open. The
  clock went blank for a frame and re-zeroed on every palette, lens or mode change.
