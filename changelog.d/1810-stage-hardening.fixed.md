- **Fixed: a Stage that was navigated away left the console driving a dead window.** The
  controller recognized its Stage by the message event's `source`, and the goodbye a
  *navigation* fires arrives with a different one — so a link click on the projected deck,
  an F5 or a Back went unnoticed. `window.close()` was the only teardown path that ever
  reported itself. The console then kept the pill lit while the captions and the progress
  rail were on **neither** surface, and went on posting the presenter's live slide index at
  a page it no longer owned. The Stage is now identified by a marker every document it
  writes carries, backed by a slow liveness poll for the case an unload beat cannot
  report at all — a killed renderer.
- **Fixed: a cross-origin Stage could take the whole Studio down.** Reading that window
  during render threw a `SecurityError`, and the next keystroke swapped the Studio for its
  crash card, mid-talk.
- **Security: the Stage no longer follows links, and no longer receives wildcard messages.**
  A deck's own `<a href>` is clickable on the projected copy; a click there navigated the
  window and handed a foreign origin `window.opener` on the origin that holds the user's
  API key. Link clicks are inert on the audience surface, and every message the console
  sends is addressed to its own origin rather than `*`.
- **Fixed: the Stage's palette followed the site again.** The values are baked into the
  document when it is built, and a live site-palette change did not rebuild it — so the
  room kept the palette the Stage opened with. A `color-mix()` accent also resolved to gray,
  because a computed color comes back as `color(srgb 0.68 …)` with 0–1 channels and the
  parser read them as 0–255.
- **Fixed: the Guide searched the whole deck on the Stage.** The Stage is a filmstrip, so
  every slide's blocks are in the DOM and still measurable — the pointer could aim at a
  sentence on a slide nobody could see, and measured twelve times as many rectangles per
  spoken sentence as the console does. It now searches only the slide being shown.
- **Fixed: full screen survived the deck landing.** `document.open()` destroys the element
  that is full-screen, so the attempt made during opening was undone by the deck write that
  followed it. It now runs once the deck is live, and only onto a screen the Stage was
  actually placed on — on a single-screen laptop it could otherwise cover the console.
- **Fixed: the console keeps the keyboard when the Stage opens.** A new window takes focus,
  and every deck key is bound on the console — so the first press of a presentation clicker
  did nothing.
- **Fixed:** a failed Stage render said so instead of leaving "Preparing the stage…" up for
  good; closing the Studio tab no longer strands a deck on the projector; and a write that
  threw no longer latches the document out of ever being replaced.
