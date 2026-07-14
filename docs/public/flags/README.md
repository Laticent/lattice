# Country flags (vendored)

SVG country flags from [flag-icons](https://github.com/lipis/flag-icons) v7.5.0 by
Panayiotis Lipiridis, MIT-licensed (see `LICENSE`). 4×3 aspect, filenames are ISO
3166-1 alpha-2 codes (lowercase, e.g. `us.svg`).

Served statically at `/flags/<cc>.svg` and referenced by `FlagMark` in
`docs/src/components/studio/TtsSettings.tsx` — a flag is only fetched by a browser
when a voice row that uses that country actually renders; the rest are inert.
The voice picker maps ~12 countries today (`voiceMeta` in `tts-voice-catalog.ts`);
the full set is vendored so a new engine/locale needs no new asset.
