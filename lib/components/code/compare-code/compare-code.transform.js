/**
 * compare-code transform — pair each `<p><code>label</code></p>` + `<pre>` into
 * a `.code-col`, grouped inside `.code-cols`, after the eyebrow + heading:
 *
 *   {eyebrow p>code} {h2}
 *   <div class="code-cols">
 *     <div class="code-col"><p><code>Before…</code></p><pre>…</pre></div>
 *     <div class="code-col"><p><code>After…</code></p><pre>…</pre></div>
 *   </div>
 *
 * The eyebrow is the leading `<p><code>` before the `<h2>`; each column label is
 * a `<p><code>` after it. Was bespoke to lattice-emulator.js parseSlide; migrated
 * to the shared registry so marp-cli + the runtime produce it too (they rendered
 * the flat `<p><code>`/`<pre>` sequence before).
 * See engineering/decisions/2026-06-11-emulator-on-engine-p2.md.
 *
 * Sibling implementations via lib/transformers/compare-code.js:
 *   - lattice-emulator.js (via lib/engine) → applyToHtml
 *                            (full Marpit HTML; depth-aware section walk via
 *                            the shared lib/core/section-walk mapSections)
 *   - lattice-runtime.js  → applyToDom (live DOM)
 *
 * Idempotent: guarded on the `.code-cols` marker.
 */

const { mapSections } = require('../../../core/section-walk');

function transformCompareCodeSection(innerHtml, cls) {
  if (typeof innerHtml !== 'string' || !/\bcompare-code\b/.test(cls || '')) return innerHtml;
  if (innerHtml.indexOf('class="code-cols"') !== -1) return innerHtml; // idempotent

  // Preserve a leading <header> / trailing <footer> — present on the full-section
  // (marp / engine) input; the extraction is a no-op when neither is there.
  const headerMatch = innerHtml.match(/^\s*<header[\s\S]*?<\/header>/);
  const footerMatch = innerHtml.match(/<footer[\s\S]*?<\/footer>\s*$/);
  const header = headerMatch ? headerMatch[0] : '';
  const footer = footerMatch ? footerMatch[0] : '';
  let body = innerHtml;
  if (header) body = body.slice(header.length);
  if (footer) body = body.slice(0, body.length - footer.length);

  // Eyebrow = a leading p>code (before the h2); heading = the first h2. The tag
  // matchers are attribute-tolerant: marp-core stamps `id` on headings
  // (`<h2 id="…">`) while lib/engine emits a bare `<h2>` — both must strip the
  // heading out of the columns, or it gets swept into the first one (engine↔marp
  // parity). The captures stay byte-identical on the engine's attribute-free tags.
  const eyeMatch = body.match(/^\s*(<p\b[^>]*><code\b[^>]*>[\s\S]*?<\/code><\/p>)/);
  const h2Match = body.match(/(<h2\b[^>]*>[\s\S]*?<\/h2>)/);
  const eyeEl = eyeMatch ? eyeMatch[1] : '';
  const h2El = h2Match ? h2Match[1] : '';
  let rest = body;
  if (eyeEl) rest = rest.replace(eyeEl, '');
  if (h2El) rest = rest.replace(h2El, '');

  // Each remaining p>code starts a column; split on its boundary.
  const parts = rest.split(/(?=<p\b[^>]*><code\b)/).filter((s) => s.trim());
  if (parts.length === 0) return innerHtml;
  const cols = parts.map((p) => `<div class="code-col">${p.trim()}</div>`).join('');
  return `${header}${eyeEl}${h2El}<div class="code-cols">${cols}</div>${footer}`;
}

// Depth-aware <section> walk via the shared mapSections kernel (masthead,
// split-panels follow the same precedent). The indexOf('compare-code') guard
// stays as a cheap whole-document pre-check so a deck with no compare-code
// slide skips the walk entirely.
function applyToRenderedHtml(html) {
  if (typeof html !== 'string' || html.indexOf('compare-code') === -1) return html;
  return mapSections(html, (_openTag, cls, inner) => {
    const result = transformCompareCodeSection(inner, cls);
    return result === inner ? null : result;
  });
}

module.exports = { transformCompareCodeSection, applyToRenderedHtml };
