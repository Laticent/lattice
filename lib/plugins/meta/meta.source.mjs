/**
 * lib/plugins/meta/meta.source.mjs
 *
 * The `meta` plugin's SOURCE HOOK (`contributes.source`).
 *
 * THE DOOR: every authored slide-metadata record (`<!-- @meta{layout=cards, footer="Q3 review"} -->`, the one spelling)
 * compiled to the engine's one internal comment, before anything else reads the deck
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
 *   3. THE CUT (slice E, record note §15). An authored setting in the old form, a directive comment
 *      (`<!-- _class: cards -->`, `<!-- footer: Q3 -->`, a flag such as `<!-- hide -->`), a pane marker (`<!-- _pane: bar -->`),
 *      a bare marker (`<!-- stress-slide -->`) or the retired bare record (`<!-- {layout=cards} -->`), is blanked, same line
 *      count, anywhere outside code: on its own line to the empty internal comment (which the expansion drops, so nothing
 *      reaches the HTML), elsewhere to `<!-- -->`. So every reader after the door (the heading split, focus steps,
 *      the pane carve, `lattice_directives`, plugin admission) sees records alone, and the slide renders the default layout.
 *      One `meta/legacy` diagnostic names the count; the linter names each comment with its fix (`legacy-directive-comment`,
 *      `meta-opener-bare`). The engine's own producers write after the door (the pane carve's tokens, a pane body's render),
 *      so the blank never reaches them.
 *
 * It does not merge records and never needs to know where a slide begins: `lattice_directives` merges the expanded
 * keys with spot, carry and last-wins exactly as it merges directive comments (lib/engine/slides.js
 * `lattice_meta_expand`).
 *
 * Pure and fs-free (HARD RULE #7).
 */


/** An authored comment written in the engine's internal spellings, any case (§5.1 item 4). */
const FORGED = /^\s*lat-(?:meta|panes?)(?:[^\w]|$)/i;

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
  const { isRecordOpener, isBareRecordOpener, isLegacySetting, MAY_NEED_DOOR, readRecord, writeInternal, commentSites, ownLineSite, blockLead, ownLineTail } = ctx.record;
  const src = String(source ?? '');
  if (!MAY_NEED_DOOR.test(src)) return { source: src, diagnostics: [] };
  const diagnostics = [];
  let out = '';
  let pos = 0;
  // The old settings this door blanks, counted: ONE diagnostic for the deck, not one per comment (a deck in the old form
  // holds hundreds). The linter names each one, with its fix.
  let legacy = 0;
  let firstLegacy = 0;
  // Code is what the ENGINE's parser calls code (`ctx.codeRanges`), so a fence the parser closes early (inside a list
  // item) or never opens (a backtick in its info string) does not hide the records after it (the red team, 2026-11-10).
  for (const site of commentSites(src, ctx.codeRanges(src))) {
    // Code and inline code spans are text (an opener in a span is not even searched for its `-->`).
    if (site.inCode || site.inSpan) continue;
    const n = site.body.split('\n').length;
    if (ownLineSite(site) && isRecordOpener(site.body)) {
      const rec = readRecord(site.body);
      for (const d of rec.diagnostics) diagnostics.push({ ...d, line: site.line });
      out += src.slice(pos, site.at) + writeInternal(rec.ok ? rec : { carry: false, d: {} }, n);
      pos = site.end;
    } else if (blockLead(site) && (isBareRecordOpener(site.body) || isLegacySetting(site.body))) {
      // 3. THE CUT. An old setting comment (`<!-- _class: x -->`, a pane marker, a bare marker) or the retired bare record
      // (`<!-- {…} -->`) is blanked, same line count, wherever the engine could read it as a block: the engine reads
      // `<!-- @meta{…} -->` alone. One after text on its line (`See <!-- _class: x -->`, an escaped `\<!--`, a line of a
      // code span that started above) is left as written: the engine never applies it, and it may be visible text.
      // On its own line it becomes the EMPTY internal comment, which the expansion drops (lib/engine/slides.js
      // `lattice_meta_expand`), so no trace of it reaches the slide's HTML; anywhere else, an empty comment.
      if (!legacy++) firstLegacy = site.line;
      out += src.slice(pos, site.at) + (ownLineSite(site) ? writeInternal({ carry: false, d: {} }, n) : `<!--${'\n'.repeat(n - 1)} -->`);
      pos = site.end;
    } else if (ownLineTail(site.body) >= 0) {
      // 4. A TAIL. A span whose `<!--` the engine may end early (an unclosed `<!-- note` in a list item ends with the item)
      // holds a later `<!--`, opening its own line, that the engine then reads as a comment of its own. A record there is
      // compiled and an old setting blanked, from that `<!--` on, same lines; anything else, and the rest of the span, is
      // left as written. Where the engine reads the span as ONE comment instead, the internal comment sits inside it and
      // the expansion leaves it inert (it reads only a block that is one whole comment), as it would leave the record.
      const k = ownLineTail(site.body);
      const inner = site.body.slice(k + 4);
      const lines = inner.split('\n').length;
      if (isRecordOpener(inner)) {
        const rec = readRecord(inner);
        for (const d of rec.diagnostics) diagnostics.push({ ...d, line: site.line + site.body.slice(0, k).split('\n').length - 1 });
        out += src.slice(pos, site.at + 4 + k) + writeInternal(rec.ok ? rec : { carry: false, d: {} }, lines);
        pos = site.end;
      } else if (isBareRecordOpener(inner) || isLegacySetting(inner)) {
        if (!legacy++) firstLegacy = site.line;
        out += `${src.slice(pos, site.at + 4 + k)}<!--${'\n'.repeat(lines - 1)} -->`;
        pos = site.end;
      }
    } else if (FORGED.test(site.body)) {
      diagnostics.push({ code: 'meta-forged', message: 'a comment written in the engine\u2019s internal form (`lat-meta`, `lat-pane`) is ignored', line: site.line });
      out += `${src.slice(pos, site.at)}<!--${'\n'.repeat(n - 1)} -->`;
      pos = site.end;
    }
  }
  if (legacy) {
    diagnostics.push({
      code: 'meta-legacy', line: firstLegacy,
      message: `${legacy === 1 ? 'a setting comment is' : `${legacy} setting comments are`} in the old form (\`<!-- _class: … -->\`, \`<!-- {…} -->\`) and set nothing; Lattice reads only \`<!-- @meta{…} -->\`. Run \`lattice migrate meta\` or the lint fix`,
    });
  }
  if (!pos) return { source: src, diagnostics };
  return { source: out + src.slice(pos), diagnostics };
}
