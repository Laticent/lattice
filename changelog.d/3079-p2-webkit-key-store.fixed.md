- **Fixed: a stored OpenRouter key is no longer deleted when the browser fails to read its sealing
  key.** The key store removed a stored key whenever IndexedDB answered "no sealing key", and WebKit
  can answer a read of a stored `CryptoKey` with nothing. The store now counts the entry first: one
  that is there but could not be read is a passing fault, so the key is kept and tried again. Every
  path that removes a key now logs a `[lattice-key]` line to the console saying why.
- **Fixed: no character of a stored OpenRouter key sits in clear storage.** The sign-in's mint
  record named its key by the key's last four characters; it now uses a one-way hash. Clears
  CodeQL's clear-text-storage alert on `openrouter-key.js`.
