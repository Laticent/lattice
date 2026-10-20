studio: +260
playground: +50
Narration clips for members off the call add the clip request and answer to the Live controller, the room voice to `read-aloud.ts`, and the Present overlay's listen and serve effects, all on the Studio's eager side (StudioIsland +205 B gz). The playground's +43 B is `mode-catalog` (+42 B), which carries `voice-model.js`'s new `peekClip`. The mp3 encoder stays lazy: the overlay loads `narration-bake` only when a presenter serves a clip. CI measured studio +247 and playground +43 against main; the declared figures leave room for gzip spread.
