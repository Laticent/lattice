studio: +211
home: +211
notes-core's comment reader (`CommentScan`, lib/authoring/notes-core.js) replaces the `<!--+([\s\S]*?)--+!?>` regex that
recheck calls polynomial and that ran once per `<!--`, so a deck with many unclosed openers cost the square of its length
on every keystroke's notes read. A hand-written reader is longer than a one-line regex; the 211 gzip bytes are its logic
(the comments are stripped in the build), shipped in `fidelity-findings`, which reads the notes channel.
