/**
 * lib/core/meta-edit.mjs
 *
 * The STRUCTURED EDIT of a slide's comment directives: read one key's span, set or clear it
 * surgically. The Studio's "This slide" drawer is the user. It is the write half of
 * lib/core/meta-record.mjs (design note 2026-10-17-meta-record.md §5.2) in its own module so the
 * linter, which only reads, does not ship it: the lint core is a route-budget metric.
 *
 * It also holds `classifyComment`, which the linter does not call: the notes extractor takes it at step 2.
 *
 * Pure, fs-free, ESM.
 */

import { KNOWN_KEYS } from './meta-keys.mjs';
import { comments, directiveKey, isRecordBody, readMarker, readMeta } from './meta-record.mjs';

/**
 * Locate and parse a slide's directive for `key` (the first comment carrying it).
 *
 * @param {string} chunk  one slide's source
 * @param {string} key
 * @returns {{value: string, present: boolean, editable: boolean, reason?: 'array-form'|'duplicate',
 *   valueSpan?: [number, number], commentSpan?: [number, number], soleDirective?: boolean}}
 */
export function readMetaField(chunk, key) {
  const text = String(chunk ?? '');
  const lineRe = new RegExp(`(?:^|\\n)([ \\t]*)_?${key}\\s*:[ \\t]*([^\\n]*)`);
  const probe = new RegExp(`(?:^|\\n)\\s*_?${key}\\s*:`);
  const carriers = comments(text).filter((c) => probe.test(c.body));
  if (!carriers.length) return { value: '', present: false, editable: true };
  if (carriers.length > 1) return { value: '', present: true, editable: false, reason: 'duplicate' };

  const c = carriers[0];
  // The `_key:` line within the comment body: the value runs to end-of-line. Other lines
  // (`_paginate: false`) are left be.
  const line = c.body.match(lineRe);
  if (!line) return { value: '', present: false, editable: true };
  const rawValue = line[2];
  if (/^\[/.test(rawValue.trim())) return { value: '', present: true, editable: false, reason: 'array-form' };

  const matchStartInBody = (line.index ?? 0) + line[0].length - rawValue.length;
  const absValueStart = c.bodyStart + matchStartInBody;
  // Trim trailing whitespace from the value span so the ` -->` gap is never disturbed.
  const trimmed = rawValue.replace(/[ \t]+$/, '');
  const absValueEnd = absValueStart + trimmed.length;
  const other = c.body.split('\n').some((l) => l.trim() && !probe.test(`\n${l}`) && directiveKey(l) !== '');
  return {
    value: trimmed,
    present: true,
    editable: true,
    valueSpan: [absValueStart, absValueEnd],
    commentSpan: [c.start, c.end],
    soleDirective: !other,
  };
}

/**
 * Set (or clear, with an empty value) one spot directive of a slide, span-surgically:
 *   · present + editable → splice the value range, touching nothing else;
 *   · empty value + sole-directive comment → remove the whole comment (and one blank-line gap);
 *   · empty value + compound comment → drop just that key's line;
 *   · absent + non-empty → prepend `<!-- _key: value -->` as the chunk's first line;
 *   · not editable (a YAML array, a duplicate) → returned unchanged; the caller gates on
 *     `readMetaField(...).editable`.
 *
 * @param {string} chunk  one slide's source
 * @param {Record<string, string|null>} patch  key → value; null or '' clears
 * @returns {string}
 */
export function writeMeta(chunk, patch) {
  let text = String(chunk ?? '');
  for (const [key, want] of Object.entries(patch)) {
    if (!KNOWN_KEYS.has(key)) throw new Error(`writeMeta: "${key}" is not a slide-metadata key`);
    text = writeOne(text, key, want == null ? '' : String(want));
  }
  return text;
}

function writeOne(text, key, rawValue) {
  const dir = readMetaField(text, key);
  if (!dir.editable) return text;
  // Never close the comment early.
  const value = rawValue.replace(/--+>/g, '->');
  if (!dir.present) {
    if (!value) return text;
    const lead = `<!-- _${key}: ${value} -->`;
    return text.trim() ? `${lead}\n\n${text.replace(/^\n+/, '')}` : lead;
  }
  if (value) {
    const [s, e] = dir.valueSpan;
    return text.slice(0, s) + value + text.slice(e);
  }
  // Clearing: rebuild the comment from its remaining lines; if none is left, remove the whole
  // comment and one trailing blank-line gap.
  const [cs, ce] = dir.commentSpan;
  const inner = text.slice(cs + 4, ce - 3);
  const own = new RegExp(`^_?${key}\\s*:`);
  const kept = inner.split('\n').map((l) => l.trim()).filter((l) => l && !own.test(l));
  if (kept.length) return `${text.slice(0, cs)}<!-- ${kept.join('\n')} -->${text.slice(ce)}`;
  let end = ce;
  const gap = text.slice(ce).match(/^[ \t]*\r?\n(?:[ \t]*\r?\n)?/);
  if (gap) end += gap[0].length;
  return (text.slice(0, cs) + text.slice(end)).replace(/^\n+/, '');
}

/**
 * Classify a comment BODY (the text between `<!--` and `-->`).
 *   `directive`  an engine directive (`_class: …`, `footer: …`, a bare flag such as `_build`)
 *   `marker`     a registered marker (`stress-slide`)
 *   `record`     record-shaped (`{…}` / `@meta{…}`)
 *   `note`       anything else: a speaker note, or a tooling pragma the caller filters
 * @param {string} body
 * @returns {{kind: 'directive'|'marker'|'record'|'note', key?: string, spot?: boolean}}
 */
export function classifyComment(body) {
  const raw = `<!--${body}-->`;
  const dir = readMeta(raw);
  if (dir) return { kind: 'directive', key: dir.key, spot: dir.spot };
  if (readMarker(raw)) return { kind: 'marker' };
  if (isRecordBody(body)) return { kind: 'record' };
  return { kind: 'note' };
}

export default { classifyComment, readMetaField, writeMeta };
