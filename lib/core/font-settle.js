/**
 * Force every font in a FontFaceSet (document.fonts) to load, then wait for
 * completion — or give up after `timeoutMs`, whichever comes first. A
 * caller's first real overflow measurement must never be measured against
 * fallback-font metrics (a font a not-yet-painted slide needs can still be
 * un-fetched even after document.fonts.ready resolves "loaded" for
 * whatever's already on screen — Marp's template lazy-loads per slide), but
 * a hung font fetch (dead CDN, a blocked request) must also never suppress
 * that measurement FOREVER.
 *
 * document.fonts is ITERABLE (`.forEach`/`.size`) but NOT array-like (no
 * `.length`) — `Array.prototype.map.call(document.fonts, ...)` silently
 * loops zero times and returns `[]` with no error, never actually calling
 * `.load()` on anything. That exact bug shipped once (a maker-checker
 * finding, 2026-07-11) because the logic lived duplicated, un-tested, in
 * two places. `forEach` is spec-standard on `FontFaceSet` and needs no
 * array coercion.
 *
 * Pure and self-contained (no closure over outer scope) so `.toString()`
 * can inject its literal source into `lattice-emulator.js`'s exported
 * `.html` sidecar (mirrors `overflow-probe.js`'s `PROBE_SRC` pattern) — one
 * source of truth (HARD RULE #1), shared with `lib/runtime/index.js` via a
 * normal `require`.
 *
 * engineering/decisions/2026-07-10-overflow-cause-highlighting.md §14.
 */
function settleFonts(fontSet, timeoutMs) {
  var pending = [];
  fontSet.forEach(function (f) {
    pending.push(f.load().catch(function () {}));
  });
  var ready = Promise.all(pending).then(function () {
    return fontSet.ready;
  });
  var timeout = new Promise(function (resolve) {
    setTimeout(resolve, timeoutMs);
  });
  return Promise.race([ready, timeout]);
}

module.exports = { settleFonts, SETTLE_FONTS_SRC: settleFonts.toString() };
