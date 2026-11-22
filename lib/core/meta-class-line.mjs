/**
 * lib/core/meta-class-line.mjs
 *
 * ONE LINE THAT SETS A SLIDE'S CLASS, read and extended in the one spelling Lattice writes (`<!-- @meta{…} -->`, record
 * note §15). The image lint's `![bg]` fix and the gallery dark pass both add a word to a slide's class line: an old
 * `<!-- _class: a -->` becomes `<!-- @meta{…} -->` in its place, and a record gains the word in its `class` field, every
 * other field kept as written. A plugin reaches it through `ctx.meta` (lib/core/plugin-ctx.js), never by import.
 *
 * Pure, fs-free.
 */

import { metaClass } from './meta-comment.mjs';
import { encodeCommentText, readRecord, recordParts } from './meta-door.mjs';
import { recordValue } from './meta-internal.mjs';

export { metaClass };

/** A whole line holding one record comment (`@meta{…}`, or the bare `{…}`) that reads: its parts and class words, or null. */
function recordLineParts(line) {
  const m = /^\s*<!--(\s*(?:@meta)?\{[^\n]*)-->\s*$/.exec(String(line));
  if (!m || m[1].includes('-->') || m[1].includes('<!--')) return null;
  const parts = recordParts(m[1]);
  const read = parts && readRecord(m[1]);
  if (!read?.ok) return null;
  return { parts, words: String(read.d.class ?? '').split(/\s+/).filter(Boolean) };
}

/** An old slide class comment alone on its line (`<!-- _class: a b -->`): its words, or null (a running `class:` too). */
function oldClassWords(line) {
  const text = String(line);
  const open = text.indexOf('<!--');
  const close = text.lastIndexOf('-->');
  if (open < 0 || close < open + 4 || text.slice(0, open).trim() || text.slice(close + 3).trim()) return null;
  const inner = text.slice(open + 4, close);
  if (inner.includes('-->') || inner.includes('<!--')) return null;
  const key = /^\s*_class\s*:/.exec(inner);
  return key ? inner.slice(key[0].length).trim().split(/\s+/).filter(Boolean) : null;
}

/** Does this line set the slide's own class: an old `<!-- _class: … -->`, or a one-line record with a class-shaped field? */
export function isClassLine(line) {
  if (/^\s*<!--\s*_class\s*:/.test(String(line))) return true;
  const rec = recordLineParts(line);
  return !!rec && rec.words.length > 0;
}

/**
 * The slide's class line with one more word, as a record; the line itself when it already has the word; null when it is
 * neither an old class comment nor a one-line record.
 * @param {string} line
 * @param {string} word
 * @returns {string|null}
 */
export function classLineWith(line, word) {
  const text = String(line);
  const indent = /^\s*/.exec(text)[0];
  const rec = recordLineParts(text);
  if (rec) {
    if (rec.words.includes(word)) return line;
    const at = rec.parts.items.findIndex((it) => it.name === 'class' && it.value !== null);
    const items = rec.parts.items.map((it) => it.text);
    if (at >= 0) items[at] = `class=${recordValue(`${rec.parts.items[at].value.trim()} ${word}`)}`;
    else items.push(`class=${recordValue(word)}`);
    return `${indent}<!--${encodeCommentText(`${rec.parts.lead}{${items.join(', ')}}${rec.parts.tail}`)}-->`;
  }
  const words = oldClassWords(text);
  if (!words) return null;
  if (words.includes(word)) return line;
  return indent + metaClass([...words, word].join(' '));
}

export default { classLineWith, isClassLine, metaClass };
