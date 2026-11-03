/**
 * The deck's front matter, carried into a rendered document — one kernel, both
 * ends (HARD RULE #1).
 *
 * WHY THIS EXISTS. Marp strips front matter cleanly, so a previewer that renders
 * the deck without running Lattice's plugins has no way to see the deck-wide
 * registers: `color-mode:`, `class:`, `logo:`, `meta:`, and the finish / mode /
 * claim / stamp / tone / spectrum / rule / eyebrow / headline / lift family. The
 * runtime used to recover them by FETCHING the source `.md` from beside the
 * rendered document. Measured on the surface the export's own README tells
 * recipients to use — double-clicking `<name>.html`:
 *
 *   | opening the exported HTML   | sections carrying the deck's color mode |
 *   |-----------------------------|-----------------------------------------|
 *   | `file://`, default flags    | 0 |
 *   | `file://`, `--allow-file-access-from-files` | all of them |
 *   | over http(s)                | all of them |
 *
 * Chrome: *"Access to fetch at 'file:///…/deck.md' from origin 'null' has been
 * blocked by CORS policy."* `fetch` does not work on `file://` in any modern
 * browser — not intermittently, never. marp-cli loads the deck over `file://`
 * too, so `npm run pdf` lost the registers for the same reason: a `class: dark`
 * deck rendered light.
 *
 * THE FIX is to take the network out of the path. The producer BAKES the deck's
 * front matter into the document as an inert data block; the runtime READS it
 * from the DOM. The payload is the raw YAML rather than a parsed object, so the
 * runtime's existing readers parse the same string they used to fetch — one
 * grammar, no second format to keep in step, and the fetch survives as the
 * fallback for a document that predates the bake.
 *
 * Both halves live here because they are one contract: change the block's shape
 * and both move together.
 */

const { dataBlock } = require('./data-block');

/**
 * The MIME type the block is addressed by. Deliberately not `application/json`,
 * which would collide with any other JSON block a deck carries (and `anima`
 * scenes are exactly that).
 */
const FRONT_MATTER_TYPE = 'application/lattice-front-matter';

/**
 * The deck's YAML front matter, or '' — the `^---\n…\n---\n` head every path reads.
 *
 * The fences tolerate TRAILING WHITESPACE (`---   `), which Marpit accepts and the
 * docs-site's own front-matter reader accepts. A stricter regex here read such a
 * deck as having no front matter, and the block then positively asserted the wrong
 * thing — worse than asserting nothing, because its presence also short-circuits
 * the fetch fallback.
 */
function readFrontMatterBlock(deckSource) {
  const m = String(deckSource || '').match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  return m ? m[1] : '';
}

/**
 * The comment that rode above the block in an OLDER bundle. The exporter no longer writes a
 * snapshot (see "THE SETTINGS BLOCK" below); the note is kept so `withoutFrontMatterBlock` can
 * strip an older bundle's trailer when it is re-exported, and the history below is why.
 *
 * The block is a SNAPSHOT of the front matter as it stood at export time, and it
 * is what the runtime reads — the YAML at the top of the file is what Marp reads.
 * For the keys Marp doesn't understand (everything except `theme`, `class`,
 * `paginate`, …) that makes the block authoritative, so a recipient who edits
 * `color-mode: dark` to `light` and re-renders gets a dark deck unless they
 * re-export. That is the same silent wrong render this whole mechanism exists to
 * fix, arriving through the edit path instead, and the bundle's own AGENTS.md
 * invites exactly that edit — so the deck says so where the editor is looking.
 */
const BLOCK_NOTE = '<!-- Lattice: generated snapshot of the front matter above. '
  + 'Edit the front matter AND re-export — editing it alone will not change this. -->';

const BLOCK = dataBlock(FRONT_MATTER_TYPE, BLOCK_NOTE);

