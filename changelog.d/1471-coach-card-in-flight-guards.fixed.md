- **Fixed: a Coach quick-read card no longer reappears after you dismiss it, and no longer shows
  the wrong chip's answer.** The chips that reach the voice of the deck — The ask, Structure and
  Pacing with a talk length — wait on a lazily-loaded chunk, so an answer can arrive well after
  you have moved on. A card closed during that wait came back on its own, and an earlier chip's
  answer could replace the one you clicked after it, chip highlight included. Answers that have
  been superseded are now discarded.
- **Fixed: Top fixes and Weakest slide no longer report a clean deck for one that was never
  assessed.** A deck with no `_class` slide is deliberately not assessed, and both chips read that
  as "nothing flagged — every slide follows the authoring contract" — directly below a Board
  readiness card correctly saying it had not assessed the deck. They now say so too.
