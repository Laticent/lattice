/**
 * lib/core/data-block.js
 *
 * One implementation of the inert `<script type="…">` DATA BLOCK a Lattice export
 * appends to the deck it emits, so the two blocks that use it cannot drift.
 *
 * Two exist today and they carry different KINDS of thing, which is why they are
 * two blocks and not one:
 *   · `application/lattice-front-matter` (lib/core/deck-front-matter.js) — a
 *     snapshot of the AUTHOR's front matter, which Marp strips and `fetch` cannot
 *     recover over `file://`.
 *   · `application/lattice-export-settings` (lib/core/export-settings.js) — the
 *     PRODUCER's choices for this export, which are not the author's deck at all.
 *
 * They were written twice, in one commit, in one directory: the same escaped-note
 * regex, the same last-wins → remove → JSON.parse → corrupt-is-absent read, the
 * same `<` escape. Two hand-maintained copies of one invariant is the thing
 * HARD RULE #15 exists to stop, and the failure mode is that a fix to one is a coin
 * flip on the other noticing. So the invariant lives here once.
 *
 * THE PAYLOAD CANNOT CONTAIN A RAW `<`. Everything is JSON-encoded and every `<` is
 * escaped to `<`, which is what stops a payload closing its own `</script>` —
 * and it is also what lets the strip regex bound its payload with `[^<]*` instead of
 * `[\s\S]*?`. That bound is not cosmetic: the lazy form scans forward to the NEXT
 * `</script>` anywhere in the document, so a deck containing an unclosed
 * `<script type="…">` in its body swallowed everything up to the bundle's own
 * runtime tags — measured at three slides in, one slide out, with a duplicated
 * runtime script left behind.
 */

/** Escape a literal for embedding in a RegExp. */
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Build the reader/writer/stripper trio for one block type.
 *
 * @param {string} type the `<script type="…">` MIME the block is addressed by
 * @param {string} [note] an HTML comment written above the block. OMIT IT unless
 *   the block genuinely needs one: Marpit turns a non-directive HTML comment into a
 *   SPEAKER NOTE, so every note here shows up in the recipient's presenter view and
 *   in the PPTX notes pane. The front-matter block accepts that cost because its
 *   note warns an editor that the snapshot overrides what they are editing; a block
 *   nobody is expected to edit should carry none.
 */
function dataBlock(type, note = '') {
  const head = note ? `${note}\n` : '';
  // The note prefix is only optional-matched when there IS one. Built
  // unconditionally, an empty note collapses `(?:${note}\n)?` to `(?:\n)?`, which
  // silently eats the NEWLINE BEFORE the block — so stripping it also ate the blank
  // line separating it from the deck's last slide.
  const notePrefix = note ? `(?:${esc(note)}\\n)?` : '';
  const blockRe = new RegExp(
    `${notePrefix}<script type="${esc(type)}">[^<]*<\\/script>\\n?`,
    'g',
  );

  return {
    TYPE: type,
    NOTE: note,
    BLOCK_RE: blockRe,

    /** The block for `value`, or '' when there is nothing to carry. */
    write(value) {
      if (value === undefined || value === null || value === '') return '';
      const payload = JSON.stringify(value).replace(/</g, '\\u003c');
      return `${head}<script type="${type}">${payload}</script>\n`;
    },

    /** Strip any previously written block (and its note) from a deck source. */
    strip(deckSource) {
      return String(deckSource || '').replace(blockRe, '');
    },

    /**
     * Read the block out of a live document AND REMOVE IT, or null.
     *
     * The LAST block wins: a producer replaces rather than stacks, so a document
     * should hold one — but a hand-edited or concatenated deck can hold more, and
     * the newest is the one to trust. Taking the first would prefer the stalest.
     * Removal is hygiene: consumed state should not linger where something may copy,
     * serialize, or sanitize it (the docs-site Studio re-hosts slide HTML — HARD
     * RULE #22), and the payload cannot then be read twice.
     */
    read(doc) {
      if (!doc || typeof doc.querySelectorAll !== 'function') return null;
      const nodes = [...doc.querySelectorAll(`script[type="${type}"]`)];
      if (!nodes.length) return null;
      const raw = nodes[nodes.length - 1].textContent || '';
      for (const node of nodes) node.remove();
      try {
        return JSON.parse(raw);
      } catch (_e) {
        return null; // a corrupt payload is a missing one
      }
    },
  };
}

module.exports = { dataBlock };
