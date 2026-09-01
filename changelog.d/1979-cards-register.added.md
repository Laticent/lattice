- **`cards:` front-matter register** — where a sparse card row puts the height it does not
  need. A row of cards is handed the whole stage, and its wrapped lines stretch to share
  that height, so a card holding one line of text is as tall as the row and carries the
  difference as empty space inside itself. That is right when the cards are full and wrong
  when they are sparse, and only the author knows which.
  - `cards: stretch` — **the default, and unchanged**: omit the key and every deck renders
    exactly as before.
  - `cards: center` — cards shrink to their text, the band sits at the optical middle.
  - `cards: top` — cards shrink, the band sits under the headline rule, spare height
    collects at the bottom.
  - `cards: spread` — cards shrink, the spare height is shared out between the rows.
  - Per slide: `<!-- _class: cards-center -->` sets one slide; `cards-stretch` puts one
    slide back to the default inside a deck that chose something else.
  - Wired on `cards-grid` and `verdict-grid`. Other card components keep stretching until
    they opt in — each one reads `align-content: var(--cards-align, <its own default>)`,
    so adding one is a single declaration and no component's own per-family value is lost.
