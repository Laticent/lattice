/**
 * gallery-elements.js — the gallery gate's own markup reader as it was at 96f3c3a, the last commit before
 * Segno R4 moved the gate onto `remote-ref.js` `remoteRefsInHtml`: the rendered gallery parsed with parse5
 * (scripting off) and every element walked into the shape `remoteRefsInElements` reads.
 *
 * It is the ORACLE for test/unit/core/gallery-html-differential.test.js: wherever this reader finds a
 * remote reference, the new one must refuse too. Nothing in lib/ may read it. Do not fix bugs here: a fix
 * would change what the differential measures. Delete it when nobody reads it.
 */

const { remoteRefsInElements } = require('../../lib/core/remote-ref.js');

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
        text: child.tagName === 'style' || child.tagName === 'script' || /mermaid/i.test(child.attrs.find((a) => a.name === 'class')?.value || '') ? textOf(child) : '',
      };
      yield* elements(child.content || child);
    }
  }
}

/** The remote references the old gate found in one rendered page. */
function legacyRemoteRefsInHtml(html) {
  if (!parse5) parse5 = require('parse5');
  return remoteRefsInElements(elements(parse5.parse(String(html ?? ''), { scriptingEnabled: false })));
}

module.exports = { legacyRemoteRefsInHtml };
