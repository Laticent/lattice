- **Breaking:** reading text now has one size per venue. List rows, agenda rows, q-and-a
  questions, table cells (every plain markdown table included), glossary definitions,
  list-tabular rows, actors, verdict-grid, pricing features, team-profile notes, roadmap rows
  and the premise ladder all read at `--fs-body`: 16 / 18.5 / 20.9 / 24.1pt at laptop /
  huddle / conference / hall. Before, one deck set them at 13.5, 16 and 21pt at laptop.
  Lists shrink and hold more items: a 14-word list about twice as many at laptop (3 → 7);
  agendas gain one row at laptop and huddle and more than double at conference and hall. Tables and tabular lists grow
  and hold fewer: at 12 words a cell, a table fits 10 rows at laptop (was 11), 8 at huddle
  (was 10) and 3 at hall (was 7), and a glossary fits 4 definitions at huddle (was 9). A
  slide filled to the old table budget can now clip. Each component's "By venue" line and
  `lint:deck`'s `capacity-scale` carry the re-measured numbers.
- Display text keeps its bigger size on purpose: title, divider, quote, big-number,
  closing, topic and stats; the display registers `list principles`, `list-steps ghost`,
  `q-and-a solo`, `image statement` and `citation-card margin` / `pull-quote`; and the one
  lead sentence a slide carries (the split-panel claim, the premise lead, policy-recommendation's
  impact line and quote, inventory's callout band and pull line, and a scene or video
  caption). Code stays one step down at `--fs-body-compact`, because a line of code
  cannot wrap. Support lines stay one step down too: a list item's detail line,
  `content`'s sub-bullets and split-panel `proof` / `capstone` supporting lines read at
  `--fs-body-compact` under a `--fs-body` row.
- `compare-code` sets its code at `--fs-body-compact`, the same size as `code`. It was one
  step smaller, at the chrome size. Each pane holds 17 lines at laptop (was 20) and 47
  columns (was 57); `lint:deck` warns past both.
- Pane budgets re-measured: a glossary in a side pane holds 5 terms (was 12), 3 stacked
  (was 4); a list-tabular side pane holds 6 rows (was 7).
- A `glossary: auto` appendix now pages itself by the glossary's measured budget for the
  deck's venue (9 terms a page at laptop), where it used to render every term on one slide
  and clip past about ten.
- The list-tabular and pricing ceiling specimens say what fits now: six rows, and four
  tiers of five features.
- `team-profile` portraits are a little smaller (6.25cqi, was 7cqi), and its rows sit
  closer together. That keeps six people on one slide now that each note reads at body
  size.
- New: `npm run audit:reading-size` prints each component's reading size at every venue,
  in pt with the role it lands on, and lists the named exceptions apart.
