- **`code` splits.** It was the one component in the catalog with a treatment and no processor:
  §0c had read "code-cards (by line / block — PROPOSED)" since the catalog was written, so a
  listing past the component's own stated wall rang at every presentation size while its own docs
  told authors "fourteen is the wall … split it". Two seams, tried in order — more than one fenced
  block gives each `<pre>` a page (source-sliced, so `code.styles.css` is reused whole), and a
  single block over the budget becomes line-runs, each continuation marked `(cont.)`. The single-
  block case is the one that actually clips, because the canonical code slide IS one block.
  The line cut closes and re-opens its highlight spans, so a block comment or template literal
  crossing a page boundary cannot leave one page with an unclosed `<span>`.
  `split.perPage` is 12 because a split page also carries the run's heading, rail and pointer —
  measured at portrait, 13 lines is clean and 14 overflows. A listing whose LINES are too long
  for the box still rings; no line cut can fix a width. `code` declares no `capacity` block: the
  first cut declared its documented 8/10/14 and immediately warned `capacity-crowd` on two
  committed decks, which is a real authoring finding and a separate decision from this one.
