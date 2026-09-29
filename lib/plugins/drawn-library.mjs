/**
 * lib/plugins/drawn-library.mjs — the address of a runtime-drawn plugin's library (its declared
 * `payload`) on a host that serves the runtime: the payload file, one file name over from
 * `lattice-runtime.js` — where docs/scripts/sync-playground-assets.mjs stages it and where the
 * runtime's plugin host fetches it (lib/plugins/host-browser.mjs `ensureLibrary`). For a page that
 * needs the library OUTSIDE a preview frame (the Studio's diagram checker, its idle warm-up), so
 * no page threads a hand-named URL (the `drawnLibraryUrls` ratchet, tools/check-ownership.js).
 *
 * Its own module over its own tiny generated data (`drawn-library.generated.mjs`: plugin → file
 * name), apart from drawn.generated.mjs, whose full payload record would otherwise ride into the
 * Studio's startup JavaScript with the fence names the probes read (a bundler keeps a module whole
 * in one chunk; measured ~100 bytes gz). The frame builders import `drawnLibraryPreload` eagerly;
 * that costs the file names only.
 */
import { DRAWN_LIBRARY_FILES } from './drawn-library.generated.mjs';

/**
 * @param {string} runtimeUrl  the runtime's own URL (absolute or root-relative)
 * @param {string} plugin      a runtime-drawn plugin's name
 * @returns {string} '' when the plugin declares no payload or no runtime URL is known
 */
export function drawnLibraryUrl(runtimeUrl, plugin) {
  const file = Object.hasOwn(DRAWN_LIBRARY_FILES, plugin) ? DRAWN_LIBRARY_FILES[plugin] : '';
  if (!file || !runtimeUrl) return '';
  return String(runtimeUrl).replace(/[?#].*$/, '').replace(/[^/]*$/, file);
}

/**
 * Every runtime-drawn plugin's library address beside a runtime — for a warm-up that fetches them
 * all rather than naming one.
 * @param {string} runtimeUrl
 * @returns {string[]}
 */
export function drawnLibraryUrls(runtimeUrl) {
  return Object.keys(DRAWN_LIBRARY_FILES).map((plugin) => drawnLibraryUrl(runtimeUrl, plugin)).filter(Boolean);
}

/**
 * `<link rel="preload" as="script">` for every runtime-drawn library beside a runtime — for a
 * frame builder whose document holds a drawn fence. The runtime's plugin host inserts the library's
 * script only once it boots, after its own fetch and parse; the preload starts the (large) library
 * fetch with the document instead, so a cold first diagram does not pay for the two in series
 * (HARD RULE #25 inversion lens: +63 to +764 ms on a cold cache without it, measured in Chromium).
 * No `crossorigin`, matching the classic script the host inserts, so the preload is the one used.
 * @param {string} runtimeUrl
 * @returns {string} '' without a runtime URL
 */
export function drawnLibraryPreload(runtimeUrl) {
  return drawnLibraryUrls(runtimeUrl).map((u) => `<link rel="preload" as="script" href="${u.replace(/[&"<>]/g, (c) => `&#${c.charCodeAt(0)};`)}">`).join('');
}
