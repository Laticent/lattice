# lib/fonts — the self-hosted font manifest

`text-faces.js` (`TEXT_FACES`, `faceKey`) is the single manifest every
font surface reads, so the library ships its own type with zero network
fetches.

The chain: woff2 sources live in `assets/fonts/` → `tools/build-css.js`
emits `@font-face` and copies them to `dist/fonts/` → the emulator
base64-inlines them into PDFs. `npm run fonts:check` fails if any link in
that chain disagrees with the manifest (or a Google-Fonts CDN URL sneaks
in).

**To add a face:** drop the woff2 in `assets/fonts/`, add a row here, run
`npm run build`. The parity gate walks you through what's missing.
