// The route glob that matches the engine a page loads. Built from the SAME constant every page names
// the engine with (src/playground/engine-file.mjs), so renaming the engine moves these holds with it.
// A hard-coded file name went stale once already: when the docs site moved from the single-file
// `lattice-playground.js` to the ESM engine, fourteen `page.route` holds would have matched nothing and
// stayed green while holding nothing back (engineering/decisions/2026-10-14-engine-spine.md).
import { ENGINE_FILE } from '../src/playground/engine-file.mjs';

export const ENGINE_GLOB = `**/${ENGINE_FILE}`;
