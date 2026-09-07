- **Fixed: the Studio now loads and presents on the docs dev server.** Two
  dev-only faults stacked. Vite's dev server never applies its CommonJS→ESM
  interop to a source file fetched over `/@fs`, so `lib/core/front-matter-key.js`
  reached the browser as raw CommonJS and the ESM module that default-imports it
  took the whole Studio island down with a "does not provide an export named
  'default'" hydration error. A dev-only Vite plugin now supplies that interop
  for the leaf CommonJS modules under `lib/`. With the island alive, Present
  still stranded on its loading skeleton: `DeckPreview` kept mount-scoped refs —
  its renderer above all — across React StrictMode's mount→unmount→remount, so
  the second mount reused a disposed renderer that never rendered again. The
  unmount cleanup now clears what it tears down.
