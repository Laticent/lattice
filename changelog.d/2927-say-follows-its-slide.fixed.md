- **Fixed: moving, adding, duplicating or deleting a slide keeps its front-matter `say:` narration on that slide.**
  The `say:` map is keyed by slide number, so before this fix, moving slide 1 later left its words narrating the slide
  that took its place. The Studio's slide actions, and Compose's add and delete, now renumber the map with the slides.
  A deleted slide's entry goes with it, and a duplicate gets a copy.
