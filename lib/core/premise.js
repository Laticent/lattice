/**
 * premise — sovereign framing-claim-beside-a-ledger split (lib/forms/frame/
 * premise/premise.manifest.json). A featured `<h2>` + lede paragraph on one
 * side, a vertically centered ledger of parallel rows on the other — no
 * colored panel divide (unlike split-panel), both zones share the page's own
 * background.
 *
 * Rows are an ordinary ORDERED list (`1. Term` + two nested items); the
 * ordinal is a CSS counter and the term is lifted to `<strong>` by the shared
 * slotLabelLift, so no premise-only markdown plugin is needed. This kernel's
 * only job is the section-level restructure: group the `<h2>` + lede paragraph
 * into one `.premise-claim` wrapper so the CSS can position it as one flex
 * zone opposite the ledger.
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

/**
 * Live-DOM mirror of the same restructure, for the lattice-runtime bundle (the
 * exported-HTML route, where marp-core renders the markdown and never runs our
 * markdown-it plugins). Same grouping, same idempotence guard, and the registry
 * runs it at the same position as the HTML adapter — so the two paths agree.
 *
 * Without this the ledger and the claim compete for the same flex zone: the
 * `<h2>` + lede stay loose children beside the `<ol>`, the ledger collapses to a
 * bare column of ordinals with its row text unreachable, and the slide trips the
 * overflow probe. Built as a real node move rather than an innerHTML rewrite so
 * it can't discard sibling state (rendered Mermaid SVGs, chart frames) on the
 * re-runs a live preview triggers.
 */
function applyToDom(root) {
  const doc = root?.ownerDocument ? root.ownerDocument : root;
  const scope = root && typeof root.querySelectorAll === 'function' ? root : doc;
  if (!scope || typeof scope.querySelectorAll !== 'function') return;
  for (const section of scope.querySelectorAll('section.premise')) {
    if (section.querySelector(':scope > .premise-claim')) continue; // idempotent
    const h2 = section.querySelector(':scope > h2');
    const lede = h2?.nextElementSibling;
    if (!h2 || !lede || lede.tagName !== 'P') continue;
    const claim = doc.createElement('div');
    claim.className = 'premise-claim';
    section.insertBefore(claim, h2);
    claim.append(h2, lede);
  }
}

module.exports = {
  applyToRenderedHtml,
  applyToDom,
  applyPremiseClaim,
  transformPremiseSection,
};
