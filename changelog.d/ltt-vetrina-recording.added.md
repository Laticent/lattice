- **The Vetrina page records and replays a tour.** `/vetrina` gains Record, which writes its
  "Point at a thing" beat down as a seekable timing track (`.ltt.json`), and Replay, which plays the
  committed recording back so each stroke lands on the word that names it, as recorded;
  `/vetrina?replay` starts the replay on load. The beat's four strokes now land on their words
  ("rule", "boundary", "swept", "tapped") when it plays live too. A test checks the recording against the page's own storyboard, so an edited line
  is flagged as stale instead of replaying out of step.
