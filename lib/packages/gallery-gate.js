/**
 * Does a component package's sample slide (`gallery.md`) fetch anything from the network?
 * The CLI's half of the check; the Studio's is `docs/src/components/studio/library/gallery-gate.ts`,
 * and both hand the parsed elements to the same `lib/core/remote-ref.js` scan.
 *
 * Insert makes a gallery the user's own deck content, so a remote image in it is a beacon in
 * every preview and every export (HARD RULE #22). The gallery is RENDERED through the engine
 * and the result parsed with parse5, the HTML5-spec parser: that is the markup a browser
 * loads, after front matter (`logo:`), directives, component transforms (`video`'s poster),
 * markdown-it's own reading of fences and references, and the HTML parser's reading of raw
 * tags. `remote-ref.js`'s header says why a scan of the source was not enough.
 *
 * The engine and parse5 load on the first call: `lattice packages list` and a render that
 * installs nothing never pay for them.
 */

const { remoteRefsInElements, isRemoteUrl, galleryRefusal } = require('../core/remote-ref.js');

let engine = null;
let parse5 = null;

/** A parse5 node's text content. */
function textOf(node) {
  return (node.childNodes || []).map((c) => (c.nodeName === '#text' ? c.value : textOf(c))).join('');
}

/** Every element under a parse5 node, in the shape remote-ref.js reads. */
function* elements(node) {
  for (const child of node.childNodes || []) {
    if (child.tagName) {
      yield {
        tag: child.tagName.toLowerCase(),
        attrs: child.attrs.map((a) => [(a.prefix ? `${a.prefix}:${a.name}` : a.name).toLowerCase(), a.value]),
        text: child.tagName === 'style' || /mermaid/.test(child.attrs.find((a) => a.name === 'class')?.value || '') ? textOf(child) : '',
      };
      yield* elements(child.content || child);
    }
  }
}

/**
 * The remote fetch targets in a gallery, rendered. Unique, in document order.
 * @param {string} md
 * @returns {string[]}
 */
function galleryRemoteRefs(md) {
  if (!String(md || '').trim()) return [];
  if (!engine) engine = require('../engine/index.js').createEngine();
  // parse5 8 is an ES module; `require` of one works from Node 22.12, the package's floor.
  if (!parse5) parse5 = require('parse5');
  const { html } = engine.render(String(md));
  // A reference definition renders nothing where it is written, yet resolves an image in the
  // deck the slide is inserted into (engine `referenceTargets`), so every one is read too.
  const defined = engine.referenceTargets(String(md)).filter(isRemoteUrl);
  // Scripting OFF, as the Studio's DOMParser reads it, so a `<noscript>` body is markup to
  // both doors rather than text to one of them.
  return [...new Set([...remoteRefsInElements(elements(parse5.parse(html, { scriptingEnabled: false }))), ...defined])];
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
