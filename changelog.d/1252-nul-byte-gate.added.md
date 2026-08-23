- **`build:check` now fails on a raw NUL byte in tracked text.** Git classifies a file as
  binary when a NUL falls in the first 8000 bytes, and then its diff reads *"Binary files …
  differ"* — a reviewer sees nothing at all, not the change and not the corruption. Two of
  the eleven errors catalogued in #1252 were exactly that, both pushed, both caught by a
  human rather than by a gate. The check found **five pre-existing files** on `main`, each
  using a NUL as a composite-key separator inside a string literal instead of the escape
  that is byte-identical at runtime — and **two of them already diff as binary today**
  (`docs/src/components/studio/AcronymEditor.tsx`, NUL at byte 2747, and
  `tools/change-coupling.js`, byte 4089 — both inside the 8000-byte window `text=auto`
  inspects), so every change to either has been invisible to review. Those five are sanctioned with their
  measurement rather than swept into this diff (HARD RULE #18: found, not caused); the
  allowlist is checked both ways, so fixing one forces its entry out and the sanction cannot
  outlive the defect. (`tools/check-ownership.js`)
