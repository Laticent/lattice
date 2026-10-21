- **Changed: callouts have a plugin of their own, `callout`, and the `legend` plugin is the key.**
  Write a note pinned to a mark as `` `@callout{{Onboarding change, row="Feb 2026", col=M2}}` ``,
  and switch callouts off with `callout: off` in the front matter, `callout-off` on one slide
  (`callout-on` turns a slide back on), or `--disable-plugin callout`. A `@legend{…}` span that pins
  a mark still draws a callout, and `lint:deck` notes the old spelling (rule `callout-spelling`,
  info). Callouts hide while keeping their detail in the speaker note.
  (`lib/plugins/callout/callout.docs.md`, `engineering/decisions/2026-10-20-callout-placement.md`.)
