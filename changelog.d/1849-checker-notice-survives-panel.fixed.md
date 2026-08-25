- **Fixed: a chat turn that fails while the Chat panel is closed no longer says nothing
  at all.** The notice lives in component state, so closing the panel mid-turn destroyed
  it — and because the "connect a model" prompt is withheld once you have navigated away,
  a turn that came back offline while the panel was shut left the deck that asked showing
  your question with nothing after it. A successful reply never had that hole, so failure
  was the one outcome that could vanish. Failure notices are now parked per deck and are
  waiting when the panel reopens; a send on one deck no longer clears another deck's.
