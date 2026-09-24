- **Fixed: the Studio's Markdown and Marp exports keep a deck's saved components.**
  The Markdown export passed an empty component list and the Marp bundle passed
  none, so a slide built from a saved component arrived unstyled on the
  recipient's machine. Both exports now embed the CSS of every saved component
  the deck uses.
- **Fixed: a Marp bundle of a deck in a saved theme ships that theme.** The
  bundler looked for the theme among the site's shipped themes, found nothing,
  and fell back to `indaco` without a word. It now writes the saved theme's own
  CSS (plus any shipped parent it extends). A theme it can't find fails the
  export with the theme's name instead of substituting another one.
- **Fixed: a saved theme or component can no longer take a shipped name.** A
  theme saved as `indaco` re-skinned every deck saying `theme: indaco`, and a
  component saved as `kpi` restyled shipped `kpi` slides. A clash now saves as
  `<name>-custom`, with its `@theme` directive or its selectors and skeleton
  rewritten to match, and Fabricate and Library import say so. A record saved
  under a shipped name before this change no longer overrides the shipped item.
- **Fixed: Library import refuses an oversized asset `.zip`.** It had no size
  caps, so a small archive that declared gigabytes of content could take the tab
  down. It now applies the same caps `.lattice` import does: 25 MB on disk, 64 MB
  inflated, and at most 2,000 entries.
