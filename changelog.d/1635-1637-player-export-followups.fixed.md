- **An exported player's chart fills followed the device instead of the deck.** The player
  ships no `light-dark()` by contract — every pair is resolved at export into a light base
  plus a block keyed on the `data-lp-scheme` attribute — but that rewrite only ever read
  `<style>` blocks, and the chart family writes its gradient stops as an inline `style`
  attribute (22 of them in `examples/data-viz-gallery.md`). Those shipped with the function
  intact, so a gantt bar or state-chart node was themed by the element's `color-scheme` while
  the page was themed by the player's toggle. The two agree only because the player's script
  writes an inline `color-scheme` onto `<html>`; where that coupling does not hold the chart
  takes one scheme and the page the other — reported from a real iPad as dark chart fills on
  a light page, and on a pre-17.5 WebKit (the engine this whole machine exists for) the
  declaration is invalid and the fills go black. Inline attributes are now collapsed to their
  light arm at export, with the dark arms re-applied as scoped `!important` rules under the
  same scheme scopes — including the per-slide pins. An integration test fails on any inline
  `light-dark()` in a shipped player. (#1643)
- **An exported player baked the print band's ink into the theme's dark tokens.** The map
  `themeDualMode` flattens each dark `var()` chain against was built by scanning the whole
  stylesheet, last declaration wins — so a COMPONENT-scoped declaration won. The last
  `--surface-inverse` in the bundle is `section.print`'s, which made `--on-accent:
  light-dark(#F0EDE6, var(--surface-inverse))` flatten to the print band's `#ECECEC`:
  `examples/accent-on-accent.md` slide 5 shipped headline, eyebrow, watermark and counter
  chip at **1.24:1** on the cream accent rail (13.0:1 in the reference render), on the deck
  whose subject is on-accent contrast. `--state-*-hue` took the same band's grays and every
  `--chart-cat-N-hue` went grayscale in dark mode. The map is now scoped to `:root`-subject
  blocks — the scoping the derived-token closure beside it already had, now one shared map —
  so a component-scoped declaration is absent and the chain stops with the `var()` intact: a
  missed flatten, never a wrong color. Measured across all 32 themes and nine decks driven in
  a real browser: `chart-family-coverage` 22 sub-AA labels → 1 after the toggle,
  `accent-on-accent` 4 → 2 (the two left are a decorative watermark and pre-existing muted
  chrome), 23 runs fixed, none newly failing. (#1637)
- **A baked diagram's edge labels went dark-on-dark when the player's toggle moved.** The
  `<rect>` the bake writes under a rewritten Mermaid label — its halo — was the one paint
  that skipped the scheme-token matcher every other paint goes through, so it shipped as a
  frozen literal. Mermaid paints that halo from the slide canvas, so it stayed at the export
  scheme while the ink above it kept following
  `.label tspan:not(.lp-own-ink){fill:var(--text-heading)!important}`: **1.09:1** on
  `examples/seven-steps-problem-to-code.md` and **1.06:1** on `examples/deck-class-register.md`
  after a toggle. The halo now rides as `var(--bg)` and moves with the ink; where a halo
  matches no token (a background the author chose), the ink above it is frozen to its
  bake-time literal and marked `lp-own-ink` instead — frozen together rather than frozen
  apart, which is the failure this pairing exists to prevent. Every sub-3:1 label on both
  decks is gone (5 → 0 and 4 → 0), with `examples/mermaid-diagram-surface.md` unchanged at 0.
  A browser-driven integration test pins both branches. (#1635)
- **`--strip-notes` deleted a comment out of a fenced code sample.** The scrub matched a
  note's whole body anywhere in the source, so a deck that DOCUMENTS the note syntax lost
  the sample line from the source the recipient re-imports, while the slide they can see
  still showed it. Matching is now POSITION-aware: it shares the envelope audit's
  `maskCodeRegions`, so a comment inside a fence or an inline span is left alone even when
  the same words are a real note elsewhere. `--strip-captions` gets the same treatment. (#1636)
- **`--strip-notes` was silent about a note the engine consumed as a directive.**
  `<!-- color: we should discuss the palette -->` is directive syntax, so the engine consumes
  it: it never becomes a note, the scrub never sees it, and the text ships in the envelope
  source AND on the section as `data-color`. The envelope audit now reports a directive whose
  value reads as prose — only for the directives whose value domain is tight enough to tell,
  so `<!-- paginate: true -->`, `<!-- theme: cuoio  # brand -->` and
  `<!-- header: any prose at all -->` stay silent (across the 913 tracked markdown files in
  this repo it reports once, on a changelog entry quoting the example — no deck). It stays a
  REPORT: scrubbing it would
  corrupt every deck using the ordinary comment-directive idiom and would not close the leak
  anyway, since the value is also baked onto the slide. The CLI warning no longer truncates
  mid-explanation. (#1636)
