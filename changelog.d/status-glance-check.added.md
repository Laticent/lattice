- **`npm run check:glance` checks whether status reads at a glance from the back row.** It renders a
  deck, simulates a projector in a lit room and the blur a 20/40 viewer sees at the venue's back row
  (and a designer's squint), then measures every status mark: whether it still stands off the slide
  (3:1 floor) and whether two statuses on one slide can still be told apart. It writes a contact sheet
  with failing marks boxed. Every other contrast check scores the pixels as painted, so a pale pill
  held off the slide by a thin border passed them all. Its first run found that every shipped theme's
  dark face falls below the floor at the back of a hall (2.1–2.6:1). (`tools/check-glance.js`)