/**
 * The block to append to a deck's markdown, or '' when it has no front matter. No exporter calls
 * this any more; the format lives on as the one the bundle's marp-cli engine writes the LIVE top
 * in (lib/export/marp-bundle-html.js), which `readBakedFrontMatter` reads.
 *
 * `<` is escaped so the payload can never close its own `<script>` element (the
 * one character that could turn a data block into markup). JSON is the envelope
 * because it survives newlines, quotes, and `#` without a second escaping rule.
 *
 * `opts.localAssets: false` drops the front-matter keys that point at a RELATIVE
 * LOCAL file. A producer that cannot copy those files into the bundle (the
 * in-browser one has no filesystem) would otherwise bake a path the bundle does
 * not contain — turning a register that used to be silently absent into a
 * visibly broken image. A remote or `data:` value is kept: those resolve anywhere.
 * So is a value in `opts.bundledAssets`: a path the producer DID put in the bundle (the
 * in-browser one fetches `sample:` art into `assets/`, lib/export/marp-bundle.js
 * `withSampleAssets`).
 */
function frontMatterBlock(deckSource, { localAssets = true, bundledAssets = [] } = {}) {
  let fm = readFrontMatterBlock(deckSource);
  if (!localAssets) fm = withoutLocalAssetRefs(fm, bundledAssets);
  if (!fm.trim()) return '';
  return BLOCK.write(fm);
}

/** Strip any previously baked block (and its note) from a deck source. */
function withoutFrontMatterBlock(deckSource) {
  return BLOCK.strip(deckSource);
}

/** The front-matter keys whose value names an asset file. */
const ASSET_KEYS = ['logo'];

/**
 * Drop asset keys whose value is a relative local path (see `frontMatterBlock`), unless the
 * value is one of `bundled`, the paths the producer copied into the bundle.
 */
function withoutLocalAssetRefs(fm, bundled = []) {
  return ASSET_KEYS.reduce((acc, key) => acc.replace(
    new RegExp(`^[ \t]{0,8}${key}:[ \t]{0,8}["']?([^"'\\r\\n]*)["']?[ \t]{0,8}$\\n?`, 'm'),
    (whole, value) => (/^(?:https?:|data:|\/\/|\/)/i.test(value.trim()) || bundled.includes(value.trim()) ? whole : ''),
  ), fm);
}

/**
 * Read the baked block out of a live document AND REMOVE IT, returning the YAML
 * (or null when the document carries none — e.g. an older export, or any
 * non-exported surface, both of which fall back to the fetch).
 *
 * Removal is HYGIENE, and the earlier claim here that it was a LAYOUT requirement
 * was wrong: a `<script>` is `display:none` in the UA stylesheet, so it takes no
 * flex `gap` and no space at all. Measured — a flex column with `gap:40px` is
 * 80px tall with or without a script child between its two items. What removal
 * actually buys is that consumed state does not linger in a document something
 * else may copy, serialize, or sanitize (the docs-site Studio re-hosts slide HTML
 * — HARD RULE #22), and that the payload cannot be read twice. Safe to call
 * repeatedly: after the first call there is nothing left to find, which is why
 * the caller caches the result.
 */
function readBakedFrontMatter(doc) {
  const fm = BLOCK.read(doc);
  // A non-STRING payload is a corrupt one — the block carries raw YAML, so anything
  // else means someone else wrote it. Fall back to the fetch rather than guess.
  return typeof fm === 'string' ? fm : null;
}

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

const SETTINGS_TYPE = 'application/lattice-settings';
const SETTINGS_OPEN = `<script type="${SETTINGS_TYPE}">`;

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

/**
 * Split a YAML front-matter body into its top-level key groups, in order: each group
 * is the key's own line plus every indented or blank line after it (a block scalar, a
 * nested map, a list). A column-0 comment rides with the key that FOLLOWS it.
 * Lossless: joining every group's `text` (and `tail`) with '\n' gives the input back.
 * @returns {{ groups: Array<{ key: string, text: string }>, tail: string }}
 */
