- **Changed: callouts have a plugin of their own, `callout`, and the `legend` plugin is the key.**
  Write a note pinned to a mark as `` `@callout{{Onboarding change, row="Feb 2026", col=M2}}` ``,
  and switch callouts off with `callout: off` in the front matter, `callout-off` on one slide
  (`callout-on` turns a slide back on), or `--disable-plugin callout`. Nothing a deck already says
  breaks: a `@legend{…}` span that pins a mark still draws a callout, and `legend: off`,
  `legend-off`, `legend-on` and `--disable-plugin legend` still switch callouts; `lint:deck` notes
  the old spelling (rule `callout-spelling`, info). A rendered slide is byte for byte what it was.
  (`lib/plugins/callout/callout.docs.md`, `engineering/decisions/2026-10-20-callout-placement.md`.)
