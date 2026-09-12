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
- **Fixed: a `>` inside a quoted attribute value no longer ends the tag — in EVERY reader.** Eight
  more readers bounded a tag at the first `>`, which Chromium does not. Earlier passes converted
  them a few at a time, and each time the ones left behind kept shipping the same defect: a member
  written as raw HTML with `<td title="a>b">` put `b">` and an un-dropped equation into its
  neighbor's pointer; `<h3 title="a>b">Ridge regression</h3>` labeled a page
  `b">Ridge regression`; a `<math>` tag carrying one read back its own attributes as if they were
  symbols; and a `<p title="a>b">` in front of a `**31**` figure skipped the rule that stops a
  bare numeral naming a page, so the chip read `31 deals closed this quarter`. There is one bound
  now and every reader in the label kernel uses it. Reachable only from `html: true`.
- **Fixed: an element reader stops at the first close tag whose name actually matches.** Routing
  those readers through the shared `findMatchingClose` inherited two behaviors neither the regexes
  nor the labels wanted: it matches a tag name by PREFIX, so `<li` counted `<line>`, `<link>` and
  `<listing>` (and `<annotation>` counted the real MathML `<annotation-xml>`) — one `<svg><line/></svg>`
  inside a metric name ran the reader past its own `</li>` and swallowed the next item; and it is
  DEPTH-AWARE where every regex was lazy, which changed the answer on straight authored markdown:
  a `stats` member whose first sub-bullet carries its own sub-list AND further text handed the whole
  item to the label, blew the length budget and declined, so the forward pointer stopped naming the
  next page. Tag names now match exactly and case-insensitively, on both halves of the element.
- **Fixed: the x-tex annotation is searched for, not assumed to be first.** A legal
  `application/mathml` annotation sitting before KaTeX's own left the author's `\sigma` unstripped
  and riding into the label.
- **Fixed: a `class` attribute is read the way Chromium reads it.** The class test was
  double-quote-only in both directions: `class='katex-error'` and `class=katex-error` were
  invisible, so a failed KaTeX render was not recognized and the author's raw `\frac{a` reached
  the pointer chip — and a `class=` sitting inside ANOTHER attribute's value was treated as real,
  so `<span title=" class='katex-error'">` had its visible words dropped instead. Attributes are
  walked rather than pattern-matched, and the first `class` wins, as in a browser.
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
