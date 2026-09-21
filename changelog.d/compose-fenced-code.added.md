- **Fenced code is first-class in Compose.** A fence now renders as a mono panel
  with its language on a chip, instead of inheriting the inline-code chip style —
  which fragmented into one bordered box per line, so a `mermaid` block read as a
  stack of boxes. Click the chip (or the picker in the slide toolbar) to change the
  language; a new toolbar door inserts a fence, tagged from the slide's own layout
  (`diagram` → mermaid, `code` → js) so it is never bare. Typing ` ``` ` does the
  same.
- **Syntax highlighting in Compose comes from the engine's own highlighter**, so a
  fence's colors in the editor are its colors on the slide — including Lattice's own
  mermaid and shell grammars, and including the rendered deck's deliberate choice
  *not* to color an engine sub-language.
- **The language picker offers every grammar the renderer carries** — all 192, the
  three Lattice fence languages first, then the ones this deck already uses — and
  coaches rather than refuses: it names the `shell`-versus-`bash` mix-up that
  silently kills highlighting, and says when a tag has no grammar at all.
- **Fixed: `Tab` inside a fence moved focus out of the editor.** It now indents (and
  `Shift-Tab` outdents). `Enter` on a blank last line leaves the fence, which is the
  only exit reachable from a phone — previously it was `Mod-Enter` or nothing.
