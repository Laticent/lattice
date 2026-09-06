- **Fixed: the Studio's desktop print document no longer claims it will draw a diagram it
  cannot.** The vector print document is built by the same builder as the live previews and
  was stamping `data-lattice-diagrams`, which withholds an un-tagged Mermaid fence's ink —
  right for a frame a human watches, wrong for a file the author keeps. It takes the same
  opt-out the raster export already did. **This does not change what you see today**: when
  Mermaid fails, an older rule hides the fence in that document either way, so the printed
  page is blank before and after. It is fixed because fixing that older rule — a diagram that
  never drew should print its source, not a blank — would otherwise make this stamp live. That fix is tracked as #2092.
