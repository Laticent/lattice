- **The Studio chat's change card lets you pick which edits to apply.** Each slide or deck
  setting in the card has its own checkbox, and a header checkbox picks all or none. Untick
  an edit and the button reads **Apply 2 of 3**; the record after it says **Applied · skipped 1**.
  Every edit stays picked by default, so one press of Apply works as before.
- **The change card takes the room it needs.** It grows to the chat's height less two lines,
  and the chat slides to it when it arrives, so the last two lines of the reply above stay in
  view. Its diffs scroll in one region with the header and the Apply bar always visible. Before,
  each slide's diff was its own 180px scroll box inside a 220px scroll box, inside the
  scrolling chat.
- **The chat's cost menu answers each question in one card.** Context window shows how full it
  is as a bar ("27% used", "268K of 1M tokens"), and This session shows what you have spent (with
  a bar toward your cap when you set one). A chevron opens each card's breakdown in place: cache
  share and tokens written, or this deck, today, the last reply and its model calls. Compact
  conversation keeps its button in view, with its numbers behind the chevron.
