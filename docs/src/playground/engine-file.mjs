// The engine's entry file inside the versioned asset directory (`/playground/v/<hash>/`). The one
// spelling every page that names the engine and every loader that recognizes it share, so a page and
// the loaders cannot disagree about which engine the site serves (engineering/decisions/
// 2026-10-14-engine-spine.md). Plain, browser-safe ESM: asset-version.mjs (build time, Node) and
// engine-base.ts (browser) both import it.
export const ENGINE_FILE = 'esm/engine.js';
