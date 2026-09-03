- **Changed: a reader view now HOLDS a withheld slide's position instead of deleting it, and
  positional CSS stops being a hazard.** `section:nth-of-type(3) p { display: none }` used to land on
  whatever slide moved into third place once a projection made the deck shorter — so a paragraph the
  author hid came back in the file they sent, in a document whose stylesheet and every slide's markup
  were byte-identical to the one they previewed. A withheld slide is now emitted as an empty hole that
  keeps its slot, and `nth-of-type` is a STRUCTURAL selector: it counts a `display:none` element. The
  author's rule lands where they aimed, in both files. Measured on the real CLI — the rule computes
  `rgb(255,0,0)` on the same authored slide in the full deck and in a view that withholds two slides
  before it.
  **The artifact pays nothing for the hole on any rasterized format.** Print emits no page for it; the
  `.pptx`, `.png`, thumbnail and image-set exporters skip it by selector (they screenshot each section
  in turn, and a hidden one cannot be shot — both died with `Node is either not visible or not an
  HTMLElement` until they did). Only `.html` keeps the hole, empty, because there the CSS is still
  live and must still count. That is the whole of the cost: a `.html` recipient can see that a slide
  existed at a position, and nothing about it.
  **The visible page number is now a second, separate number.** A hole is not a page, so it does not
  advance the count — counting it printed `1 3 5` on a three-page export, which tells the recipient
  exactly which slides were withheld, the one thing the projection exists to prevent. So a deck
  carries two numbers with a relationship: the STRUCTURAL position, which every slide holds and CSS
  counts to, and the VISIBLE number, which ranks only the slides that ship.
  **Three pieces of arithmetic go with it, each of which had caused a real bug:** the projected/authored
  index remap (a view's indices are authored indices now — two rewrites had desynchronized that remap
  from the emitted deck, each time showing a reader a slide their view excluded); the rank basis in the
  cross-slide check's second hop and in the structural fuzz; and the separator pad, which existed
  because a chunk ending mid-paragraph used to land in front of the NEXT slide's `---` and be read as a
  setext underline. Nothing moves now, so every separator still follows the chunk it was written after.
- **Fixed: the corpus sweep stopped emulating the product.** Its `keepOnly` helper was a second
  implementation of the projection and drifted from it the moment the projection changed, reporting a
  refusal on essentially all 147 decks. It calls the kernel's own `emptyWithheld` now — which is the
  projection's shape, and for a corpus that declares no reader views is exactly what a projection
  would do to it.
- **Not changed, and the prediction that said otherwise was wrong: the comparison still needs its
  neutralizers.** Holding deck length fixed was expected to make most of them unnecessary. Measured
  across 148 real decks, the full deck and the proxy still differ on 6 of 7 axes — page number on 138
  decks, the dot rail on 32, the categorical accent on 31, SVG defs ids on 23. The list was never
  about the deck being SHORTER: it is about the proxy EMPTYING withheld slides, which still changes
  every position-derived piece of chrome on the slides that remain. And the renumbering that makes
  them differ is the privacy fix above, so it cannot be undone to make the comparison exact. The one
  axis that measured zero differences, the mermaid scope id, is the probe being blind rather than the
  axis being dead — the probe drives the engine renderer, which never bakes a diagram.
