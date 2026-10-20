/**
 * Inline-run transformer — keeps a list item's label and the pills, checks and bold spans inside it
 * as ONE flex item, for the components whose items are flex or grid containers.
 *
 * A thin registry adapter: the rule and both substrates live in lib/core/inline-run.js (HARD RULE #1);
 * which components it serves comes from the `inlineRun` field of their manifests, baked into
 * lib/core/inline-run-catalog.generated.js, so this file holds no list of component names.
 */

const { mapSectionHtml } = require('../core/section-walk');
const { wrapHtml, wrapDom } = require('../core/inline-run');

const CATALOG = require('../core/inline-run-catalog.generated.js');

const SERVED = Object.keys(CATALOG);

/** The served component named in a section's resolved class list, or null. */
function componentOf(sectionHtml) {
  const m = /<section\b[^>]*\sclass="([^"]*)"/.exec(sectionHtml);
  if (!m) return null;
  const tokens = m[1].split(/\s+/);
  return SERVED.find((name) => tokens.includes(name)) || null;
}

function applyToHtml(html) {
  if (!SERVED.length || typeof html !== 'string' || !html.includes('<li')) return html;
  return mapSectionHtml(html, (section) => {
    const component = componentOf(section);
    if (!component) return section;
    return wrapHtml(section, CATALOG[component].depths, CATALOG[component].slots);
  });
}

function applyToDom(root) {
  if (!SERVED.length || !root || typeof root.querySelectorAll !== 'function') return;
  for (const section of root.querySelectorAll(module.exports.selector)) {
    // The same choice the HTML path makes: the first served name in catalog order, once. A section
    // that carries two (`cards-grid list`) must not be wrapped under each.
    const component = SERVED.find((name) => section.classList.contains(name));
    if (component) wrapDom(section, CATALOG[component].depths, CATALOG[component].slots);
  }
}

module.exports = {
  name: 'inline-run',
  selector: SERVED.map((n) => `section.${n}`).join(', '),
  applyToHtml,
  applyToDom,
};
