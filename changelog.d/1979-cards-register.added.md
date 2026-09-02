- **Breaking:** a card row now sizes its cards to their text and centers the band, where it
  used to stretch them to fill the stage. A `cards-grid` or `verdict-grid` slide whose cards
  are sparse will render shorter cards than before — 211px to 134px on the measured case,
  which is the ~35% of each card that was empty. Decks that want the old fill back set
  `cards: stretch` in front matter, or `<!-- _class: cards-stretch -->` on one slide.
- **`cards:` front-matter register** — where a card row puts the height it does not need.
  - `cards: center` — cards shrink to their text, band at the optical middle.
  - `cards: stretch` — cards fill their row, absorbing the spare height. The old behavior.
  - `cards: top` — cards shrink, band under the headline rule, spare height at the bottom.
  - `cards: spread` — cards shrink, spare height shared out between the rows.
  - Per slide: `<!-- _class: cards-stretch -->` fills one slide's row; `cards-center` centers
    one. **Omitting the key is not the same as naming a value**: omission takes the
    component's own answer for that slide's shape, and naming one takes it everywhere.
- **Components declare their card composition in their manifest, and the engine honors it.**
  A `cards` field on a component manifest states its `default`, an optional `byFamily`
  override, and an optional `withCoda` one; `tools/build-stage-catalog.js` bakes every
  declaration into `lib/core/cards-catalog.generated.js`, and `lib/core/resolve-cards.js`
  resolves it against the author's `cards:` / `_class: cards-*` and stamps `data-cards`.
  Both render paths share that one kernel and stamp the same two attributes, so every surface
  answers identically — including export-to-Marp, where the runtime bundle is the only stamper.
  - `cards-grid` declares `center`, `spread` at tall and strip (there it is a single column of
    full-width cards, not a grid), and `stretch` on a slide ending in a Key Insight coda
    (that panel's step is measured from the stage, so shrinking the cards would widen it).
    `verdict-grid` declares `center`, and `stretch` with a coda.
  - No component encodes a default in CSS any more — a card row reads
    `align-content: var(--cards-align)` and nothing else. Opting a new component in is a
    manifest field plus that one declaration; a unit test fails a component that declares a
    composition its CSS never reads, so the opt-in cannot be a silent no-op. A component that
    declares nothing is not governed: nothing is stamped and its stylesheet is untouched.
