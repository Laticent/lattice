/**
 * lib/core/settings-block.js — READING an exported bundle's settings block, and merging it with the
 * front matter above it. The runtime, the fold (settings-block-fold.js) and the exporter
 * (lib/export/bundle-front-matter.js) share it; it is the part the runtime boot bundle needs.
 */
/* ─────────────────────────────────────────────────────────────────────────────
 * THE SETTINGS BLOCK — one home for each deck-wide key in an exported Marp bundle.
 *
 * The baked copy above made the bundle's front matter live in TWO places: the YAML
 * at the top, which Marp reads, and a copy in the trailer, which the runtime read.
 * Editing the top and rendering again gave the export's answer for every key Marp
 * does not read, and half an answer for `class:` (Marp applies it only to slides
 * with no `_class` of their own). The marp-cli engine can read the live top, but
 * Marp for VS Code runs none of our code, its preview can read the deck only as last
 * SAVED, and its "Export Slide Deck…" cannot read it at all — measured in VS Code
 * 1.144.1 / Marp for VS Code 3.6.1
 * (engineering/decisions/2026-11-03-marp-bundle-live-front-matter.md).
 *
 * The one channel every host renders LIVE, from the open buffer, is the deck BODY.
 * So the exporter splits the front matter: the keys Marp consumes stay on top, and
 * every Lattice key moves into a settings block directly under it:
 *
 *   ---
 *   marp: true
 *   theme: indaco
 *   ---
 *   <script type="application/lattice-settings">
 *   class: no-progress
 *   color-mode: dark
 *   </script>
 *
 * Raw YAML, so it reads and edits like the front matter it came from. `class:` moves
 * too: in the block it reaches every slide, where at the top Marp would let a slide's
 * `_class` drop it. A `class:` someone still types at the top is not lost — the
 * runtime merges it in wherever it can see the top (marp-cli always; the VS Code
 * preview once saved) — see `mergeFrontMatter`.
 * ──────────────────────────────────────────────────────────────────────────── */

const { keyGroups, classTokensOf } = require('./front-matter-groups');

const SETTINGS_TYPE = 'application/lattice-settings';
const SETTINGS_OPEN = `<script type="${SETTINGS_TYPE}">`;

/**
 * The deck's front matter as the runtime should read it: the top (`top`, the YAML Marp
 * read — when the host lets us see it) merged with the settings block (`settings`).
 * The block is the documented home, so on a key both name, the BLOCK wins — with one
 * exception: `class` is the UNION of both, because the owner's rule is that a deck class
 * applies to every slide, and a token typed at the top is as much the deck's as one in
 * the block. Either side may be null (not visible in this host) or '' (empty).
 * @returns {string|null} null only when neither side is known
 */
function mergeFrontMatter(top, settings) {
  if (top == null && settings == null) return null;
  const a = keyGroups(top || '').groups;
  const b = keyGroups(settings || '').groups;
  const inB = new Map(b.map((g) => [g.key, g]));
  const out = [];
  for (const g of a) {
    const mine = inB.get(g.key);
    if (!mine) { out.push(g.text); continue; }
    if (g.key === 'class') {
      out.push(`class: ${[...new Set([...classTokensOf(g.text), ...classTokensOf(mine.text)])].join(' ')}`);
      inB.delete(g.key);
    }
  }
  for (const g of b) if (inB.has(g.key)) out.push(g.text);
  return out.join('\n');
}

/** The settings block for `yaml`, or '' when there is nothing to carry. */
function settingsBlock(yaml) {
  // trimEnd, not `/\s+$/`: an unanchored trailing-whitespace regex is quadratic on a long run of spaces.
  const body = String(yaml || '').replace(/^\n+/, '').trimEnd();
  return body ? `${SETTINGS_OPEN}\n${body}\n</script>\n` : '';
}

/**
 * Read every settings block out of a live document AND REMOVE THEM, returning the YAML (or
 * null when the document carries none). Raw YAML is the form a person edits; a payload that
 * starts with a quote is the JSON form the marp-cli engine re-emits (marp-bundle-html.js),
 * which cannot carry a raw `<`. The FIRST block wins — the one the exporter writes under the
 * front matter, which is also the only one `foldSettingsBlock` reads, so a bundle and the same
 * deck folded back into Lattice can never disagree about which block is the deck's.
 */
function readSettingsBlock(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return null;
  const nodes = [...doc.querySelectorAll(`script[type="${SETTINGS_TYPE}"]`)];
  if (!nodes.length) return null;
  const raw = (nodes[0].textContent || '').replace(/^[ \t\r]*\n/, '').trimEnd();
  for (const node of nodes) node.remove();
  if (raw.startsWith('"')) {
    try {
      const v = JSON.parse(raw);
      return typeof v === 'string' ? v : null;
    } catch (_e) {
      return null;
    }
  }
  return raw;
}

module.exports = { SETTINGS_TYPE, SETTINGS_OPEN, keyGroups, classTokensOf, mergeFrontMatter, settingsBlock, readSettingsBlock };
