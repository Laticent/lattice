/**
 * lib/export/marp-directives.mjs — the export-to-Marp boundary for the directives Marp does not know.
 *
 * Marp reads a comment as directives only when every key in it is one Marp knows; any other comment is a SPEAKER NOTE,
 * and `--pdf-notes` and `--pptx` carry it. So a Lattice-only directive (`<!-- _focusSteps: 3 -->`, `<!-- _build -->`,
 * `<!-- _track: … -->`, `<!-- _logo: … -->`) exported as written shows up in the recipient's presenter notes, in either
 * spelling. Measured with `@marp-team/marp-core` (2026-11-11): `_focusSteps: 3`, `_build` and `_hide: false` each came
 * back in `render().comments`, while a comment that also held a Marp key (`_class: lead` / `_track: x`) applied the
 * known key and showed nothing. Marp cannot act on any of these keys (it has no step walker, no tracks, no hidden slide
 * once the hide bake has run), so this removes each comment that holds ONLY Lattice-only keys
 * (engineering/decisions/2026-10-17-meta-record.md §7, step 4).
 *
 * FOUND THE WAY THE ENGINE FINDS THEM: a directive is an `html_block` of the shared boundary parser, as
 * lib/core/marp-slide-only.mjs finds them, so code, inline comments and notes are left exactly as written. A comment's
 * lines are replaced by nothing and the line count is kept (blank lines), so nothing after it moves.
 *
 * Pure: string in, string out; a deck with nothing to remove comes back byte-identical. Not in the engine bundle: the
 * two Marp producers call it (tools/export-marp.js, the Studio's deck-export.js), pinned by
 * test/unit/export/marp-directives.test.js.
 */

import { FRONT_MATTER, boundaryParser as md, normalizeSource } from '../core/boundary-parser.mjs';
import { readDirectiveComment } from '../core/comment-directive.mjs';
import { DIRECTIVE_VOCAB, GLOBAL_ONLY_KEYS, hideOn, LOCAL_KEYS } from '../core/meta-keys.mjs';
import { directiveKey } from '../core/meta-scan.mjs';

/**
 * The directives Marp reads, by Lattice key, DERIVED from the vocabulary (lib/core/meta-keys.mjs): Marpit's local
 * directives are the manifest's `local` keys, and its globals are the deck-only keys plus `style`, which Marp reads as a
 * global and Lattice as a slide field. A key outside this set is one Marp shows as a speaker note when it stands alone in
 * a comment. (Marp's own `headingDivider` and `math` are not Lattice keys, so a comment of either is never removed.)
 */
export const MARP_DIRECTIVE_KEYS = Object.freeze(new Set([...LOCAL_KEYS, ...GLOBAL_ONLY_KEYS, 'style']));

/**
 * The deck with every directive comment that holds only Lattice-only keys removed (its lines left blank).
 * @param {string} deck
 * @returns {{markdown: string, dropped: string[]}}  `dropped`: the keys removed, one per comment, for the export's report.
 */
export function withMarpDirectivesOnly(deck) {
  const source = String(deck ?? '');
  if (!source.includes('<!--')) return { markdown: source, dropped: [] };
  const src = normalizeSource(source);
  const fm = (src.match(FRONT_MATTER) || [''])[0];
  const lines = src.slice(fm.length).split('\n');
  const dropped = [];
  for (const t of md.parse(lines.join('\n'), {})) {
    // Top level only: blanking a comment's lines inside a list or blockquote takes the item marker or the `> ` with it
    // and changes the structure Marp renders (checker, 2026-11-11). A nested directive is rare, and is left as written.
    if (t.type !== 'html_block' || !t.map || t.level !== 0) continue;
    const text = t.content.trim();
    const dir = readDirectiveComment(text, DIRECTIVE_VOCAB);
    if (!dir) continue;
    // `hide` with a value Lattice does not read as on (`<!-- hide: if short on time -->`) is a speaker note to Lattice,
    // and stays one in Marp.
    if (dir.key === 'hide' && !hideOn(dir.value)) continue;
    // Every key line of the comment, the way Marp reads its YAML: one key it knows keeps the whole comment.
    const keys = text.slice(4, -3).split('\n').map((l) => l.trim()).filter(Boolean).map(directiveKey);
    if (keys.some((k) => !k || MARP_DIRECTIVE_KEYS.has(k))) continue;
    for (let n = t.map[0]; n < t.map[1]; n++) lines[n] = '';
    dropped.push(...keys);
  }
  return dropped.length ? { markdown: fm + lines.join('\n'), dropped } : { markdown: source, dropped };
}

/**
 * THE ONE PASS LIST of the export to Marp (record note §7: "one compile, first, in both producers"), in the order each
 * producer runs it. Both tools/export-marp.js and the Studio's deck-export.js call these in this order, each on the
 * result of the one before; test/unit/export/marp-directives.test.js reads both files and fails when either reorders,
 * drops or adds a pass. Each producer adds only what its medium needs between them (the CLI copies local files, the
 * Studio fetches samples and embeds local components), never a reorder.
 *
 *   recordsToComments        records → the directive comments Marp reads, before anything reads a class or a marker
 *   withImageRecordsAsMarp   the image plugin's records in Marp's spelling
 *   fillAutoAgenda           an empty agenda's list, baked
 *   appendAutoGlossary       the generated glossary slide (before the split bake: it appends a slide)
 *   liftImageBgImages        `![bg]` → the layout's panel, on the UNSPLIT body (the lift needs the `_class` and the
 *                            picture in one slide part, which a heading split can separate)
 *   bakeSplits               heading splits → literal `---`
 *   stripPaneMarkers         Marp cannot carve a pane, and would show each marker as a note
 *   bakeHidden               hidden slides out, every `hide` Lattice reads written `_hide`
 *   withMarpDirectivesOnly   Lattice-only directives out (after the hide bake, which reads `_hide`)
 *   withSlideOnlySpotted     a plain `header:` / `footer:` scoped to its slide, as Lattice reads it
 *   withRuntimeScriptsReport the runtime scripts and the baked front matter
 */
export const MARP_PASSES = Object.freeze([
  'recordsToComments', 'withImageRecordsAsMarp', 'fillAutoAgenda', 'appendAutoGlossary', 'liftImageBgImages',
  'bakeSplits', 'stripPaneMarkers', 'bakeHidden', 'withMarpDirectivesOnly', 'withSlideOnlySpotted', 'withRuntimeScriptsReport',
]);
