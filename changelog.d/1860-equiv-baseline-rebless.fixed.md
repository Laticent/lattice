- **Fixed: `npm run equiv:check` is green again.** Its committed baseline never described
  the tree it was committed into — it recorded 126 decks / 1223 slides / 99.2% against a
  corpus that already held 151 measurable decks and 1441 slides at that same commit, so the
  gate had exited 1 on a clean `main` since the file was created. Re-blessed at the measured
  96.6%. Not a regression: replaying the tool at the bless commit reproduces 96.6% with the
  same 49 divergent slides, deck-for-deck and cause-for-cause, and no deck added since
  contributes one.
- **Fixed: two stale claims about that measurement, both on the path of the re-bless.** The
  tool's docblock said the synthesized prelude is "EMPTY for every single slide" (it is 9,
  from two decks that set a running `class:` outside front matter), and
  `engineering/capabilities.md` said `positions` equals `slides` by construction (it is 1453
  of 1461 — `positionIsTrustworthy` and the section/chunk skip test reject different decks).
  The mutation figures that prove the check can fail are re-derived at the new baseline.
