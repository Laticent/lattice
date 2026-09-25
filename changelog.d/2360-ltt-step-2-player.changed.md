- **Breaking:** `assemblePlayer` (`lib/export/player-core.mjs`) takes `narration` as
  `{ slides, inputs, voice, captions }`, one entry per slide carrying the narration text, its
  Cadenza track and one clip per sentence. The old array of per-slide cue lists is refused with
  an error rather than exported silent. The Studio's webpage export is the only caller in this
  repository.
- **Changed: the LTT audio layer holds one clip per sentence** (`audio.clips[]`, each naming its
  cue), not one per slide, matching how every producer records and how the player advances.
- **Changed: the manifest's `readAlong` section is version 2.0.** It carries `timing`, which names
  the embedded LTT block, and a captions-only export now gets the section too.
