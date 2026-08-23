- **`build:check` now fails on a raw NUL byte in tracked text.** Git classifies a file as
  binary when a NUL falls in the first 8000 bytes, and then its diff reads *"Binary files …
  differ"* — a reviewer sees nothing at all, not the change and not the corruption. Two of
  the eleven errors catalogued in #1252 were exactly that, both pushed, both caught by a
  human rather than by a gate. The check found **five pre-existing files** on `main`, each
  using a NUL as a composite-key separator inside a string literal instead of the escape
  that is byte-identical at runtime — and one of them,
  `docs/src/components/studio/AcronymEditor.tsx`, **already diffs as binary today**, so
  every change to it has been invisible to review. Those five are sanctioned with their
  measurement rather than swept into this diff (HARD RULE #18: found, not caused); the
  allowlist is checked both ways, so fixing one forces its entry out and the sanction cannot
  outlive the defect. (`tools/check-ownership.js`)
