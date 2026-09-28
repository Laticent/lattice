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
  fontSet.forEach((f) => {
    pending.push(f.load().catch(() => {}));
  });
  var ready = Promise.all(pending).then(() => fontSet.ready);
  var timeout = new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
  return Promise.race([ready, timeout]);
}

/**
 * The PREVIEW's settle: wait for the faces the document's LAID-OUT text uses, not every face
 * it declares. `settleFonts` force-loads all of them — the engine declares 17, and a plain deck
 * paints four — which in a live preview put Caveat, Shantell Sans and the italic cuts on the
 * wire for every visitor of every deck: measured on the Playground over slow 4G, ten unused
 * faces (~250KB) landing after the first slide and holding the app's own engine bundle back.
 *
 * A preview can do without them because it no longer has off-screen TEXT to measure: the
 * virtual filmstrip keeps unmounted slides as empty placeholders, so every face a laid-out
 * slide needs is pending once layout has run. The FLUSH is load-bearing (the trap
 * lib/core/preview-font-gate.mjs records): a face is fetched only when text using it is laid
 * out, so `ready` read before layout resolves at once with nothing requested. A face that a
 * slide mounted LATER needs arrives on its own; the runtime re-measures on the set's
 * `loadingdone` in a preview for exactly that case.
 *
 * Exports keep `settleFonts`: an exporter rasterizes slides no one has laid out yet.
 */
function settleLaidOutFonts(doc, fontSet, timeoutMs) {
  try { void doc.documentElement.offsetHeight; } catch (_e) { /* no layout — ready still bounds it */ }
  var timeout = new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
  return Promise.race([Promise.resolve(fontSet.ready), timeout]);
}

module.exports = { settleFonts, settleLaidOutFonts, SETTLE_FONTS_SRC: settleFonts.toString() };
