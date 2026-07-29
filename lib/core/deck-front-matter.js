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

/**
 * The MIME type the block is addressed by. Deliberately not `application/json`,
 * which would collide with any other JSON block a deck carries (and `anima`
 * scenes are exactly that).
 */
const FRONT_MATTER_TYPE = 'application/lattice-front-matter';

/** The deck's YAML front matter, or '' — the `^---\n…\n---\n` head every path reads. */
function readFrontMatterBlock(deckSource) {
  const m = String(deckSource || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  return m ? m[1] : '';
}

/**
 * The block to append to a deck's markdown, or '' when it has no front matter.
 *
 * `<` is escaped so the payload can never close its own `<script>` element (the
 * one character that could turn a data block into markup). JSON is the envelope
 * because it survives newlines, quotes, and `#` without a second escaping rule.
 */
function frontMatterBlock(deckSource) {
  const fm = readFrontMatterBlock(deckSource);
  if (!fm.trim()) return '';
  return `<script type="${FRONT_MATTER_TYPE}">${JSON.stringify(fm).replace(/</g, '\\u003c')}</script>\n`;
}

/**
 * Read the baked block out of a live document AND REMOVE IT, returning the YAML
 * (or null when the document carries none — e.g. an older export, or any
 * non-exported surface, both of which fall back to the fetch).
 *
 * Removal is not tidiness. Marp renders the block into a slide, and a
 * measuring layout counts its children: an inert zero-height element still takes
 * a `gap` in a flex column, which would shift the slide it landed on. Taking it
 * out before any transform measures means it costs nothing. Safe to call
 * repeatedly — after the first call there is nothing left to find, which is why
 * the caller caches the result.
 */
function readBakedFrontMatter(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return null;
  const node = doc.querySelector(`script[type="${FRONT_MATTER_TYPE}"]`);
  if (!node) return null;
  const raw = node.textContent || '';
  node.remove();
  try {
    const fm = JSON.parse(raw);
    return typeof fm === 'string' ? fm : null;
  } catch (_e) {
    return null; // a corrupt payload is a missing one — fall back to the fetch
  }
}

module.exports = { FRONT_MATTER_TYPE, readFrontMatterBlock, frontMatterBlock, readBakedFrontMatter };
