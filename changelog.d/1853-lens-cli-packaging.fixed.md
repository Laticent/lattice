- **Fixed: the published CLI can run `--lens`, read-along and chart narration.** `dist/lattice-emulator.js`
  left `require("@workwel/lente")` and three `require("@workwel/cadenza")` calls bare, and those are
  npm-workspace members: they resolve through a symlink in this repo and resolve nowhere after
  `npm install @workwel/lattice`. The CLI bundle now inlines the workspace packages like the rest of
  the local graph, so `--lens`, read-along, chart narration and the caption kernel run outside a
  clone. Verified by running a `--lens` export with those packages made unresolvable.
- **Fixed: removing a slide's reader-view tag no longer eats the author's line break.** Lente's tag
  writer dropped the newline after a `<!-- _lens: … -->` comment whenever the tag cleared, which is
  right for a tag on its own line and wrong for one at the end of a line of prose: the next line was
  spliced onto the previous one. On prose that silently merged two paragraphs; on a line followed by
  a code fence it spliced the fence opener into the prose, so the fence never opened, its closer
  became an opener, and a `---` inside the code became a setext underline — one authored slide
  rendered as two. Reached through a `--lens` export, that put another view's slide on a reader's
  screen. The newline now travels with the comment only when the comment owned the line.
- **Fixed: a second `_lens` comment on one slide is no longer invisible.** Lente reads only a slide's
  first tag, so a second one was never parsed and never rewritten — dead weight to every reader, and
  a withheld view's id to the recipient of a projected export. `stripExtraLensTags` removes it.
