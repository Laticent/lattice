- **Narrated exports: captions no longer run ahead of an on-device voice.** The Studio's bake
  now measures each clip's own silence before its first word and records it in the clip's
  `leadMs`, beside the MP3 encoder's delay, so the exported player starts the clip at the
  first word and times the caption crawl from there. Kokoro puts 290–390 ms of silence before
  every sentence, so each caption used to light about 0.3 s before the voice spoke it. Gemini's
  clips, which also pass through the bake's encoder, are trimmed the same way.
  Because the player now skips that silence, the pause between two sentences is about 0.3 s
  shorter than before, and a Kokoro-narrated deck plays about 19 s shorter over 62 sentences.
  Present in the Studio still plays each clip from its start, so it keeps the longer pause.