function keyGroups(yaml) {
  const groups = [];
  let pending = [];
  let current = null;
  for (const line of String(yaml || '').split(/\r?\n/)) {
    const m = /^([A-Za-z_$][\w$.-]*)[ \t]*:/.exec(line);
    if (m) {
      current = { key: m[1], lines: [...pending, line] };
      groups.push(current);
      pending = [];
    } else if (current && (/^[ \t]/.test(line) || line.trim() === '') && !pending.length) {
      current.lines.push(line);
    } else {
      pending.push(line);
    }
  }
  // Blank lines that ended a group belong between groups, not inside one.
  for (const g of groups) {
    while (g.lines.length > 1 && g.lines[g.lines.length - 1].trim() === '') pending.unshift(g.lines.pop());
  }
  return { groups: groups.map((g) => ({ key: g.key, text: g.lines.join('\n') })), tail: pending.join('\n') };
}

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

/** The class tokens a `class:` group names — a string, a YAML list, quoted or not. */
function classTokensOf(groupText) {
  return String(groupText).replace(/^class[ \t]*:/, '').replace(/#.*$/gm, '').replace(/^[ \t]*-[ \t]+/gm, ' ')
    .split(/[\s,[\]"']+/).filter(Boolean);
}

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
  const body = String(yaml || '').replace(/^\n+|\s+$/g, '');
  return body ? `${SETTINGS_OPEN}\n${body}\n</script>\n` : '';
}

// The front matter, closed at its FIRST fence — the same reading `readFrontMatterBlock` and Marpit
// make. One regex for "front matter, then the block" was the first draft, and its lazy body walked
// PAST the real closing fence to a later `---` that happened to be followed by a block (a deck that
// SHOWS a bundle in a fenced example): the whole deck up to there read as front matter, and rendered
// as one slide. Two anchored steps cannot do that.
const FRONT_MATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
// The block as written into a deck SOURCE, directly after the front matter: the open tag alone on
// its line and `</script>` alone on the last. A `<script type="application/lattice-settings">` an
// author wrote on slide 7 is not this and stays the author's.
const SETTINGS_HEAD_RE = new RegExp(
  `^(?:[ \\t]*\\r?\\n)*${SETTINGS_OPEN.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\r?\\n([\\s\\S]*?)\\r?\\n?</script>[ \\t]*(?:\\r?\\n|$)`,
);

/**
 * Fold a bundle's settings block back into its front matter — the way a bundle deck comes
 * BACK into Lattice (rendered, linted, re-exported). Returns the source unchanged when it
 * carries no block. The block's keys win over the top's, `class` is the union
 * (`mergeFrontMatter`), so the folded deck renders exactly as the bundle did. By default every
 * line after the block keeps its number (see below); `keepLines: false` is for the exporter.
 */
function foldSettingsBlock(deckSource, { keepLines = true } = {}) {
  const src = String(deckSource || '');
  const fm = src.match(FRONT_MATTER_RE);
  if (!fm) return src;
  const block = src.slice(fm[0].length).match(SETTINGS_HEAD_RE);
  if (!block) return src;
  const m = [fm[0] + block[0]];
  const merged = mergeFrontMatter(fm[1], block[1]);
  // SAME LINE COUNT: every line after the block keeps its number, so an editor's line ↔ slide
  // mapping (the Studio, the preview's scroll sync, a lint's line numbers) is unchanged by the fold.
  const head = `---\n${merged}\n---\n`;
  const lines = (t) => t.split('\n').length - 1;
  // A RE-EXPORT passes `keepLines: false`: it writes the block back itself, so padding would grow the
  // deck by blank lines on every round trip.
  const pad = keepLines ? '\n'.repeat(Math.max(0, lines(m[0]) - lines(head))) : '';
  return `${head}${pad}${src.slice(m[0].length)}`;
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
  return `---\n${top.replace(/\s+$/, '')}\n---\n${settingsBlock(settings)}${rest}`;
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
  const raw = (nodes[0].textContent || '').replace(/^\s*\n|\s+$/g, '');
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

module.exports = {
  FRONT_MATTER_TYPE, BLOCK_NOTE, readFrontMatterBlock, frontMatterBlock,
  withoutFrontMatterBlock, withoutLocalAssetRefs, readBakedFrontMatter,
  SETTINGS_TYPE, MARP_FRONT_MATTER_KEYS, keyGroups, splitFrontMatter, mergeFrontMatter,
  settingsBlock, foldSettingsBlock, readSettingsBlock, withBundleFrontMatter,
};
