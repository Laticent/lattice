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
 * The comment that rides above the block in the emitted deck.
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
 * The block to append to a deck's markdown, or '' when it has no front matter.
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
 */
function frontMatterBlock(deckSource, { localAssets = true } = {}) {
  let fm = readFrontMatterBlock(deckSource);
  if (!localAssets) fm = withoutLocalAssetRefs(fm);
  if (!fm.trim()) return '';
  return BLOCK.write(fm);
}

/** Strip any previously baked block (and its note) from a deck source. */
function withoutFrontMatterBlock(deckSource) {
  return BLOCK.strip(deckSource);
}

/** The front-matter keys whose value names an asset file. */
const ASSET_KEYS = ['logo'];

/** Drop asset keys whose value is a relative local path (see `frontMatterBlock`). */
function withoutLocalAssetRefs(fm) {
  return ASSET_KEYS.reduce((acc, key) => acc.replace(
    new RegExp(`^[ \t]{0,8}${key}:[ \t]{0,8}["']?([^"'\\r\\n]*)["']?[ \t]{0,8}$\\n?`, 'm'),
    (whole, value) => (/^(?:https?:|data:|\/\/|\/)/i.test(value.trim()) ? whole : ''),
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

module.exports = {
  FRONT_MATTER_TYPE, BLOCK_NOTE, readFrontMatterBlock, frontMatterBlock,
  withoutFrontMatterBlock, withoutLocalAssetRefs, readBakedFrontMatter,
};
