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
