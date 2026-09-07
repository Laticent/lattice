- **Fixed: the Playground's Explore mode no longer names a slide you cannot see.** The
  walk index was write-only — the `N / M` bar, the caption, the Step list and the `?s=`
  URL were set by a step and never corrected — so scrolling the deck left every one of
  them describing the slide you had left, and the next press of Next then scrolled you
  *backwards*. The position now follows the reader's own scroll, at every width.
- **Fixed: a shared `?s=` Playground link, a reload, and Explore → Edit → Explore all
  open on the slide they name.** All three landed the scroll while the in-iframe fit
  agent was still rescaling the deck, which threw it away — so they opened on the title
  slide while the chrome claimed otherwise. The position is now landed after the deck's
  geometry settles, and re-landed after a resize.
- **Fixed: the Playground's keyboard survives clicking the slide.** Clicking the deck
  moves focus into the preview iframe, after which the page's own listener never saw
  another keystroke and the arrow keys were dead for the rest of the session.
- **Added: `PageUp` / `PageDown` / `Home` / `End` and swipe-to-turn in the Playground.**
  The keymap now comes from the shared `present-transport` kernel rather than a
  hand-written two-key list, so the Playground turns a deck by the same rules as Present
  and the Studio — including the keys a presentation clicker actually emits. A horizontal
  swipe turns the slide; a vertical one still scrolls the filmstrip.
- **Fixed: the Playground's component picker opens on the component you are on.** It
  opened at the top of a 69-row list with the first row highlighted, so your own
  component was off screen and pressing Enter to dismiss the picker replaced your deck.
