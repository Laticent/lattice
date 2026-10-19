/**
 * What a plugin hands back besides its drawing, checked by the HOST before anything of it reaches a page
 * (threat-model note engineering/decisions/2026-10-16-npm-plugin-threat-model.md §6, owner decisions 10 to 12).
 * Shared by both doors: the CLI host (lib/packages/code-door.js) and the Studio (docs/src/lib/code-packages/door-run.ts).
 *
 * A renderer that declares `contributes.returns.fields` (code-shape.mjs `returnsRefusal`) may return
 * `{ html, data }`. The worker sends it across the frame as one string (`RETURN_ENVELOPE` + JSON), which
 * `splitReturn` reads back. `checkReturnData` then holds every value to its declared field:
 *
 *   word      one of the field's declared `values`
 *   number    a finite number, inside the field's `min` and `max`
 *   flag      true or false
 *   text      a string, control and bidi characters removed, no markup, at most `max` (256) characters
 *   markdown  a string of markdown with NO HTML in it: emphasis, lists, tables, code and quotes; no raw tag, no
 *             image, no link, no fence (no URL type was granted, and an image is a fetch). At most `max` (2,000).
 *
 * ANY value that breaks its field, or a name the plugin did not declare, is a VIOLATION, and the caller disables
 * the plugin for the whole render and says why (decision 12: detect and disable, not drop and carry on). A plugin
 * that tries to inject is a plugin the user should hear about, not one whose next value is trusted.
 *
 * The host writes each value as `data-returned-<plugin>--<name>` on the slide's own <section> (`returnAttr`),
 * escaped as an attribute value. A consumer that shows a markdown value renders it with `renderReturnMarkdown`, which allows
 * exactly what the check allowed.
 */

import MarkdownIt from 'markdown-it';
import { RETURN_ATTR_PREFIX, RETURN_ENVELOPE, splitReturn } from './code-shape.mjs';

export { RETURN_ENVELOPE, splitReturn };

// Removed from every value: control characters (but tab and newline in markdown), C1 controls, the bidi marks,
// overrides and isolates (U+061C, U+200E/F, U+202A to 202E, U+2066 to 2069), the zero-width characters, the line and
// paragraph separators and the byte-order mark: meta-record §5.7's set, widened by the red team's finds.
const INVISIBLE = '\\u007f-\\u009f\\u00ad\\u061c\\u180e\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u2069\\ufeff';
/** The tag characters (U+E0000 to E007F), invisible and able to smuggle text: as UTF-16, a high surrogate U+DB40 and a low one. */
const TAG_CHARS_RE = /\udb40[\udc00-\udc7f]/g;
const CONTROL_RE = new RegExp(`[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f${INVISIBLE}]`, 'g');
const TEXT_CONTROL_RE = new RegExp(`[\\u0000-\\u001f${INVISIBLE}]`, 'g');
/** A lone half of a surrogate pair: two strings that differ only there can share a digest or a display in a browser. */
const LONE_SURROGATE_RE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
/** Something a browser would read as markup if the value ever reached HTML: a tag, a comment, a CDATA or a processing instruction. `a < b` is not one. */
const MARKUP_RE = /<[a-z!?/]/i;

// One parser for the check, with HTML detection ON so a raw tag shows up as an html token and is refused.
// `validateLink` is markdown-it's filter that silently turns `[x](javascript:…)` into plain text; the checker accepts
// every link so that one shows up as a link and is refused, and an injection attempt disables the plugin.
const checker = new MarkdownIt({ html: true, linkify: false, typographer: false });
checker.validateLink = () => true;
const ALLOWED_TOKENS = new Set([
  'paragraph_open', 'paragraph_close', 'inline', 'text', 'softbreak', 'hardbreak',
  'strong_open', 'strong_close', 'em_open', 'em_close', 's_open', 's_close', 'code_inline', 'code_block',
  'bullet_list_open', 'bullet_list_close', 'ordered_list_open', 'ordered_list_close', 'list_item_open', 'list_item_close',
  'table_open', 'table_close', 'thead_open', 'thead_close', 'tbody_open', 'tbody_close', 'tr_open', 'tr_close', 'th_open', 'th_close', 'td_open', 'td_close',
  'heading_open', 'heading_close', 'blockquote_open', 'blockquote_close', 'hr',
]);
const REFUSED_WHY = { html_inline: 'HTML', html_block: 'HTML', image: 'an image', link_open: 'a link', fence: 'a fenced block' };
/** Why a markdown value is refused, as a phrase ("holds an image"), or null: any token outside what a returned value may hold. */

