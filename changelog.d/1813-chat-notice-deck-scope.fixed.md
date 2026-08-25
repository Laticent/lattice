- **Fixed: a chat turn that ends offline, blocked, or errored no longer paints its
  notice into another deck — or pops the Workspace sheet over one.** The Architect
  keeps a reply in flight across a deck switch by design, but only the successful
  branch checked which deck it belonged to. A turn started on one deck and finished
  while another was on screen wrote "connect a model" / "spend blocked" / "something
  went wrong" into that deck's transcript, and on the offline branch opened Workspace
  over it. The notice now travels with its deck and is shown only there — still
  waiting when the author comes back — and the Workspace prompt fires only if the
  panel is still open on the deck that asked.
