- **Fixed: a slide-map pick in the Playground's Edit view survives a busy page.** A long task during the pick's scroll
  (a garbage collection, a heavy render) used to read as the scroll stopping. The rail then moved back to the slide
  the preview was passing, and the preview stopped there. The pick now owns the preview until it reaches the slide
  you picked.
