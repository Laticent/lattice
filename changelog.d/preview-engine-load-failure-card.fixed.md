- **Fixed: a preview whose slide engine fails to load now says so, with Retry, instead of spinning forever.** When the
  engine's module import failed (a dropped connection, a stalled service-worker fetch), the error never reached the
  preview, so the Studio's preview kept its loading skeleton with no message and no way out. It now shows "This preview
  couldn't render — the slide engine did not load; check the connection, then Retry" with a Retry button, which loads
  the engine again.
