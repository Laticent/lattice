- **Breaking:** a card row now sizes its cards to their text and centers the band, where it
  used to stretch them to fill the stage. A `cards-grid` or `verdict-grid` slide whose cards
  are sparse will render shorter cards than before — 211px to 134px on the measured case,
  which is the ~35% of each card that was empty. Decks that want the old fill back set
  `cards: stretch` in front matter, or `<!-- _class: cards-stretch -->` on one slide.
- **`cards:` front-matter register** — where a card row puts the height it does not need.
  - `cards: center` — cards shrink to their text, band at the optical middle. **The default**
    (omit the key).
  - `cards: stretch` — cards fill their row, absorbing the spare height. The old behavior.
  - `cards: top` — cards shrink, band under the headline rule, spare height at the bottom.
  - `cards: spread` — cards shrink, spare height shared out between the rows.
  - Per slide: `<!-- _class: cards-stretch -->` fills one slide's row in a centered deck;
    `cards-center` centers one slide in a deck that chose otherwise. At tall and strip those
    are not the same as omitting the key — a rule's own fallback there is `space-evenly`, so
    the per-slide token overrides the shape's default rather than restoring it.
  - Wired on `cards-grid` and `verdict-grid`. Other card components are unchanged until they
    opt in — each row reads `align-content: var(--cards-align, <its own default>)`, so adding
    one is a single declaration and no per-shape value is lost. Two shapes keep a different
    default: `cards-grid` at **tall and strip**, where the cards go full-width and it is a
    single column rather than a grid, still paces them down the frame; and **any slide ending
    in a Key Insight coda** keeps stretching, because that panel's step is measured from the
    stage and shrinking the cards would widen it.
