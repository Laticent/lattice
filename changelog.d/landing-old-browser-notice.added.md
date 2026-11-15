- The landing page now tells a browser too old to run Lattice so, instead of showing it a broken page. The notice keeps the
  page visible behind it, blurred, shows one real Lattice slide, and says what this reader has and what Lattice needs
  ("You have Safari 15.6. Lattice needs Safari 16.4 or newer"), how to update that browser, with a link to its vendor's
  update page, and that browsers this old no longer get security fixes. "Continue anyway" dismisses it for the tab. Current
  browsers download nothing extra.
- Getting started has a new "Supported browsers" section: Chrome and Edge 111, Firefox 128, Safari 16.4 (iOS 16.4 on
  iPhone and iPad), Samsung Internet 22 and Opera 97 or newer.
- The Studio and the Playground now decline browsers older than Chrome 111, Safari 16.4 or Firefox 128 (they need CSS
  `color-mix()` and `@property`, which the site's CSS framework relies on), and the decline screen names the versions to
  update to instead of "a current browser".
- The notice is built for every reader: a screen reader hears its heading and lead as it opens, the update steps are a
  numbered list, the technical detail sits behind "Technical details", links that open a new tab say so, and keyboard
  focus stays inside the notice instead of wandering into the blurred page beneath.
- The notice also reads correctly in the original Edge (EdgeHTML): readable selection colors, a narrow card where CSS
  grid is missing, and steps that install the current Edge, since the original one no longer updates.
- The notice is self-contained: it lists the supported browsers itself, in a collapsed "Supported browsers" section
  beside "Technical details", instead of linking to another page of the site, which an old browser could not show
  properly either. Both sections collapse in the original Edge too. Its only link goes to the browser maker's own update
  page.
