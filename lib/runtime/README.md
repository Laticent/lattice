# lib/runtime — the VS Code preview runtime

`index.js` is the esbuild entry for `dist/lattice-runtime.js` — the third
render path. It upgrades Marp-preview DOM in place: applies the shared
transformer registry (`applyAllToDom`), adaptive families, resolvers, and
the overflow probe after DOMContentLoaded.

**Gotcha:** everything this file transitively `require`s ships to the
browser — it must all be pure/fs-free. Each transform here has a string
sibling (`applyToHtml`) used by the engine/emulator; the DOM and string
versions must stay in lockstep or the preview diverges from the PDF.
