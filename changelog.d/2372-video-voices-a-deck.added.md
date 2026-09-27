- **`lattice video deck.md` voices a deck itself.** The CLI now narrates a Markdown deck with
  Kokoro, the Studio's on-device voice, and captures it to an MP4 and a `.vtt`, so a video no longer
  needs a Studio export first. It speaks the narration the `--captions` sidecars carry, and each
  sentence is encoded exactly as the Studio's narrated export encodes it. kokoro-js is an optional install (`npm i --no-save kokoro-js@1.2.1
  @breezystack/lamejs@1.2.7`), and the command says so when it is missing. `--mode light|dark|system`
  picks the mode the deck is exported in.
- **`--narrate` and `--player-mode` for the self-contained player.** `lattice deck.md out.html
  --player --narrate` writes a narrated player voiced with Kokoro, and `--player-mode` opens the
  player in light, dark or system mode over the deck's own `color-mode:`.
