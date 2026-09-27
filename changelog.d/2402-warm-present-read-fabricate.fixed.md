- **Fixed: Compose, Present and the reading view open offline even if you never opened them online.**
  The Studio fetches both, with the modules they load once open, in the background after
  startup, so the service worker has them when the network drops. Fabricate is fetched the same
  way once you have used it. The background fetch skips Compose, Present and the reading view when the
  browser asks to save data.
