- **Fixed: `--strip-notes` / `--strip-captions` no longer leave a blank line where a comment
  ended the deck.** A whole-line note or caption comment at the end of the source lost its own
  line but left the blank line above it, so the scrubbed source shipped one byte the same deck
  written without the comment does not have — in the player envelope and in the PDF
  `--embed-source` attachment. End-of-file counts as blank on the right, but it is the file
  ending rather than a line that can be taken, so "one of the two blanks goes too" took neither.
  At end of input the whole trailing run of blank lines now comes off, from either side: there is
  no block below for any of it to be separating, and a trailing blank is itself the anomaly —
  1318 of the 1325 markdown files in this repo end with a single newline. Measured against the
  repo's own hand-written note-free twin fixture, which the scrub had been missing by exactly
  that byte — under both cuts, so it was never the `preserve`/`drop` tie-break's to fix, as it
  had been recorded.
- **Fixed: the Markdown attached to a PDF by `--embed-source` is scrubbed under a cut measured
  on the document it actually ships.** The boundary was measured against the re-rendered source
  (after the Mermaid pre-render and the auto-glossary append) and then applied to the author's
  original, which is deliberately a different document and which the fidelity guard never
  checked. Nothing in the tree was affected — of the 51 markdown files that carry a comment and
  get pre-processed, the two cuts produce identical bytes on every one — so this closes an
  unguarded join rather than a shipped artifact. The check short-circuits on that equality, and
  only renders to measure when the choice could genuinely change what ships.
