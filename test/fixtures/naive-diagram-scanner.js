/**
 * A deliberately NAIVE web-reference scanner, for the failing arm of tools/fuzz-mermaid-refs.mjs
 * (`--scanner-file test/fixtures/naive-diagram-scanner.js`). It is lib/core/remote-ref.js with one
 * change: a diagram is held back only when its text names the address the plain way
 * (`http://127.0.0.1…`), as a first-draft regex would read it. A fuzz that passes this scanner has
 * not exercised the spellings (entity codes, Mermaid's `#58;`, a dropped tab, capitals, `//host`)
 * the real one decodes. Never used outside that arm.
 */
const real = require('../../lib/core/remote-ref.js');

function blockWebImages(html, allowed, opts) {
  const r = real.blockWebImages(html, allowed, opts);
  const blocked = r.blocked.filter((b) => b.kind !== 'diagram');
  // every code block, diagram or not: the naivety under test is the address regex, not the fence match
  const fences = String(html).match(/<code[\s\S]*?<\/code>/g) || [];
  for (const f of fences) {
    const m = /https?:\/\/127\.0\.0\.1[^\s"'<)]*/.exec(f.replace(/<[^>]+>/g, ''));
    if (m) blocked.push({ url: m[0], origin: 'naive', kind: 'diagram' });
  }
  return { ...r, blocked };
}

module.exports = { ...real, blockWebImages };
