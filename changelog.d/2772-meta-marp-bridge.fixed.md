- **Export to Marp no longer puts Lattice-only settings in the speaker notes.** Marp shows a comment of keys it
  does not know as a presenter note, so a slide's `_focusSteps`, `_build`, `_track` or `_logo` comment reached the
  recipient's PowerPoint and PDF notes, in either spelling. The export now leaves those comments out of the bundle;
  a comment that also holds a key Marp knows stays whole. (`lib/export/marp-directives.mjs`)
- **The Studio's Export to Marp lifts `![bg]` before it bakes heading splits,** as the CLI does. Run last, an image
  slide with two headings lost its picture panel and Marp drew the photo full-bleed behind the text. Both producers
  now share one pass list, and a test fails if either reorders it. (`docs/src/components/studio/export/deck-export.js`)
- **A slide-record field that cannot reach Marp whole stops the CLI export** with its line, and the Studio says it in
  the export note, instead of the field going missing in silence. (`tools/export-marp.js`)
