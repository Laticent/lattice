/**
 * lib/plugins/image/shared/image-migrate.js — MARP'S ALT-TEXT KEYWORDS TO MARKDOWN'S PICTURE (engineering/decisions/
 * 2026-10-16-media-plugins.md §8 decision 2: a clean break, with an autofix). Pure, fs-free: the plugin's lint rule
 * (`image-marp-keyword`, which `lint:deck --fix` and the Studio's "Fix all" apply) and the sweep of the shipped decks read this
 * one kernel.
 *
 * A line `![bg left:40% blur](photo.jpg "The field team")` becomes `![The field team](photo.jpg)`: the `@image{…}` record's
 * shortcut, which a slide that places a picture draws as its photo (lib/core/placed-picture.mjs). The old description becomes
 * the picture's name, as Compose's Placement control does (docs/src/lib/compose/image-objects.ts `asPlainPicture`), and the
 * PLACEMENT the keywords carried moves to the slide, where it belongs (§4.7 rule 1):
 *
 *   on an `image` slide     `left` becomes the layout's `mirror` (the two always drew the same; image.styles.css)
 *   on any other slide      the picture was the slide's background, so the slide gains `bleed`
 *
 * Every other keyword is dropped, and the finding names it: a share (`left:40%`) and the filters (`blur`, `sepia`, `brightness:`)
 * were never drawn here (§3, D5), and `cover` is what a panel already does, so dropping them moves no pixel. `fit` and `contain`
 * were drawn on a slide background only; no shipped deck uses them, and the finding says what they did.
 */

/** One whole `![bg …](…)` on a line, nothing else but space. */
const LINE = /^(\s*)!\[bg((?:[^\S\r\n](?:[^\S\r\n]|[\w:%.-])*)?)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s*$/;

/**
 * A description as the picture's NAME (its alt text): one line, brackets and backslashes escaped, and a name that starts with
 * `bg` written as a sentence, so it never reads as the retired keyword (Compose's `descriptionAsAlt`).
 */
function nameOf(description) {
  const one = String(description).replace(/[\r\n]+/g, ' ').trim();
  return (/^bg(?:\s|$)/i.test(one) ? `Image: ${one}` : one).replace(/[\\[\]]/g, '\\$&');
}

/**
 * Read one line. Null when the line is not exactly one `![bg …](…)`.
 * @returns {{ indent: string, src: string, description: string, side: 'left'|'right'|null, dropped: string[] } | null}
 */
function readBgLine(line) {
  const m = LINE.exec(String(line));
  if (!m) return null;
  const words = (m[2] || '').trim().split(/\s+/).filter(Boolean);
  let side = null;
  const dropped = [];
  for (const w of words) {
    const base = w.split(':')[0].toLowerCase();
    if ((base === 'left' || base === 'right') && !side) {
      side = base;
      if (w.includes(':')) dropped.push(w.slice(w.indexOf(':')));
    } else {
      dropped.push(w);
    }
  }
  return { indent: m[1], src: m[3], description: (m[4] || '').trim(), side, dropped };
}

/**
 * The picture line and the class change for one line, on a slide with these classes. `record` is the line that replaces it:
 * Markdown's picture, which the slide (with `addClass`) places as it would place the record.
 * @param {string} line
 * @param {ReadonlyArray<string>} classes  the slide's resolved classes
 * @returns {{ record: string, addClass: string | null, dropped: string[], unsafe?: string } | null}
 */
function migrateBgLine(line, classes) {
  const r = readBgLine(line);
  if (!r) return null;
  // Four spaces in: an indented code block, which never drew a picture.
  if (/^(?: {4}|\t)/.test(r.indent)) return null;
  // Markdown decodes a character reference or a backslash escape in a destination before it loads it; the shortcut hands the
  // record the address as the author wrote it, and a record does not decode. So a destination holding either is not rewritten
  // by machine (it would load a different file, or, spelled to close `url('…')`, a different site: the red team on slice 3).
  const unsafe = /[&\\]/.test(r.src) ? 'its address holds `&` or `\\`, which Markdown decodes and a record does not' : null;
  const record = `${r.indent}![${nameOf(r.description)}](${r.src})`;
  const onImage = (classes || []).includes('image');
  let addClass = null;
  if (onImage) {
    if (r.side === 'left' && !classes.includes('mirror')) addClass = 'mirror';
  } else if (!(classes || []).includes('bleed')) {
    addClass = 'bleed';
  }
  return { record, addClass, dropped: r.dropped, ...(unsafe ? { unsafe } : {}) };
}

/**
 * A class directive comment, read without a backtracking pattern: `<!-- _class: a b -->` → its prefix, its words and its
 * close, or null when the line is not one.
 */
const CLASS_KEY = /^\s*_?class\s*:/;
function readClassComment(line) {
  const text = String(line);
  const open = text.indexOf('<!--');
  const close = text.lastIndexOf('-->');
  if (open < 0 || close < open + 4 || text.slice(0, open).trim() || text.slice(close + 3).trim()) return null;
  const inner = text.slice(open + 4, close);
  // One comment on the line, closed on it: two comments (`<!-- _class: a --><!-- _paginate: false -->`) would put the word in the
  // second one, and an unclosed one is not this line's to change.
  if (inner.includes('-->') || inner.includes('<!--')) return null;
  const key = CLASS_KEY.exec(inner);
  if (!key) return null;
  const local = /_class/.test(key[0]);
  return { head: text.slice(0, open + 4) + key[0], words: inner.slice(key[0].length).trim().split(/\s+/).filter(Boolean), tail: text.slice(close), local };
}

/** A slide's class directive line with one more word, or null when the line is not one. */
function classLineWith(line, word) {
  const c = readClassComment(line);
  if (!c) return null;
  if (c.words.includes(word)) return line;
  return `${c.head} ${[...c.words, word].join(' ')} ${c.tail}`;
}

module.exports = { readBgLine, migrateBgLine, classLineWith, readClassComment };
