- **Fixed: a collage photo under a still mouse in the Studio now shows the zoom cursor once the collage packs.**
  A live collage lays out its photos only after it has measured them. When the mouse stopped over the preview while
  the photos were still loading, the Studio checked what was under the pointer before the photos moved into place
  and never checked again, so the photo that then packed under the mouse showed no `zoom-in` cursor and did not pop.
  The Studio now checks again when the collage packs.
