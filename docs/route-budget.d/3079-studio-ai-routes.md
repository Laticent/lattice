studio: +595
The Studio's eager key store and voice catalog grew: `openrouter-key.js` now proves "no sealing key"
with a `count` before it ever removes a stored key, and logs one `[lattice-key]` line on each
removing path, and names a sign-in's key in its mint record by a one-way hash instead of the key's
last four characters (3079-p2, which also clears CodeQL's clear-text-storage alert); and `tts-voice-catalog.ts` keeps a caller's voice groups for the Gemini
language filter (3079-p3). Vite regrouped both into the `model-selection` chunk, so the per-chunk
lines move (+4688 there, -2365 and -1620 from the two modules' old chunks); the net is +595. The
model config itself stays off the eager path (it ships in the lazy provider-registry and tts-cost
chunks).
