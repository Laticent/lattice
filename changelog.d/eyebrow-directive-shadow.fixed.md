- **Documented: the eyebrow position takes plain inline code, and a pill or a mark there
  is not a kicker.** The eyebrow is a POSITION — a paragraph whose only child is a
  `<code>` element, before a heading or list — so the `{LABEL}` / `[x]` grammar replaces
  that element with a `<span>` and the promotion silently drops: `` `{DRAFT}:c2` `` above
  a heading renders as a pill alone on a line. Escaping it (`` `\{DRAFT}` ``) keeps the
  `<code>` and keeps the kicker. The same is true of the SUBTITLE position — a code-only
  paragraph immediately after a heading, promoted by the same rule. Measured across every
  shipped deck — well over a thousand spans across the two positions — **zero** affected,
  since a real one reads `Section 01` and starts with neither a brace nor a marker; so
  nothing rendered differently, and what was missing was anyone writing it down. A census
  test scans both positions on every run and fails if a deck ever writes one, naming the
  file, the line and the escape. (No exact count is quoted here on purpose: three were, and
  each was overtaken within days — by a scanner fix, then by a routine rebase that added
  decks. The test is where the number lives. The scanner fix is worth knowing about
  independently: it stopped at the first non-blank line after a span, so an HTML comment
  between a span and its heading hid the span entirely — markdown-it strips the comment and
  promotes the eyebrow anyway, so the census was certifying a deck it had not looked at.)
- **Decided: the variable grammar will be BRACED — `` `{$now.date}` ``, not
  `` `$now.date` ``.** The render-time built-ins proposed for the engine
  (`$now.date` / `$now.time` / `$now.datetime` / `$now.year`, plus `$deck.*` and
  `$slide.*`) were specced bare, which would have made `$` a third opening character
  beside `{` and `[`. One brace pair dispatches everything and `$` becomes a namespace
  inside it, so the grammar is two characters with one rule each — **braces dispatch,
  brackets mark**. The sigil is kept rather than collapsing to `` `{now.date}` `` because
  dropping it would put built-ins in the same namespace as author pill labels and require
  reserved words inside it — the mechanism deliberately refused for `{x}`. Nothing ships
  yet; this fixes the spelling before decks are written against the other one.
