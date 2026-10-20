/**
 * lib/plugins/draw-shims.mjs — the stand-ins a page installs for the libraries its embedding page draws for it.
 *
 * A preview frame whose parent offers a draw host (docs/src/lib/preview-draw-host.ts) loads no figure library. For a
 * plugin whose figures the runtime draws itself (`render.exec.hydrate: "runtime"`), the plugin supplies an object with the
 * library's global's shape that sends the work to the host; the plugin host installs it where the library would have
 * landed (`host-browser.mjs` `ensureLibrary`). The runtime asks this file by plugin name, so it names no plugin itself.
 */
import { createMermaidShim } from './mermaid/shared/draw-shim.mjs';

const SHIMS = { mermaid: createMermaidShim };

/** The stand-in for a plugin's library global, or null when the plugin has none (it then loads its library as always). */
export function drawShimFor(name, host, doc) {
  return Object.hasOwn(SHIMS, name) ? SHIMS[name](host, doc) : null;
}
