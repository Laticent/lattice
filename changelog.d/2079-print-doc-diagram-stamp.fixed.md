- **Fixed: the Studio's desktop print PDF no longer prints an empty slot when Mermaid
  fails.** The vector print document is built by the same builder as the live previews and
  was claiming `data-lattice-diagrams`, which withholds an un-tagged Mermaid fence's ink —
  right for a frame a human watches, wrong for a file the author keeps, where it turns their
  only signal that the diagram never drew into a blank. It takes the same opt-out the raster
  export capture frame already did. The print PREVIEW cells still stamp; they are watched.
