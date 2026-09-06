- **`inline-code: literal` turns the inline pill and mark grammar off for a whole deck.**
  Every single-backtick span stays exactly as typed — `` `{STABLE}:c2` ``, `` `[x]` ``,
  all of it. The grammar reads every such span in every deck, so a deck written elsewhere
  whose prose happens to say `` `[x]` `` or `` `{LABEL}` `` now renders a disc or a pill
  where it rendered text; the per-occurrence backslash escape is the right tool for one
  span and the wrong one for ninety. Default is unchanged (`rich` — the grammar runs), so
  no existing deck moves a pixel.
- **It works on a Marp-kit deck too, through Marp's own `class:` directive.** On a
  marp-core render the register cannot reach the runtime at all: marp-cli loads a deck over
  `file://`, where `fetch` is CORS-blocked outright, and over http(s) the answer arrives
  after the pills are drawn. So the CLASS is the contract that always lands:
  `class: inline-code-literal` puts the token on every section by marp-core's own doing,
  verified against real marp-cli. Through the Lattice engine, and in any export (which
  bakes its front matter), the register does it for you.
- **Known limit: a marp-core render carrying no baked front matter.** That is a
  hand-authored marp-kit deck (`marp --pdf`, `marp --html`, the VS Code preview) or an
  `.html` export predating the bake — the runtime is the only implementation, and it has to
  fetch the sibling `.md`, which either fails outright on `file://` or answers after the
  pills are drawn. `class: inline-code-literal` covers every one of those; re-exporting
  covers the old export. Making the runtime WAIT instead cost every other deck a full extra
  transform pass (1 to 3 on a 40-slide deck carrying no register at all) and needed a
  wall-clock guess that rendered wrong at 3.2s and again at 10.2s, so the limit is pinned
  rather than papered over.
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
  mechanism instead of three that can disagree. (The engine builds chrome eleven ruler
  rules before that class exists, so it reads the class first and re-derives the deck-level
  answer from the front matter when it is not there yet — a timing exception, same inputs
  and same answer. The runtime needs none: chrome lives inside the section.)
