- Every page of the site (the landing page, the Studio, the Playground and the docs) now tells a browser too old to run
  Lattice so, instead of showing it a broken page. The notice covers the
  page with the site's own background, shows one real Lattice slide, and says what this reader has and what Lattice needs
  ("You have Safari 15.6. Lattice needs Safari 16.4 or newer"), how to update that browser, with a link to its vendor's
  update page, and that browsers this old no longer get security fixes. "Continue anyway" dismisses it for the tab. Current
  browsers download nothing extra.
- Getting started has a new "Supported browsers" section: Chrome and Edge 111, Firefox 128, Safari 16.4 (iOS 16.4 on
  iPhone and iPad), Samsung Internet 22 and Opera 97 or newer.
- The Studio and the Playground now decline browsers older than Chrome 111, Safari 16.4 or Firefox 128 (they need CSS
  `color-mix()` and `@property`, which the site's CSS framework relies on), and the decline screen names the versions to
  update to instead of "a current browser".
- The notice is built for every reader: a screen reader hears its heading and lead as it opens, the update steps are a
  numbered list, what each missing capability does sits behind "Capability requirements", links that open a new tab say so, and keyboard
  focus stays inside the notice instead of wandering into the page beneath.
- The notice also reads correctly in the original Edge (EdgeHTML): readable selection colors, a narrow card where CSS
  grid is missing, and steps that install the current Edge, since the original one no longer updates.
- The notice is self-contained: it lists the supported browsers itself, in a collapsed "Supported browsers" section
  beside "Capability requirements", instead of linking to another page of the site, which an old browser could not show
  properly either. Both sections open with the same simple button in every browser. Its only link goes to the browser maker's own update
  page.
- An old browser no longer glimpses the broken page while the notice loads: the page stays hidden until the notice
  covers it.
- The notice looks like the rest of the site: the site's top bar, its flat background, its card and button styles, with
  no color jump as it appears.
- The notice is written for readers who aren't technical: what each missing capability does in plain words, a way
  forward for anyone who can't update (on a work device, their IT team; on their own, the browsers that work), and corrected steps for Macs,
  older iPhones and Android phones.
- The page beneath the notice is not drawn at all while the notice shows, so an old browser no longer flashes the
  broken page's colors (a mustard flicker in the original Edge) as the notice appears.
- In the original Edge, the page's background no longer turns the site's accent color. The site's tinted text-selection
  and link-highlight colors now apply only in browsers that support `color-mix()`; the original Edge painted them onto
  the whole page, which was the mustard flash on every refresh of the old-browser notice.
