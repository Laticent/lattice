- **Fixed: a chat notice that arrives while the Chat panel is closed is no longer lost.**
  The notice lived in component state, so closing the panel destroyed it — and because the
  "connect a model" prompt is withheld once you have navigated away, a turn that came back
  offline while the panel was shut left the deck that asked showing your question with
  nothing after it. A successful reply never had that hole, so failure was the one outcome
  that could vanish. Notices are now held per deck and reach the panel wherever it is —
  reopened before the turn lands or after, or on the deck you come back to. A send on one
  deck no longer clears another deck's, and a turn superseded by a later one on the same
  deck no longer parks its failure under the newer reply.
- **Fixed: a refused **Apply** now says so on a deck you have not chatted to yet.** A
  proposal survives a reload, so applying one the next day is an ordinary thing to do — and
  when the deck had moved on underneath it, the refusal was reported for decks with a chat
  turn behind them and silently swallowed for the rest.
