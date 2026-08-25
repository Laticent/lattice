- **Fixed: a chat notice that arrives while the Chat panel is closed is no longer lost.**
  The notice lived in component state, so closing the panel destroyed it — and because the
  "connect a model" prompt is withheld once you have navigated away, a turn that came back
  offline while the panel was shut left the deck that asked showing your question with
  nothing after it. A successful reply never had that hole, so failure was the one outcome
  that could vanish. Notices are now held per deck and are waiting when the panel reopens,
  whether it reopens before or after the turn lands; a send on one deck no longer clears
  another deck's; and a turn that has been superseded by a later one on the same deck no
  longer parks its failure under the newer reply. This covers a failed **Apply** too, whose
  notice previously died with the panel in the same way.
