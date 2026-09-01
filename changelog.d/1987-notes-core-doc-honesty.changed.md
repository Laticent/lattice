- **Changed: `--strip-notes` now says what it does not remove.** The flag removes the speaker-note
  channel and deliberately not the `<!-- describe: -->` accessibility description, which is the
  slide's text alternative and rides on into the PPTX `altText` and the HTML `aria-describedby`.
  That boundary was real behavior with nothing stating it; it is now in the CLI help and in
  `design/skills/speaker-notes.md`.
- **Changed: `notes-core` no longer advertises a parity test the Marpit pragma set does not have.**
  Its directive-name mirror is checked against the engine's registry; the Marpit copy is a
  historical verbatim copy with nothing enforcing it, and the comment that likened the two implied
  a gate that does not exist.
