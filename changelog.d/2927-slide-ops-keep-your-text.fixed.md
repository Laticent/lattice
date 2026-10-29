- **Fixed: adding, moving, duplicating or deleting a slide in the Studio no longer rewrites the rest of
  the deck.** Before, every slide action rebuilt the whole file: it trimmed every slide's spacing and
  turned `***` separators into `---`. Moving the last slide of a 30-slide deck rewrote nearly all of
  it, so the editor saw one huge change. Now an action changes only the slides it involves, and keeps
  your separators and spacing everywhere else. On that 30-slide deck, the change is the two swapped
  slides and their separator: 47 of 757 bytes.
- **Fixed: deleting the last slide lands on the new last slide.** It landed on the slide before it.
