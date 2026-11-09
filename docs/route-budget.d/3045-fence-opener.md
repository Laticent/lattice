studio: +338
The Studio now ships lib/core/fence-opener.js, the linear fence-line reader that replaced the
quadratic `(`{3,}|~{3,})(.*)$` regex in plugin-fences.mjs and slide-speech.js (HARD RULE #32,
the regex census), plus the bundler's CommonJS interop for it: plugin-admission +279,
tts-voice-catalog +41, StudioIsland +18 gzip bytes, as CI measured them. Nothing was given
back; the fix replaces one regex literal per caller with a shared 40-line reader.
