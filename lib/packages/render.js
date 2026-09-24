/**
 * What the CLI's render path adds to a deck from the package store
 * (engineering/decisions/2026-09-23-portable-packages.md §6). Pure, so it is testable without
 * a browser; `lattice-emulator.js` reads the store and calls it.
 */

const { referencedComponents, embedComponentsInMarkdown, embeddedComponentNames } = require('../layout/bridge.js');

/**
 * Embed the CSS of every installed component the deck uses, the way the Studio's Markdown
 * export does. A component the deck ALREADY embeds keeps the deck's copy: the deck is
 * self-contained on purpose, and the store only fills what it lacks. A shipped name is
 * never looked up in the store (a store folder can't shadow a shipped component).
 *
 * @param {string} source  deck markdown
 * @param {Array<{name: string, css: string}>} installed  installed components
 * @param {Iterable<string>} shippedNames
 * @returns {{ source: string, used: string[] }}
 */
function embedInstalledComponents(source, installed, shippedNames) {
  const shipped = new Set(shippedNames);
  const carried = new Set(embeddedComponentNames(source));
  const byName = new Map(installed.filter((c) => !shipped.has(c.name) && !carried.has(c.name)).map((c) => [c.name, c]));
  const used = byName.size ? referencedComponents(source, byName.keys()) : [];
  if (!used.length) return { source, used };
  return { source: embedComponentsInMarkdown(source, used.map((n) => byName.get(n)), { keepExisting: true }), used };
}

/** Every class token a deck's class directives name, unique, in order (front matter first). */
function classTokens(source) {
  const src = String(source || '');
  const out = new Set();
  const add = (raw) => {
    for (const t of String(raw || '').trim().split(/\s+/)) if (t) out.add(t);
  };
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src);
  if (fm) {
    const m = /^[ \t]*class[ \t]*:[ \t]*(.+?)[ \t]*$/im.exec(fm[1]);
    if (m) add(m[1]);
  }
  for (const d of src.matchAll(/<!--\s*_?class\s*:\s*([^>]*?)\s*-->/g)) add(d[1]);
  return [...out];
}

module.exports = { embedInstalledComponents, classTokens };
