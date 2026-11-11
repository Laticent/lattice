/**
 * lib/plugins/meta/meta.source.mjs
 *
 * The `meta` plugin's SOURCE HOOK (`contributes.source`).
 *
 * THE DOOR: every authored slide-metadata record (`<!-- {layout=cards, footer="Q3 review"} -->`, or the long form
 * `<!-- @meta{…} -->`) compiled to the engine's one internal comment, before anything else reads the deck
 * (engineering/decisions/2026-10-17-meta-record.md §5.1, step 2). The engine runs every source hook at each public
 * door (lib/engine/index.js `runSourceHooks`).
 *
 *   compileSource(source, ctx) → { source, diagnostics }
 *
 * THROUGH `ctx`, as a plugin takes what it needs from the host: `ctx.record` is the shared record reader
 * (lib/core/meta-door.mjs: `readRecord`, `isRecordOpener`, `writeInternal`, `MAY_NEED_DOOR`), which the linter and the
 * Studio read records through too (HARD RULE #1), and `ctx.codeRanges` what the engine's parser reads as code. The plugin owns the
 * door's logic; it imports nothing from outside its folder.
 *
 *   1. THE RECORDS. Each record the engine reads as a top-level block (§5.3: one whole comment, 0 to 3 spaces in, not in
 *      a list, a blockquote or a larger HTML block) is read by `readRecord` (lib/core/meta-door.mjs) and replaced IN
 *      PLACE, on the same lines, by ONE internal comment (`<!-- lat-meta: {"carry":false,"d":{…}} -->`). Same line
 *      count, so no `token.map` and no lint position moves. A record that does not read becomes an EMPTY internal
 *      comment and a diagnostic: never dropped silently, never left to fall through to the speaker note.
 *   2. THE FORGERY GUARD. Any other comment outside a fence and an inline code span whose text begins `lat-meta`,
 *      `lat-pane` or `lat-panes`, in any case, is blanked to `<!-- -->`, same line count: those spellings are the
 *      engine's own. (One written in an indented code block is blanked too: a visible change only for someone quoting
 *      the engine's internal form as code, and the safe direction.)
 *
 * It does not merge records and never needs to know where a slide begins: `lattice_directives` merges the expanded
 * keys with spot, carry and last-wins exactly as it merges directive comments (lib/engine/slides.js
 * `lattice_meta_expand`).
 *
 * Pure and fs-free (HARD RULE #7).
 */


/** An authored comment written in the engine's internal spellings, any case (§5.1 item 4). */
const FORGED = /^\s*lat-(?:meta|note|panes?)(?:[^\w]|$)/i;

/**
 * Compile a deck's record comments to the internal form, after blanking any forged internal comment.
 *
 * A LINE SCAN (§5.3), not a parse: a line that opens a record outside a fence, up to the comment's first `-->`. It may
 * compile a record the engine will not read as a top-level block (one indented under a list item, or folded into a
 * larger HTML block): that internal comment is then inert, because the token rule expands only a top-level block that
 * is one whole comment (lib/engine/slides.js `lattice_meta_expand`), and the notes extractor reads every `lat-*`
 * comment as tooling. So the scan's one residual is a record that does nothing, which the linter names
 * (`meta-not-own-line`, `meta-in-html-block`), never a record that leaks. A block parse here cost 1.2 ms of the door's
 * 2.2 ms on a 116-record deck, for no difference in what renders.
 * @param {string} source  the deck, line endings LF (the engine's doors normalize them first)
 * @param {{record: object, fenceRanges: (text: string) => Array<[number, number]>}} ctx  the host's record reader and fence scan
 * @returns {{source: string, diagnostics: Array<{code: string, message: string, line: number}>}}
 *   `line` is 1-based in `source`.
 */
export function compileSource(source, ctx) {
  const { isRecordOpener, MAY_NEED_DOOR, readRecord, writeInternal, commentSites, ownLineSite } = ctx.record;
  const src = String(source ?? '');
  if (!MAY_NEED_DOOR.test(src)) return { source: src, diagnostics: [] };
  const diagnostics = [];
  let out = '';
  let pos = 0;
  // Code is what the ENGINE's parser calls code (`ctx.codeRanges`), so a fence the parser closes early (inside a list
  // item) or never opens (a backtick in its info string) does not hide the records after it (the red team, 2026-11-10).
  for (const site of commentSites(src, ctx.codeRanges(src))) {
    if (site.inCode) continue;
    const n = site.body.split('\n').length;
    if (ownLineSite(site) && isRecordOpener(site.body)) {
      const rec = readRecord(site.body);
      for (const d of rec.diagnostics) diagnostics.push({ ...d, line: site.line });
      out += src.slice(pos, site.at) + writeInternal(rec.ok ? rec : { carry: false, d: {} }, n);
      pos = site.end;
    } else if (FORGED.test(site.body) && !site.inSpan) {
      diagnostics.push({ code: 'meta-forged', message: 'a comment written in the engine\u2019s internal form (`lat-meta`, `lat-note`, `lat-pane`) is ignored', line: site.line });
      out += `${src.slice(pos, site.at)}<!--${'\n'.repeat(n - 1)} -->`;
      pos = site.end;
    }
  }
  if (!pos) return { source: src, diagnostics };
  return { source: out + src.slice(pos), diagnostics };
}
