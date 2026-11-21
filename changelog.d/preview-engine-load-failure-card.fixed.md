- **Fixed: a preview whose slide engine fails to load now says so, and offers a way back.** When the engine's module
  import failed (a dropped connection, a stalled service-worker fetch), the error never reached the preview, so the
  Studio's preview kept its loading skeleton with no message and no way out. It now shows "This preview couldn't
  render — the slide engine did not load; check the connection, then Retry" with a Retry button. If a slide is on
  screen (the first slide can paint before the engine loads), it stays visible, with a slim bar along its foot: "The
  slide engine did not load, so edits will not show here." Retry imports the engine again, which recovers it when the
  engine's first file was the one that failed. When a later part of the engine failed, Chrome and Firefox keep that
  failure until the page reloads, and Safari's engine (measured in Playwright's WebKit) until a new tab: so if Retry
  fails too, the Studio's preview says "reload, or open the page in a new tab" and its button becomes Reload. The
  Studio saves the deck moments after each edit, and at once as a page closes, so neither loses edits. A preview whose
  page can hold unsaved work (the theme editor, the component lab) never reloads by itself: it keeps Retry and says to
  save your work first. Retry also takes a tap or click now: inside the Studio's preview it took neither.
