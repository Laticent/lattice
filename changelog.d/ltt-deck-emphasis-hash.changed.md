- **A narrated export's timing track now notices an emphasis-only edit.** The Studio's bake passes
  each slide's emphasis spans into the deck's LTT, which hashes them with the slide's text, so
  re-weighting a phrase changes that slide's segment `hash`. A deck with no emphasis exports
  exactly the hashes it did before.
