- **Fixed: `--strip-notes` no longer re-cuts the deck it is scrubbing.** A note comment is an
  HTML block, so it separates what is above it from what is below. Removing the line outright
  turned `Some text` / a note / `---` into a setext heading — the export gained a slide the
  author never wrote, and the caption track bound the author's caption for slide 2 onto the
  phantom — and merged two paragraphs into one where a note sat between them. The scrub now
  offers two cuts — leave a blank line in the comment's place, or take the line — and both
  export paths RENDER each and keep whichever reproduces the deck the author wrote, because the
  right answer is deck-dependent: a note above a `---` needs the blank, a note inside a list item
  needs the line gone. A note between two blank lines still takes one of them, so no blank-line
  run marks the spot. If neither cut reproduces the deck (a note at column 0 splitting two
  lists), the slides ship as written with a warning — and the warning now says that the embedded
  source will re-import with that boundary changed, which the earlier wording did not.
