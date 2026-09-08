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
