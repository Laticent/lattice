- **The Studio chat's change card works one slide at a time.** Each slide the AI changed is its own card,
  with Apply, Discard and a preview button; once applied, it has Undo. Apply all, Apply remaining and
  Discard all sit at the card's bottom right, and Undo all once nothing is waiting. Slides apply in any
  order: each finds its slide by its text, so applying a new slide first does not move a later change onto
  the wrong slide.
- **Undo works on one slide, any time, and never overwrites your edits.** Undo puts the slide's earlier
  text back while it still reads as the AI wrote it. A slide you have edited since says "Applied · you've
  edited it since" instead of offering an Undo, and a slide you changed before applying says "Changed since
  proposed". A refusal is said on the row it concerns. ⌘Z still undoes each action in turn.
- **Preview a change for real before applying it.** The preview button shows the slide rendered in the
  Studio's preview with the change, marked "not applied", with Before/After (or B) and Esc to leave. On a
  phone it opens full screen with Apply at the bottom. Nothing is written until you apply.
- **One History entry per AI reply.** The card's first change saves "Before AI edit · 10:42 · “your
  request” (1 of 3 applied)", and later changes update that label instead of adding entries, so a busy card
  never pushes your own saved versions out.
- **The AI knows what you did with its card.** Your next message tells it which slides you applied,
  discarded or undid, so it does not propose a discarded change again.
- **The change card reads in plain words**, with changed words marked and a rewritten line shown whole;
  Show source brings back the Markdown. A changed figure is flagged on its slide, as before.
- **The change card takes the room it needs.** It grows to the chat's height less two lines, and the chat
  slides to it when it arrives, keeping the last two lines of the reply in view.
- **The chat's cost menu answers each question in one card.** Context window shows how full it is as a bar
  ("27% used", "268K of 1M tokens"), and This session shows what you have spent (with a bar toward your cap
  when you set one). A chevron opens each card's breakdown in place. Compact conversation keeps its button
  in view.
- **Fixed: the chat's first message could be sent twice on an iPhone.** The Return key fires once to commit the
  predictive-text word and again as Enter; both sent, the message showed twice and the second turn cancelled the
  first one's reply. An Enter that only commits a word no longer sends, and two sends in one instant count once.
