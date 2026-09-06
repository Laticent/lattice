- **`inline-code: literal` turns the inline pill and mark grammar off for a whole deck.**
  Every single-backtick span stays exactly as typed — `` `{STABLE}:c2` ``, `` `[x]` ``,
  all of it. The grammar reads every such span in every deck, so a deck written elsewhere
  whose prose happens to say `` `[x]` `` or `` `{LABEL}` `` now renders a disc or a pill
  where it rendered text; the per-occurrence backslash escape is the right tool for one
  span and the wrong one for ninety. Default is unchanged (`rich` — the grammar runs), so
  no existing deck moves a pixel.
- **It works on a Marp-kit deck too, through Marp's own `class:` directive.** In the
  VS Code Marp preview the sandbox blocks the runtime from reading the deck's `.md`, so
  the CLASS is the contract that always works: `class: inline-code-literal` puts the token
  on every section by marp-core's own doing, verified against real marp-cli. Through the
  Lattice engine, and in any export (which bakes its front matter), the register does it
  for you.
- **Known limit: a pre-bake export served over http(s) draws first.** An `.html` sitting
  beside its `.md` with no baked front-matter block has to fetch that file, and the pills
  are drawn before the answer arrives. Re-export and the block is baked. Making the runtime
  wait instead cost every other deck a full extra transform pass (1 to 3 on a 40-slide deck
  carrying no register at all), so the limit is pinned rather than papered over.
- **An unknown value keeps the grammar RUNNING, and says so.** `inline-code: off` — the
  value most authors will try first — is not a known value, so the deck keeps rendering
  pills and `lint:deck` warns with `unknown-inline-code` naming the two real values. The
  opposite mapping would let a typo silently change what a deck looks like.
- **A literal deck keeps a backslash you typed.** With no grammar running there is nothing
  to escape from, so `` `\[x]` `` renders as `\[x]` rather than being quietly rewritten.
- **In the Studio: Deck settings · General · Inline pills and marks.** Toggling it off
  writes `inline-code: literal`; toggling it back on removes the key rather than writing
  `rich`, so a deck that never opted out carries no trace of having been switched.
- **It works per slide, and in the deck's own chrome.**
  `<!-- _class: inline-code-literal -->` turns the grammar off for one slide and composes
  with a component class; a literal deck's `header:` and `footer:` go literal with the
  body, which matters because those are the two directives a deck written elsewhere is
  most likely to carry. Both render paths gate on the resolved section class rather than
  on front matter, so the register, Marp's `class:` and a per-slide `_class:` are one
  mechanism instead of three that can disagree.
