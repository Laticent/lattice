- **The Studio is Compose-first.** A new visitor now writes in **Compose**, the rich editor; the
  Markdown editor is called **Source** everywhere and stays one click away for power users. The
  Studio remembers the choice, so picking Source once keeps it. Every menu lists Compose before
  Source: the editor pane's header (where the word `EDIT` used to sit), the phone's action bar, and
  ⌘K, which gains "Write in Compose" and "Write in Source". The pair keeps its words until the
  editor pane is too narrow to hold them; the header measures its own row and drops the issue
  pill's word first. Messages that said "edit this slide in Markdown" now say "in Source".
- **Fix all, its issue count, and Refine selection work in Compose.** Before, Fix all did nothing
  in Compose, its count fell back to a different estimate, and Refine was only offered in the
  Markdown editor.
- **The welcome tour and the "Write a slide" lesson lead with Compose.** A visitor who chose
  Source still hears the Markdown wording. Five new narration lines are recorded.
- **Compose's slide toolbar no longer changes size as the caret moves.** It used to grow and shrink
  with the styles the block under the caret offers (a heading offers one, an eyebrow line three),
  so the whole pill jumped. It now reserves room for the styles the current slide can offer, and
  on a narrow pane (phone, tablet) its two rows are as wide as their contents.
- **Compose looks like the signature mode without looking like an action.** Its icon and word stay gold
  whether it is selected or not, in a shade that passes WCAG AA in every palette. Selected, it takes the same
  light chip as Source, on the phone bar too. A solid accent fill stays reserved for Present.
- **The selected stop in Read · Write · Craft is an ink chip.** It used to be a faint gray tint with a
  gold hairline; it is now the inverted chip the phone bar already uses for its selected cell.
- **The Studio keeps your place when you switch panes or reload.** Compose on a slide, then Source, then Compose
  or Preview used to land on slide 1, and a reload jumped there a second after showing the right slide. The slide
  now holds through every switch and a reload, and when you move between Compose and Source the caret lands on the
  same line where it can match it (else at the slide's first line, as before).
- **You can see where you are after a switch or a reload.** With a keyboard, the editor you switch to takes focus with
  the caret where you left it; on a phone, switching straight between Compose and Source brings the keyboard up the same
  way, and arriving from the preview shows a drawn caret instead of the keyboard. A reload brings back the caret's line
  as well as the slide.
