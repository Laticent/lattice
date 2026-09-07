- **Fixed: a `team-profile` roster row with no `.person-*` spans is no longer dropped.**
  A hand-written `<li class="person">Bare text</li>` fell between two filters — the
  non-person branch excludes anything marked `.person`, and the person branches read
  only the three named spans — so it composed to nothing and vanished from both
  Read·Article and the spoken script. Each surface now falls back to the row's own
  content, the same "complete beats lossy" call already made for multi-note people and
  image-only names.
