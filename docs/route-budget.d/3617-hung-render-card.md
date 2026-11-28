studio: +370
home: +370
A render on the Studio's preview that has not settled after 30 s now shows the failure card with Retry (owner,
2026-11-28, D4): one 30 s clock from the oldest unsettled render, a `stalled` state that only the newest render clears, and the bar's wording, and a plain reason for a network failure. It puts the studio route over its ceiling, so it ships with #3610's raise (the one the owner approved, D5), not with bytes squeezed out. The home page loads the same DeckPreview, so home grows by the same +370; it stays under its ceiling.
