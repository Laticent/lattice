- **Breaking:** reading text now has one size per venue. List rows, agenda rows, q-and-a
  questions, table cells (every plain markdown table included), glossary definitions,
  list-tabular rows, actors, verdict-grid, pricing features, team-profile notes, roadmap rows
  and the premise ladder all read at `--fs-body`: 16 / 18.4 / 20.8 / 24.0pt at laptop /
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
- **Breaking:** every type role now scales with the venue, slide titles included. `h1` and
  `h2` used to hold 48 / 28pt at every venue while the rest grew, so at hall display text
  outranked the title. At hall a title is now 42pt, and a long one wraps: on one 83-slide
  talk, two-line titles went from 5 to 58. Budgets above laptop fall by about one element
  where a title wraps. Laptop is unchanged.
- Code, support lines and chart keys (`--fs-body-compact`) get a venue lift (1.15x at
  conference, 1.14x at hall), so labels never read bigger than the data beside them. The
  code pane at conference / hall holds 9 / 8 lines (was 11 / 10), and fewer columns.
- `h6` takes the label lift, like the label role it matches.
- Reading text set at the chrome size (`--fs-meta`) moves to the reading size too:
  `list-steps timeline` step text and `authority-chain branching` branch lines read at
  `--fs-body`, and a `timeline-list` milestone's description reads one step below its title
  (`--fs-body-compact`). `list-steps timeline` stages now share the row equally instead of
  sitting in fixed 14cqi columns, and `timeline-list`'s line length is set in `em`, so neither
  wraps a word a line at a larger venue. A lone 16-word milestone fits at hall (it clipped).
- The rule holds in every family and finish: portrait `decision`, `compare-prose` and
  `roadmap horizons` read at `--fs-body` (they read at `--fs-message` or `--fs-meta`), as do
  `video` captions and the `sketch` finish's `split-panel`.
- `premise` rows wrap instead of cutting text. At a larger venue the term was ellipsized and
  the framing question ran past its card. A row that fit its track renders as before; a long
  row now wraps to a second line, so a premise slide holds 6 fourteen-word rows at laptop
  (it read 9 while their text was cut), and `lint:deck` warns at 7.
- `pricing` lays four tiers four across without `four`; a bare four-tier slide wrapped its
  fourth tier to a second row and clipped it.
- `inventory` holds five rows at 16:9, not six (`adapt.capacity.wide.hard`); its own gallery
  showed the sixth clipping. Portrait and square keep six.
- `lint:deck` counts `list-tabular`, `glossary`, `premise` and `timeline-list` rows at laptop
  on a 16:9 deck, and warns one past the measured budget (6 rows, 9 terms, 6 fourteen-word
  premise rows, 9 short milestones). Before, it said nothing without a `venue:`, or only past
  `capacity.hard`.
- New venue budgets, re-measured: `kanban` 5 / 4 / 4 / 3 lanes (15 words) where laptop read
  "12+"; `timeline-list` 9 / 8 / 7 / 6 (6 words) and 7 / 6 / 3 / 3 (16 words); `premise`
  6 / 5 / 4 / 2 at 14 words, the true number now that no row is cut.
- `build:check` fails when a component stylesheet sets text in `--fs-message` or
  `--fs-body-compact` without a `SANCTIONED_READING_ROLE` entry naming the exception.
- The Studio's welcome deck fits every venue; three of its slides clipped at hall.
- The line geometry `lint:deck` judges `list`, `cards-grid` and `list-steps` by is
  re-measured at one reading size and scaled titles.
