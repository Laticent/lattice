- **A `list-tabular def` clause sits beside the term it describes again.** Keying the
  sublist's roles to identity (`:nth-child(N of :not(.marks))`) raised those rules'
  specificity from (0,2,5) to (0,3,5), and def's own clause rule — which had been
  winning an equal-specificity tie on source order — started losing outright. Every
  def clause moved onto the EYEBROW's line, 29px above its term, in the rendered
  gallery. Def's rule carries `:not(.marks)` now, which restores the tie it needs and
  says plainly which elements it is for. A marked def row is fixed the same way: its
  clause keeps the two rows it spans, and the status cell auto-places onto a third row
  beneath it rather than displacing the clause upward.
