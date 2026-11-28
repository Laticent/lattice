/**
 * lib/core/without-legacy-settings.mjs
 *
 * Export to Marp's half of the cut: strip the old setting comments before the records become Marp directives, so Marp
 * applies what the engine applies. Its own module, because it parses with the engine's boundary parser
 * (lib/core/code-ranges.mjs) and the lint core must not reach that parser (tools/build-playground.js
 * `assertLintParserIsolated`). Pure and fs-free (HARD RULE #7).
 */
import { codeRanges } from './code-ranges.mjs';
import { isLegacySetting } from './comment-directive.mjs';
import { blockLead, commentSites, isBareRecordOpener, isRecordOpener, ownLineTail } from './meta-door.mjs';

/**
 * `source` with every old setting comment and bare record taken out (`isLegacySetting`, `isBareRecordOpener`), outside
 * code and inline code spans, as the door blanks them (lib/plugins/meta/meta.source.mjs, the cut). For Export to Marp,
 * which writes the deck's records back as Marp's own comments (`recordsToComments`): without this pass an old
 * `<!-- _class: … -->` would reach Marp and set a layout the Lattice render of the same deck does not have.
 * @param {string} source  LF source
 * @returns {string}
 */
export function withoutLegacySettings(source) {
  const src = String(source ?? '');
  if (!src.includes('<!--')) return src;
  let out = '';
  let pos = 0;
  // The same sites the door blanks (lib/plugins/meta/meta.source.mjs `compileSource` items 3 and 4): code as the
  // parser reads it, a comment that may open a block, and the own-line tail of a span the parser may end early.
  for (const site of commentSites(src, codeRanges(src))) {
    if (site.inCode || site.inSpan) continue;
    if (blockLead(site) && (isBareRecordOpener(site.body) || isLegacySetting(site.body))) {
      out += src.slice(pos, site.at);
      pos = site.end;
      continue;
    }
    const k = ownLineTail(site.body);
    if (k < 0) continue;
    const inner = site.body.slice(k + 4);
    if (isRecordOpener(inner) || !(isBareRecordOpener(inner) || isLegacySetting(inner))) continue;
    out += src.slice(pos, site.at + 4 + k);
    pos = site.end;
  }
  return pos === 0 ? src : out + src.slice(pos);
}
