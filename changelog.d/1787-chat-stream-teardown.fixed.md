- **Fixed: the Architect's chat reply no longer renders twice.** A paint frame still queued
  when a turn finished fired after the streaming bubble was cleared and put it straight back,
  so the reply sat on screen twice — identically, and until the next send. The turn now
  cancels its pending frame as it commits.
- **Fixed: switching decks mid-reply no longer strands the chat composer.** The turn's
  teardown was gated on the deck it started from still being on screen, so a deck switch left
  `busy` set for good: Send stayed replaced by Stop and that deck could not be sent from
  again. The reply still commits to the deck that asked for it.
- **Fixed: a reply still streaming on another deck no longer paints into this one.** The
  in-flight buffer now carries the deck that asked for it, so the panel shows it only there —
  and switching away and back mid-turn brings it back where you left it rather than blanking
  the transcript.
