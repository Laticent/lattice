/**
 * Workbench component bridge — the pure core that carries a CSS-only local
 * component from the Workbench library into a deck (live render) and out of the
 * browser (`.md` export), across all three engine paths. The Form-layer sibling
 * of the themes export bridge (drawing-board-export.js `embedThemeInMarkdown`).
 * Pure, `fs`-free, dependency-free, so it bundles into the browser core AND
 * unit-tests in Node with no fixtures.
 *
 * See engineering/decisions/2026-06-12-workbench-component-bridge.md. The three
 * pieces, and why each exists:
 *
 *   referencedComponents(source, names)
 *     A component is opted into by a slide `_class:` (or deck `class:`), NOT by a
 *     front-matter directive like a theme — so "which components does this deck
 *     use?" must be DETECTED, not read. This scan is the single source that feeds
 *     both live injection and export, so they cannot drift.
 *
 *   embedComponentsInMarkdown(source, components)
 *     A component is plain `.<name>`-scoped CSS, not a marp `@theme`, so it can't
 *     ride `themeSet`/`addThemes` the way a theme does. Instead its CSS is
 *     embedded as a Marp global `<style>` block (which Marpit hoists into the
 *     packed CSS) — the SAME call runs before the live render AND on export, so
 *     the deck that renders live is the deck that exports (parity by construction,
 *     CLAUDE.md "three render paths must agree"). Idempotent: it strips any
 *     previously-embedded component blocks first, so a re-import → re-export round
 *     trip never double-defines a class.
 *
 *   collidesWithShipped(name, shippedNames)
 *     The Layout Studio blocks a local name that collides with a shipped
 *     component class at save time, so the bridge stays collision-free by
 *     construction (no shadowing, no double-defined selector on export).
 */

// Front-matter detector, shared shape with embedThemeInMarkdown: a leading
// `---\n … \n---` block. Used to place embedded <style> AFTER the front matter.
const FRONT_MATTER_RE = /^(---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$))/;

// A Marp class directive — slide-scoped `<!-- _class: a b -->` or deck-wide
// `<!-- class: a b -->` (and the rare `<!-- _class:a -->` with no space). The
// value is a space-separated list of a component name plus modifiers.
const CLASS_DIRECTIVE_RE = /<!--\s*_?class\s*:\s*([^>]*?)\s*-->/g;
// Front-matter `class:` line (deck-wide default class).
const FM_CLASS_RE = /^[ \t]*class[ \t]*:[ \t]*(.+?)[ \t]*$/im;

/**
 * The library component names a deck actually references, in first-appearance
 * order (deterministic — drives both live injection and the export embed).
 *
 * @param {string} source   deck markdown
 * @param {Iterable<string>} names  the library's component names
 * @returns {string[]}  referenced names, unique, first-appearance order
 */
function referencedComponents(source, names) {
  const src = String(source || '');
  const lib = new Set(names || []);
  if (!lib.size) return [];

  const seen = new Set();
  const out = [];
  const consider = (raw) => {
    for (const tok of String(raw || '').trim().split(/\s+/)) {
      if (lib.has(tok) && !seen.has(tok)) {
        seen.add(tok);
        out.push(tok);
      }
    }
  };

  // Front-matter `class:` (deck-wide), then every class directive in body order.
  const fm = FRONT_MATTER_RE.exec(src);
  if (fm) {
    const m = FM_CLASS_RE.exec(fm[0]);
    if (m) consider(m[1]);
  }
  CLASS_DIRECTIVE_RE.lastIndex = 0;
  let d;
  while ((d = CLASS_DIRECTIVE_RE.exec(src)) !== null) consider(d[1]);
  return out;
}

// Identify-and-strip marker: the first comment line of every embedded component
// block. Stable so a re-export can remove the old blocks before writing fresh
// ones (idempotent round-trip). Distinct from the theme block's "embedded theme"
// marker, so the two never strip each other.
const COMPONENT_BLOCK_MARK = 'Lattice Workbench — embedded component';
const EMBEDDED_BLOCK_RE = new RegExp(
  `<style>\\s*\\n?/\\* ${COMPONENT_BLOCK_MARK} [\\s\\S]*?<\\/style>\\n*`,
  'g',
);

/** Remove any previously-embedded component <style> blocks (idempotency). */
function stripEmbeddedComponents(source) {
  return String(source || '').replace(EMBEDDED_BLOCK_RE, '');
}

// #22 stylesheet channel — a library component's CSS is model-authored by construction
// (the AI component generator; 2026-06-29-component-transformer-threat-model.md), and this
// splices it into a `<style>` in the markdown handed to a RECIPIENT. A `</style>` in it ends
// the element on their machine and the remainder is parsed as markup. The whole element BODY
// is guarded, not just `css`, because `name` rides in the comment header and is free text too.
// Same shape as `share-export.ts`'s finish block and `deck-export.js`'s theme block.
const { sanitizeStyleText } = require('../core/sanitize-style-text.mjs');

function componentBlock(name, css) {
  return (
    '<style>\n' +
    sanitizeStyleText(
      `/* ${COMPONENT_BLOCK_MARK} "${String(name || 'component')}" (self-contained:\n` +
        '   this deck keeps the layout even where the component is not installed).\n' +
        '   Palette-blind — every colour is a token. Generated on export. */\n' +
        String(css || '').trim(),
    ) +
    '\n</style>\n'
  );
}

/**
 * Embed each component's CSS as a Marp global `<style>` block, placed just after
 * the front matter (or at the top). Idempotent — strips prior embedded component
 * blocks first. Blocks are emitted sorted by name for stable, diff-friendly
 * output. The SAME call runs in the live path and on export.
 *
 * @param {string} source  deck markdown
 * @param {Array<{name:string, css:string}>} components
 * @returns {string}
 */
function embedComponentsInMarkdown(source, components) {
  const src = stripEmbeddedComponents(source);
  const list = (components || []).filter((c) => c?.css);
  if (!list.length) return src;

  const blocks = list
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map((c) => componentBlock(c.name, c.css))
    .join('\n');

  const fm = FRONT_MATTER_RE.exec(src);
  if (fm) return src.slice(0, fm[0].length) + '\n' + blocks + '\n' + src.slice(fm[0].length);
  return blocks + '\n' + src;
}

/**
 * True when a proposed local component name collides with a shipped component
 * class — the Layout Studio blocks this at save time so the bridge never
 * shadows or double-defines a selector.
 */
function collidesWithShipped(name, shippedNames) {
  return new Set(shippedNames || []).has(String(name || '').trim());
}

module.exports = {
  referencedComponents,
  embedComponentsInMarkdown,
  stripEmbeddedComponents,
  collidesWithShipped,
};
