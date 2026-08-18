- **HARD RULE #28 — chrome is drawn, never typed — is now gated.** A typed check mark resolves to
  whatever font on the reader's machine covers U+2713, so its shape and weight shift across
  operating systems and PDF viewers, and renders as tofu where nothing covers it. `checkTypedGlyphs`
  (`tools/check-ownership.js`, via `build:check`) fails the build when a shape character appears in
  a deck we ship or in engine CSS `content:`. Exceed-only ratchet frozen at today's count; lower it
  as each surface converts.
- **The rule reads a curated deny list, not a ban on non-ASCII.** `lib/core/shape-glyphs.js` lists
  33 characters that are shapes wearing a character's clothes, and records beside them the
  punctuation that is deliberately absent — em-dash, en-dash, middle dot, curly quotes — because
  those are text doing text's job. `redline` legitimately renders `content: 'OLD — prior text'`.
- **Found in the audit:** seven sites typed `content: "\2713"` / `"\2717"` — including
  `themes/a11y-base.css` — re-implementing `--mark-check` and `--mark-x`, curated SVG masks that
  already existed. Those convert in the follow-up that adds the `--icon-*` set.
- `examples/speech-symbols.md` is exempt and says why: it types arrows as fixtures proving the
  read-aloud lexicon speaks them. The gate fails on a stale exemption, so the list cannot rot.
