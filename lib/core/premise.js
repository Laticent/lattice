/**
 * premise — sovereign framing-claim-beside-a-ledger split (lib/forms/frame/
 * premise/premise.manifest.json). A featured `<h2>` + lede paragraph on one
 * side, a vertically centered ledger of parallel rows on the other — no
 * colored panel divide (unlike split-panel), both zones share the page's own
 * background.
 *
 * The row-level markup (`<code>`/`<strong>`/`<span class="premise-desc">`/
 * `<em>` inside each `<li>`) is already produced at markdown-parse time by
 * the `premiseRows` plugin (lib/integrations/markdown-it/plugins.js) — this
 * kernel's only job is the section-level restructure: group the `<h2>` +
 * lede paragraph into one `.premise-claim` wrapper so the CSS can position
 * it as one flex zone opposite the `<ul>`.
 *
 * Sibling implementation: lib/transformers/premise.js (registry adapter).
 */

function applyPremiseClaim(innerHtml) {
  if (innerHtml.includes('class="premise-claim"')) return innerHtml; // idempotent
  const h2Match = innerHtml.match(/<h2[^>]*>[\s\S]*?<\/h2>/);
  if (!h2Match) return innerHtml;
  const afterH2 = innerHtml.slice(h2Match.index + h2Match[0].length);
  const pMatch = afterH2.match(/^\s*<p[^>]*>[\s\S]*?<\/p>/);
  if (!pMatch) return innerHtml;
  const claim = h2Match[0] + pMatch[0];
  const rest = afterH2.slice(pMatch[0].length);
  return innerHtml.slice(0, h2Match.index) + `<div class="premise-claim">${claim}</div>` + rest;
}

function transformPremiseSection(innerHtml) {
  return applyPremiseClaim(innerHtml);
}

const { mapSections } = require('./section-walk');

function applyToRenderedHtml(html) {
  return mapSections(html, (_openTag, cls, inner) => {
    const isPremise = cls.trim().split(/\s+/).includes('premise');
    return isPremise ? transformPremiseSection(inner) : null;
  });
}

module.exports = {
  applyToRenderedHtml,
  applyPremiseClaim,
  transformPremiseSection,
};
