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
  a withheld view's id to the recipient of a projected export. `stripExtraLensTags` removes it, as
  long as it is the whole of its own line. One that shares its line with anything — a `>` or `-`
  marker, a list item's content indent, another comment — is left alone deliberately, and the export
  refuses rather than shipping a withheld id it could not safely rewrite (below).
- **Fixed: a `_lens` or `_class` comment an author QUOTED is no longer treated as a directive.** A
  backticked `` `<!-- _lens: ask -->` `` example, or one written mid-sentence, was read as the
  slide's reader-view membership — and a `--lens` export, which rewrites tags to prune views it does
  not carry, then EDITED it, shipping "Write `` at the top" where the author wrote an example. Lente
  now recognizes a directive only when the comment opens its line, which is precisely when
  markdown-it makes an `html_block` of it, so the reader answers the question the way the renderer
  does rather than by a scan of its own. The engine reached the same rule after the identical defect
  (`lib/core/class-directive-scan.mjs`); the two are pinned against each other, and against
  markdown-it, by a differential fuzz over quoting shapes. Where the rule is not CommonMark — a
  container marker carrying four columns of its own indent, a fence opened inside a blockquote — both
  copies say so together, and those shapes are enumerated in the pin and tracked as #2034 rather than
  claimed absent. Fence detection also gained CommonMark's three-space indent cap in the same pass —
  a four-space-indented ``` is an indented code block, not a fence, and reading it as one made a
  following directive vanish.
- **Fixed: a reader-view tag that shares its line is read and never rewritten, and an export that
  would have to rewrite one refuses.** `- <!-- _lens: x -->` is a real directive — the renderer opens
  one inside the list item too — and every way of deleting it corrupted the line's residue, which is
  itself markdown. Taking the newline spliced the next line onto the marker, so `- <!-- _lens: secret -->`
  followed by a fence became `- ``` `: the fence never opened, one authored slide rendered as two,
  and the position-indexed view map shifted under a reader who was then shown a slide their view
  excludes. Leaving the newline left a bare `-`, which is a setext underline — the paragraph above
  became a heading. Leaving it inside a tight list left a blank line, turning the list loose and
  giving every item a paragraph wrapper. The export's re-split check caught none of them, because
  none changes the slide count. Nothing sharing its line is edited now, in either direction; the
  cost is that a withheld id in such a tag cannot be pruned, so the export **re-reads what it
  emitted and refuses**, naming the id. That check is a verification rather than a fifth attempt at
  the rule, so it also covers the fence-detection gap still open in #2034.
