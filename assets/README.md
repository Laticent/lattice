# assets/ — source static assets

Source files vended into the build, currently self-hosted fonts:

- `fonts/` — the woff2 sources (see `fonts/README.md` there) that
  `tools/build-css.js` copies into `dist/fonts/`. The manifest that keeps
  every font surface honest is `lib/fonts/text-faces.js`, gated by
  `npm run fonts:check`.

This folder ships in git but NOT in the npm tarball — consumers get fonts
from `dist/fonts/`.
