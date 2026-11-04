/**
 * lib/export/bundle-front-matter.js — the front matter an exported Marp bundle carries: Marp's keys on
 * top, every Lattice key in the settings block directly under it (lib/core/settings-block.js;
 * engineering/decisions/2026-11-03-marp-bundle-live-front-matter.md). Export-only, so it rides the
 * exporter's lazy chunk, not the engine's boot bundle.
 */
const { withoutLocalAssetRefs } = require('../core/deck-front-matter');
const { keyGroups, settingsBlock, mergeFrontMatter } = require('../core/settings-block');
const { FRONT_MATTER_RE, SETTINGS_HEAD_RE } = require('../core/settings-block-fold');

/**
 * The front-matter keys MARP consumes, which stay at the top of a bundle: Marpit's
 * global directives, marp-core's and marp-cli's (size, math, the HTML metadata) and
 * Marp for VS Code's `marp`, plus the local directives a deck may set deck-wide.
 * `class` is deliberately absent — see the block comment above. A key Marp gains
 * later and this list lacks lands in the settings block, where Marp does not see it;
 * test/unit/core/deck-front-matter-settings.test.js pins the list against the directive registry
 * (lib/plugins/meta/meta.manifest.json), so a Marp key added there cannot be missed here.
 */
const MARP_FRONT_MATTER_KEYS = Object.freeze(new Set([
  'marp', 'theme', 'style', 'headingDivider', 'lang', 'size', 'math', 'transition',
  'title', 'description', 'author', 'keywords', 'url', 'image',
  'paginate', 'header', 'footer', 'color',
  'backgroundColor', 'backgroundImage', 'backgroundPosition', 'backgroundRepeat', 'backgroundSize',
]));

/** A group's text must never be able to end or re-open the `<script>` it is written into. */
const unsafeInScript = (text) => /<\/|<!--|<script/i.test(text);

/**
 * Split front matter into what stays on top (Marp's keys) and what moves into the
 * settings block (every other key). A key whose text could end its `<script>` early
 * (`</`, `<!--`, `<script`) stays on top: the runtime still reads it there on marp-cli
 * and in the saved VS Code preview, and the block can never be broken by its content.
 * @returns {{ top: string, settings: string }}
 */
function splitFrontMatter(fm) {
  const { groups, tail } = keyGroups(fm);
  const top = [];
  const settings = [];
  for (const g of groups) (MARP_FRONT_MATTER_KEYS.has(g.key) || unsafeInScript(g.text) ? top : settings).push(g.text);
  if (tail.trim()) top.push(tail);
  return { top: top.join('\n'), settings: settings.join('\n') };
}

/**
 * The deck as a Marp bundle carries it: Marp's keys in the front matter, every Lattice key in
 * the settings block directly under it, and `marp: true` always — Marp for VS Code renders a
 * file as slides only when its front matter says so, and an export of a deck that had front
 * matter without it opened as plain Markdown (measured, VS Code 1.144.1). A deck with no front
 * matter gets one. `localAssets: false` drops a settings key that points at a local file the
 * bundle does not contain (`withoutLocalAssetRefs`), as the baked copy used to.
 */
function withBundleFrontMatter(deckSource, { localAssets = true, bundledAssets = [] } = {}) {
  const src = String(deckSource || '');
  const m = src.match(FRONT_MATTER_RE);
  const fm = m ? m[1] : '';
  const rest = m ? src.slice(m[0].length) : src;
  let { top, settings } = splitFrontMatter(fm);
  if (!localAssets) settings = withoutLocalAssetRefs(settings, bundledAssets);
  if (!keyGroups(top).groups.some((g) => g.key === 'marp')) top = top.trim() ? `marp: true\n${top}` : 'marp: true';
  return `---\n${top.trimEnd()}\n---\n${settingsBlock(settings)}${rest}`;
}

/**
 * A bundle deck's settings block folded back into its front matter, COMPACT: the merged YAML (the
 * block's keys win, `class` is the union) as one front matter, the block gone. The exporter's
 * re-export uses it — it writes the block back itself, so a re-export is byte-identical. Everything
 * that reads a deck by line (the engine, lint) uses the line-preserving `foldSettingsBlock`.
 */
function foldSettingsBlockCompact(deckSource) {
  const src = String(deckSource || '');
  const fm = src.match(FRONT_MATTER_RE);
  if (!fm) return src;
  const block = src.slice(fm[0].length).match(SETTINGS_HEAD_RE);
  if (!block) return src;
  return `---\n${mergeFrontMatter(fm[1], block[1])}\n---\n${src.slice(fm[0].length + block[0].length)}`;
}

module.exports = { MARP_FRONT_MATTER_KEYS, splitFrontMatter, withBundleFrontMatter, foldSettingsBlockCompact };
