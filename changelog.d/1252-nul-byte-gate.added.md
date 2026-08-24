- **`build:check` now fails on a raw NUL byte in tracked text.** Git classifies a file as
  binary when a NUL falls in the first 8000 bytes, and then its diff reads *"Binary files …
  differ"* — a reviewer sees nothing at all, not the change and not the corruption. Two of
  the eleven errors catalogued in #1252 were exactly that, both pushed, both caught by a
  human rather than by a gate. The check found **five pre-existing files** on `main`, each
  using a NUL as a composite-key separator inside a string literal instead of the escape
  that is byte-identical at runtime — and two of them
  (`docs/src/components/studio/AcronymEditor.tsx`, NUL at byte 2747, and
  `tools/change-coupling.js`, byte 4089) sat inside the 8000-byte window `text=auto`
  inspects, so every change to either had been invisible to review. All five were fixed in
  the same release (see the NUL-escape entry below), so the allowlist ships empty and the
  gate covers every tracked text file. (`tools/check-ownership.js`)
