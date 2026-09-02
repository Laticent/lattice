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
- **Fixed: a `_lens` or `_class` comment an author QUOTED is no longer treated as a directive.** A
  backticked `` `<!-- _lens: ask -->` `` example, or one written mid-sentence, was read as the
  slide's reader-view membership — and a `--lens` export, which rewrites tags to prune views it does
  not carry, then EDITED it, shipping "Write `` at the top" where the author wrote an example. Lente
  now recognizes a directive only when the comment opens its line, which is precisely when
  markdown-it makes an `html_block` of it, so the reader agrees with the renderer by construction
  rather than by a scan of its own. The engine reached the same rule after the identical defect
  (`lib/core/class-directive-scan.mjs`); the two are pinned against each other, and against
  markdown-it, by a differential fuzz. Fence detection also gained CommonMark's three-space indent
  cap in the same pass — a four-space-indented ``` is an indented code block, not a fence, and
  reading it as one made a following directive vanish.
