- **Fixed: `--strip-notes` no longer re-cuts the deck it is scrubbing.** A note comment is an
  HTML block, so it separates what is above it from what is below. Removing the line outright
  turned `Some text` / a note / `---` into a setext heading — the export gained a slide the
  author never wrote, and the caption track bound the author's caption for slide 2 onto the
  phantom — and merged two paragraphs into one where a note sat between them. The scrub now
  keeps the boundary a comment line was providing, and takes one adjacent blank line when the
  note sat between two, so no blank-line run marks the spot either. Both export paths also
  compare the two renders and ship the deck as written, with a warning, if they ever disagree.
