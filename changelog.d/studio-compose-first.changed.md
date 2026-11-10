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
  so the whole pill jumped. It now reserves room for every style; on a phone it has a fixed width.