function markdownRefusal(md) {
  const walk = (tokens) => {
    for (const t of tokens) {
      if (!ALLOWED_TOKENS.has(t.type)) return `holds ${REFUSED_WHY[t.type] ?? t.type}`;
      if (t.children) {
        const why = walk(t.children);
        if (why) return why;
      }
    }
    return null;
  };
  return walk(checker.parse(md, {}));
}

/**
 * Check `data` against the declared `fields` (code-shape.mjs `pluginReturnFields`). Returns `{ values }`, each
 * value as the text the host writes, or `{ violation }`, a sentence saying what broke the declaration.
 * @param {Record<string, unknown>|null} data
 * @param {Array<{ name: string, type: string, values?: string[], min?: number, max?: number }>} fields
 * @returns {{ values: Array<[string, string]> } | { violation: string }}
 */
export function checkReturnData(data, fields) {
  if (data === null || data === undefined) return { values: [] };
  const byName = new Map(fields.map((f) => [f.name, f]));
  const values = [];
  const shown = (k) => JSON.stringify(String(k).slice(0, 40));
  for (const name of Object.keys(data)) {
    const f = byName.get(name);
    if (!f) return { violation: fields.length ? `it returned ${shown(name)}, a value it did not declare` : 'it returned data, and it declares no return fields' };
    const v = data[name];
    if (f.type === 'word') {
      if (typeof v !== 'string' || !f.values.includes(v)) return { violation: `its ${name} is not one of the words it declared` };
      values.push([name, v]);
    } else if (f.type === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v)) return { violation: `its ${name} is not a finite number` };
      if ((f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max)) return { violation: `its ${name} is outside the range it declared` };
      values.push([name, String(v)]);
    } else if (f.type === 'flag') {
      if (typeof v !== 'boolean') return { violation: `its ${name} is not true or false` };
      values.push([name, String(v)]);
    } else if (f.type === 'text' || f.type === 'markdown') {
      if (typeof v !== 'string') return { violation: `its ${name} is not text` };
      // The RAW length is held too: a million removable characters around three real ones would pass a check made only
      // after cleaning, and each one crosses the frame and sits in the memo (the red team).
      if (v.length > 2 * f.max) return { violation: `its ${name} is ${v.length} characters before cleaning, past twice the ${f.max} it declared` };
      if (LONE_SURROGATE_RE.test(v)) return { violation: `its ${name} holds a lone UTF-16 surrogate` };
      // A line break or tab in plain text becomes a space, not nothing: `one\ntwo` must not read `onetwo` (the checker).
      const clean = (f.type === 'text' ? v.replace(/[\t\n\r]+/g, ' ').replace(TEXT_CONTROL_RE, '') : v.replace(CONTROL_RE, '')).replace(TAG_CHARS_RE, '');
      if (clean.length > f.max) return { violation: `its ${name} is ${clean.length} characters, past the ${f.max} it declared` };
      if (MARKUP_RE.test(clean)) return { violation: `its ${name} holds markup, which a returned value may never carry` };
      if (f.type === 'markdown') {
        const why = markdownRefusal(clean);
        if (why) return { violation: `its ${name} ${why}, which returned markdown may not carry` };
      }
      values.push([name, clean]);
    } else {
      return { violation: `its ${name} has a type the host does not know` };
    }
  }
  return { values };
}

/** The attribute a value lands in: `data-returned-<plugin>--<name>`, under a prefix no engine or runtime code reads. A field name holds no `--`, so the last `--` marks where it begins. */
export const returnAttr = (plugin, name) => `${RETURN_ATTR_PREFIX}${plugin}--${name}`;

// One renderer for a consumer that SHOWS a markdown value: HTML off, and the rules a value may not use turned off.
const renderer = new MarkdownIt({ html: false, linkify: false, typographer: false }).disable(['image', 'link', 'autolink', 'fence', 'html_inline', 'html_block']);

/** A markdown value as HTML, allowing exactly what `checkReturnData` let through. For a value that passed the check. */
export function renderReturnMarkdown(md) {
  return renderer.render(String(md ?? ''));
}
