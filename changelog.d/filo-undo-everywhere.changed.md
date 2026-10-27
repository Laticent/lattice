- **Changed: ⌘Z undoes the last change to the deck, wherever you are in the Studio.** Typing,
  a deck setting, a slide moved on the rail, an AI edit, a lint fix and a restored version now
  share one undo history per deck, so ⌘Z (Ctrl+Z) and ⌘⇧Z (Ctrl+Shift+Z or Ctrl+Y) work from the
  Markdown editor, the preview, the rail, a settings panel or the page body. In the editor, the
  browser's own undo requests (the Edit menu, iOS shake) reach the same history, and on a phone
  the header carries Undo and Redo buttons. Each undo moves every pane to the slide it changed and
  says what it undid ("Undid: Theme → Cuoio") to screen readers. The history survives switching
  between Markdown and Compose and between decks for the whole session, and one deck's undo never
  reaches another deck. A text field you are typing in keeps its own undo.
