studio: +664
playground: +508
home: +494

The Studio, the playground and the home page each ship lint-core and its baked venue table
for live lint. One reading size per venue (PR #2492) adds four things to them: the laptop
check for list-tabular, glossary, premise and timeline-list (`LAPTOP_JUDGED`, plus the 16:9
test that keeps it off 4:3 decks), the code lift that keeps a venue's code-column cap in step
with the CSS (`CODE_LIFT`), new measured rows (kanban, timeline-list, premise, list-tabular's
`compact` row), and the line geometry of list, cards-grid and list-steps re-measured at the
new sizes. Given back first: the generator now drops a numbered register's budget within 2 px
of the bare one, the same rule it already applied across venues.
