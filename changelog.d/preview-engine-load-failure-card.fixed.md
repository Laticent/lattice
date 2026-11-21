- **Fixed: a preview whose slide engine fails to load now says so, and Retry really loads it again.** When the
  engine's module import failed (a dropped connection, a stalled service-worker fetch), the error never reached the
  preview, so the Studio's preview kept its loading skeleton with no message and no way out. It now shows "This preview
  couldn't render — the slide engine did not load; check the connection, then Retry" with a Retry button. If the
  first slide is already on screen, it stays visible, with a slim bar along its foot: "The slide engine did not load, so
  edits will not show here." Two more defects on the same path are fixed: Retry took no tap or click inside the Studio's
  preview, and a retried import replayed the browser's cached failure without fetching the engine again.
