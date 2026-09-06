- **`inline-code: literal` turns the inline pill and mark grammar off for a whole deck.**
  Every single-backtick span stays exactly as typed — `` `{STABLE}:c2` ``, `` `[x]` ``,
  all of it. The grammar reads every such span in every deck, so a deck written elsewhere
  whose prose happens to say `` `[x]` `` or `` `{LABEL}` `` now renders a disc or a pill
  where it rendered text; the per-occurrence backslash escape is the right tool for one
  span and the wrong one for ninety. Default is unchanged (`rich` — the grammar runs), so
  no existing deck moves a pixel.
- **It works on a raw Marp deck too, through Marp's own `class:` directive.** Lattice
  cannot read front matter on a preview it never rendered, so the CLASS is the contract
  rather than the register: `class: inline-code-literal` puts the token on every section
  by marp-core's own doing, verified against real marp-cli. Through the Lattice engine
  the register does it for you.
- **An unknown value keeps the grammar RUNNING, and says so.** `inline-code: off` — the
  value most authors will try first — is not a known value, so the deck keeps rendering
  pills and `lint:deck` warns with `unknown-inline-code` naming the two real values. The
  opposite mapping would let a typo silently change what a deck looks like.
- **A literal deck keeps a backslash you typed.** With no grammar running there is nothing
  to escape from, so `` `\[x]` `` renders as `\[x]` rather than being quietly rewritten.
- **In the Studio: Deck settings · General · Inline pills and marks.** Toggling it off
  writes `inline-code: literal`; toggling it back on removes the key rather than writing
  `rich`, so a deck that never opted out carries no trace of having been switched.
