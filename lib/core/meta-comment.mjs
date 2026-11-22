/**
 * lib/core/meta-comment.mjs
 *
 * THE ONE SPELLING A WRITER EMITS: `<!-- @meta{layout=cards, footer="Q3"} -->` (owner, 2026-11-22: "let's just keep
 * @meta only", amending D5 of engineering/decisions/2026-10-17-meta-record.md). Every Lattice writer that puts slide
 * settings into a deck (the Studio's structured edit, Compose, the component skeletons, the gallery generators, the
 * Studio templates, the AI prompts) builds its comment here, so none of them writes `<!-- _class: … -->` or the bare
 * `<!-- {…} -->` again.
 *
 * A `class` value is written the way `lattice migrate meta` writes it (lib/cli/meta-migrate.mjs `recordForComment`):
 * its FIRST word, when it names a catalog component and no word repeats, becomes the typed `layout=` field and the rest
 * stays `class=`. Only the first word, because the door composes typed words first: `_class: cards dark` and
 * `@meta{layout=cards, class=dark}` render the same `<section class>` in the same order.
 *
 * Pure, fs-free, ESM; shipped to the browser (the Studio), so it imports only small kernels.
 */

import STAGE_CATALOG from '../forms/cell/masthead/stage-catalog.generated.js';
import { encodeCommentText, recordValue } from './meta-internal.mjs';

/** Every component a `layout=` field may name: the catalog's stage map (components, chart kinds, sovereign frames). */
export const LAYOUT_NAMES = /* @__PURE__ */ new Set(Object.keys(STAGE_CATALOG));

const kebab = (s) => String(s).replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** A value on one line: Segno reads a record value to the line's end, so line breaks fold to single spaces. Linear. */
const oneLine = (v) =>
  String(v)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');

/**
 * The record items for a class string: `cards dark` → `layout=cards, class=dark`; `dark cards` → `class="dark cards"`.
 * @param {string} value
 * @returns {string[]}
 */
export function classFields(value) {
  const words = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  if (LAYOUT_NAMES.has(words[0]) && new Set(words).size === words.length) {
    const rest = words.slice(1).join(' ');
    return [`layout=${words[0]}`, ...(rest ? [`class=${recordValue(rest)}`] : [])];
  }
  return [`class=${recordValue(words.join(' '))}`];
}

/**
 * The record text (`{…}`, no comment) for an ordered set of settings.
 *   · `class` is typed (see the module header);
 *   · a camelCase directive key is kebab-cased (`backgroundColor` → `background-color`);
 *   · `true` writes a bare flag (`build`), `false`/`null`/`undefined`/'' writes nothing;
 *   · `{ carry: true }` adds the `carry` flag (the value runs on to later slides, as a `<!-- key: v -->` comment did).
 * @param {Record<string, string|number|boolean|null|undefined> | Array<[string, any]>} fields
 * @param {{carry?: boolean}} [opts]
 * @returns {string}
 */
export function metaRecord(fields, { carry = false } = {}) {
  const entries = Array.isArray(fields) ? fields : Object.entries(fields ?? {});
  const items = [];
  for (const [key, v] of entries) {
    if (v === false || v == null || v === '') continue;
    const name = kebab(key);
    if (name === 'class') items.push(...classFields(v));
    else if (v === true) items.push(name);
    else items.push(`${name}=${recordValue(oneLine(v))}`);
  }
  if (carry) items.push('carry');
  return `{${items.join(', ')}}`;
}

/**
 * The whole comment: `<!-- @meta{…} -->`, or '' when there is nothing to set.
 * @param {Parameters<typeof metaRecord>[0]} fields
 * @param {{carry?: boolean}} [opts]
 * @returns {string}
 */
export function metaComment(fields, opts) {
  const rec = metaRecord(fields, opts);
  // A value holding `-->` or `--!>` is escaped at the carrier, the inverse of the door's decode.
  return rec === '{}' ? '' : `<!-- @meta${encodeCommentText(rec)} -->`;
}

/** Shorthand for the commonest writer: a slide's layout (`metaClass('cards dark')`). */
export const metaClass = (value) => metaComment({ class: value });

export default { classFields, LAYOUT_NAMES, metaClass, metaComment, metaRecord };
