- **Fixed: the four places a split page's forward pointer could be named are one place now.** The
  carousel slot title, a member's leading `**bold**`, its `###` subheading and its plain text ran
  two copies of the same four rules, and the copies disagreed: `- **Recency** — decays toward
  $A \to B$` kept its name while `- Recency — decays toward $A \to B$` lost it, for content that
  renders the same chip either way. Three ordering defects went with the copy — a shape glyph in
  the DESCRIPTION half (which the chip never carries) declined the whole label; a dropped leading
  equation still counted against the prose that survived it; and the splitter's own
  `data-split-label` stamp skipped both content rules entirely, so a `theorem` card titled
  `**$A \to B$ Theorem.**` shipped the chip `A→B Theorem` — a typed arrow two characters from the
  engine-drawn one.
- **Fixed: a `>` inside a quoted attribute value no longer ends the tag.** Three readers bounded a
  tag at the first `>`, which Chromium does not: a member written as raw HTML with
  `<td title="a>b">` put `b">` and an un-dropped equation into its neighbor's pointer. Reachable
  only from `html: true`, fixed in the shared tag strip so every reader gets it.
- **Fixed: a carousel slot title carrying math is read depth-aware.** The one read that runs FIRST
  used the lazy `</span>` pair the rest of the file bans, so a title holding `$X^\top X$` stopped
  at KaTeX's first inner close and the chip printed the per-glyph visual half AND the raw TeX:
  `X ⊤ X X^\top X`.
- **Fixed: a block BETWEEN two split members rides one page — the member it follows.** A sentence
  written between two `theorem` cards is neither a member nor the run's closing material, so it
  stayed in the trunk and printed on every body page: an authored "that theorem is the only one we
  need for the proof that follows below" appeared above the Proof card as well, with no theorem on
  that page. A block written BEFORE the first member is framing and still repeats, deliberately —
  a premise every card is read under, the same way the equation repeats over every legend page.
- **Fixed: a member whose math fails to TYPESET is named by the prose beside it.** KaTeX has two
  failure renderings and only one carries a class, so a `ParseError` — `$\frac{a$`, an unbalanced
  `\left(`, an unclosed environment — was invisible to the label reader and the author's raw TeX
  reached the pointer chip. Both renderings are recognized now, and the separator goes with the
  dropped span, so `- $\frac{a$ — the unclosed one` points at `the unclosed one` rather than at
  `— the unclosed one`.
