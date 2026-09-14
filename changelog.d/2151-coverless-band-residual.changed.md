- **Known limit, recorded rather than hidden:** a coverless `split-panel` split page places its
  forward pointer as an opaque pill in the bottom band, and a long enough member still prints
  under it. The band reservation repositions content that FITS — which is what keeps a run's
  pages aligned and puts the reserve on the panel in the corner — but it cannot hold longer
  content out, because the panel clips at its padding box. Measured on a four-member portrait
  deck swept at seven body lengths: 8 and 12 words clear, 16 words collides without the reserve
  and clears with it, and 20 words and up print the pill's full height over the text with the
  reserve and without it, identically. **A page whose content FITS its panel can still have the
  pill over its words, and nothing in the engine says so** — at 20 words `scrollHeight ===
  clientHeight`, no `overflow` class is set and the CLI prints no warning. What does see these
  lengths is the deck linter, with two rules rather than the one an earlier draft named:
  `lint:deck` calls `density-crowd` past this component's 16-word soft target and
  `density-overflow` past its 24-word hard limit, and which one fires at a colliding length
  depends on the element's title, because the rule counts the whole element. Both are advisory and
  neither blocks. The root fix is in `dockInFooterCell`, which appends both wayfinding marks at
  section level on any page with no footer row, and belongs in its own change.
