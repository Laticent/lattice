/**
 * Does a component package's sample slide (`gallery.md`) fetch anything from the network?
 * The CLI's half of the check; the Studio's is `docs/src/components/studio/library/gallery-gate.ts`,
 * and both read the rendered markup with the same `lib/core/remote-ref.js` `remoteRefsInHtml`.
 *
 * Insert makes a gallery the user's own deck content, so a remote image in it is a beacon in
 * every preview and every export (HARD RULE #22). The gallery is RENDERED through the engine
 * and the result read by `scanHtml`, the reader every preview and export already uses: that is
 * the markup a browser loads, after front matter (`logo:`), directives, component transforms
 * (`video`'s poster) and markdown-it's own reading of fences and references. Where the HTML
 * tree builder could read it differently, the gallery is refused (Segno R4, 2026-10-27 note).
 * `remote-ref.js`'s header says why a scan of the source was not enough.
 *
 * The engine loads on the first call: `lattice packages list` and a render that installs
 * nothing never pay for it.
 */

const { remoteRefsInHtml, mermaidRemoteRefs, fenceShapedMermaidBodies, frontMatterRemoteRefs, frontMatterOf, isRemoteUrl, galleryRefusal } = require('../core/remote-ref.js');

/**
 * Every Mermaid fence in a gallery, as the ENGINE parses it (lib/core/plugin-fences.mjs): the fences the export draws.
 * It never comes back unreadable: the reader is the engine's own parse, not a plugin that may be missing.
 */
const { fencesOfPlugin } = require('../core/plugin-fences.mjs');
const mermaidFencesOf = (md) => fencesOfPlugin('mermaid', md);

let engine = null;

/**
 * The remote fetch targets in a gallery, rendered. Unique, in document order.
 * @param {string} md
 * @returns {string[]}
 */
function galleryRemoteRefs(source) {
  // Line endings as the CLI reads a deck (lattice.js readFileOrDie): a CRLF fence
  // the fence walker would not match raw is still drawn once the deck is exported.
  const md = String(source || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!md.trim()) return [];
  if (!engine) engine = require('../engine/index.js').createEngine();
  const { html } = engine.render(String(md));
  // A reference definition renders nothing where it is written, yet resolves an image in the
  // deck the slide is inserted into (engine `referenceTargets`), so every one is read too.
  const defined = engine.referenceTargets(String(md)).filter(isRemoteUrl);
  // Every fence the CLI itself hands to Mermaid, read off the SOURCE, because one inside an
  // HTML block renders as plain text in the page yet is still drawn by the export.
  const found = mermaidFencesOf(String(md));
  // The engine's fences, and every fence-SHAPED block besides (an HTML block's, an unclosed one): a security gate
  // over-reports (lib/core/remote-ref.js `fenceShapedMermaidBodies`).
  const fenced = [...found.map((f) => f.body), ...fenceShapedMermaidBodies(md)].flatMap((b) => mermaidRemoteRefs(b));
  // Read it twice: alone, as the gate always did, and AS INSERTED. Insert splices the gallery
  // after a slide and a `---`, so its front matter stops being front matter and renders.
  const inserted = engine.render(`# x\n\n---\n\n${md.trim()}\n`).html;
  const fm = frontMatterOf(md);
  return [
    ...new Set([
      ...remoteRefsInHtml(html),
      ...remoteRefsInHtml(inserted),
      ...defined,
      ...fenced,
      ...(fm == null ? [] : frontMatterRemoteRefs(fm)),
    ]),
  ];
}

/**
 * The refusing finding for a gallery that fetches, in the shape `import-gate.js` reads, or
 * none. One finding, naming the first target: a package is refused whole either way.
 * @param {string} md
 * @returns {Array<{rule: string, message: string}>}
 */
function galleryFindings(md) {
  let refs;
  try {
    refs = galleryRemoteRefs(md);
  } catch (e) {
    // A sample slide the engine can't render can't be checked, so it can't be installed.
    return [{ rule: 'skeleton-remote', message: `its sample slide could not be checked (${e?.message ?? e}).` }];
  }
  return refs.length ? [{ rule: 'skeleton-remote', message: galleryRefusal(refs[0]) }] : [];
}

module.exports = { galleryRemoteRefs, galleryFindings };
