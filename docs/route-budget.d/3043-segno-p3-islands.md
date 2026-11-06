studio: +462
playground: +301
home: +301
The shared parser chunk (`_astro/slide-boundaries`) carries S1's comment-content recorder and `DeckModel.blockContent`, which replace directive-island's prefix heuristic so a multi-line directive in a list or quote reads as the engine reads it; the Studio's class editor chunk carries `commentBlocks`, so the editor reads the comments the engine reads (a `<div>`-folded comment is no longer shown as the slide's class). The boundary memo's deriver is injected rather than imported, so neither the app nor the lint core carries `updateDeckModel` for it.
