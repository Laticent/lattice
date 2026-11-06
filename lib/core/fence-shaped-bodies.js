/**
 * lib/core/fence-shaped-bodies.js
 *
 * A SECURITY reader for the two gallery gates only (lib/cli/gallery-gate.js and the Studio's
 * docs/src/components/studio/library/gallery-gate.ts). It lives in its own CommonJS leaf, not in
 * remote-ref.js, because remote-ref.js rides in every route's eager bundle and a CommonJS module
 * cannot tree-shake: the Studio's gate loads this by `import()`, so no eager bundle carries it.
 */

/**
 * The body of every MERMAID-FENCE-SHAPED block in a deck's source, wherever it sits: behind any quote or list prefix,
 * inside an HTML block, unclosed (to the end of the source). For a SECURITY gate only (the gallery gates), which reads
 * these IN ADDITION to the fences the engine parses (lib/core/plugin-fences.mjs). Since D2 slice 3 nothing draws a fence
 * the engine does not parse as one, so a URL in such a block is never fetched; the gate reports it anyway, because a
 * false alarm is the safe direction and a gallery is not admitted on a reader's word that a block is inert.
 * @param {string} md
 * @returns {string[]}
 */
function fenceShapedMermaidBodies(md) {
  // Any line ending: split on it, the text itself left as it is.
  const lines = String(md ?? '').split(/\r\n|\r|\n/);
  const PREFIX = /^[ \t>]*(?:(?:[-*+]|\d{1,9}[.)])[ \t>]+)*/;
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const rest = lines[i].replace(PREFIX, '');
    const open = /^(`{3,}|~{3,})\s*mermaid/.exec(rest);
    if (!open) continue;
    const body = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const r = lines[j].replace(/^[ \t>]*/, '');
      if (r.startsWith(open[1][0].repeat(open[1].length)) && /^(`+|~+)\s*$/.test(r)) break;
      body.push(lines[j]);
    }
    out.push(body.join('\n'));
    i = j;
  }
  return out;
}

module.exports = { fenceShapedMermaidBodies };
