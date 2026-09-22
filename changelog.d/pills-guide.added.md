- **The docs site documents pills.** A new **Guides → Pills and marks** page covers
  all three routes to a pill in one place: the universal `{LABEL}` brace grammar
  (eight shapes, twelve ordinal color slots, two sizes, the escape and the
  `inline-code: literal` off switch), the trailing-inline-code metadata pill, and the
  chart components' ten-word status vocabulary. It carries three live labs, so a
  reader edits real deck source and watches the pills redraw rather than reading a
  table of modifier names. Until now the grammar was documented only in
  `lib/base/base.docs.md`, which is the agent reference — an author working from the
  site had no way to discover that `` `{STABLE}:c2` `` draws anything.
- **The page states two limits the reference glossed over.** The status vocabulary is
  not reachable from the brace grammar — a `{LABEL}` pill can take any of twelve
  categorical slots but cannot say "this is failing" — and date pills are positional
  per-component conventions, never parsed, so a `timeline-list` leading chip renders
  whatever you put in it.
- **Fixed: two components documented a status vocabulary narrower than the one they
  accept.** `timeline-list.docs.md` listed seven of the shared ten (missing `warn`,
  `fail`, `pilot`) and `progress.docs.md` listed eight (missing `pilot`, `decision`),
  against the frozen `CHART_STATUS` in
  `lib/components/chart/_chart-family/transform-utils.js`. Both also claimed an
  unrecognized word "renders as a plain pill"; it renders a pill tinted with the
  default info hue, so a typo reads as a deliberate blue verdict rather than as a
  mistake. Both now name all ten, say the matching is case- and hyphen-exact, and say
  what an unknown word actually does.
