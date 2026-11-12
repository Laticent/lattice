- **Fixed: an offline Studio diagram draws instead of showing "Mermaid error".** When the preview's draw frame
  cannot load (offline, a stale deploy), the diagram on screen now falls back to the page's own Mermaid, which the
  warm-up caches, in the same preview rather than from the next one.
- **Fixed: the Studio editor's `@` kind menu and `@check{…}` answers open on the first span typed after load**,
  not only after one more keystroke.
- **Fixed: entering Explore on the Playground soon after load shows your draft**, not the first component's gallery.
