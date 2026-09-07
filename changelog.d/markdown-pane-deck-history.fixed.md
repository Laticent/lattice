- **Fixed: an undo can no longer pull the previous deck's document into the one you are
  editing.** The source editor was not rebuilt when you changed decks, so the swap from one
  deck's text to another's was just another undo step — create a new deck, press ⌘Z once, and
  the deck you came from was sitting in front of you, on its way into the new deck's saved
  source, and it survived a reload. Each deck now gets its own editor, so its undo history
  starts empty. A version restore or an AI apply still keeps its history — undoing those is
  the point.
- **Fixed: "Refine" is offered exactly when you have a selection to refine.** Leaving the
  markdown pane for the rich editor left the button on screen over an editor that no longer
  existed — pressing it answered "Select some text in the editor to refine first." — and
  coming back with your selection restored left it missing. The control now tracks the editor
  that is actually on screen, in both directions.
