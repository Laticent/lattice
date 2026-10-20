/**
 * A plugin's `styles.css`, held to ONE shape and rebuilt so it can only style its own drawing.
 *
 * The first cut wrapped the sheet text in `[data-lattice-plugin="x"] { … }` and trusted CSS nesting. Three reviews showed
 * it was not a boundary: a stray `}` closes the wrapper and the rest of the sheet is top level (`section { visibility:hidden }`
 * restyled every slide), and nesting alone lets `& ~ *` or `section:has(&)` reach the author's own content. The sheet is
 * not pinned into the consent digest (it is data), so scoping is the only thing standing between an approved plugin and
 * the whole deck.
 *
 * So the sheet is PARSED and REBUILT, never wrapped. `scopeSheet` reads it as a list of rules, refuses anything outside the
 * shape below, and writes every selector back with the plugin's root in front of it, so no input can end the wrapper or reach a
 * sibling: the output is made from the parsed rules, not from the text.
 *
 *   allowed   style rules (`a, b { declarations }`) and `@media` / `@supports` blocks of style rules
 *   refused   an unbalanced brace, a nested rule inside a declaration block, a selector with `&` or a leading combinator
 *             (`> x`, `~ x`, `+ x`), and every other at-rule: `@import`, `@charset`, `@font-face`, `@keyframes`, `@layer`,
 *             `@property`, `@container`, `@scope`, `@namespace`, `@page`
 *
 * Pure and dependency-free (the Studio's light door chunk imports it). `findCssExfil` (lib/core/css-scan.js) still gates
 * `url()` and `@import`; `sanitizeStyleText` still guards the `</style` terminator (HARD RULE #22).
 */

const SHEET_MAX = 200_000;
const ALLOWED_AT = new Set(['media', 'supports']);

/** Reads `text` as a flat list of top-level items; throws a message on a shape this module refuses. */
function scan(text, depth) {
  const items = [];
  let i = 0;
  const n = text.length;
  // `until` ends a prelude; returns the prelude text and the stop character ('{', ';' or '').
  const readPrelude = () => {
    let out = '';
    let paren = 0;
    while (i < n) {
      const c = text[i];
      if (c === '/' && text[i + 1] === '*') {
        const end = text.indexOf('*/', i + 2);
        if (end === -1) throw new Error('an unclosed comment');
        out += ' ';
        i = end + 2;
      } else if (c === '"' || c === "'") {
        const end = stringEnd(text, i);
        out += text.slice(i, end);
        i = end;
      } else if (c === '\\') {
        out += text.slice(i, i + 2);
        i += 2;
      } else if (c === '(' || c === '[') {
        paren++;
        out += c;
        i++;
      } else if (c === ')' || c === ']') {
        paren = Math.max(0, paren - 1);
        out += c;
        i++;
      } else if (c === '}') {
        throw new Error('a closing brace with no rule to close');
      } else if (paren === 0 && (c === '{' || c === ';')) {
        return { prelude: out.trim(), stop: c };
      } else {
        out += c;
        i++;
      }
    }
    return { prelude: out.trim(), stop: '' };
  };
  // The text between the `{` at `i - 1` and its matching `}`, comments removed; strings and escapes kept whole.
  const readBlock = () => {
    let out = '';
    let level = 1;
    while (i < n) {
      const c = text[i];
      if (c === '/' && text[i + 1] === '*') {
        const end = text.indexOf('*/', i + 2);
        if (end === -1) throw new Error('an unclosed comment');
        out += ' ';
        i = end + 2;
      } else if (c === '"' || c === "'") {
        const end = stringEnd(text, i);
        out += text.slice(i, end);
        i = end;
      } else if (c === '\\') {
        out += text.slice(i, i + 2);
        i += 2;
      } else if (c === '{') {
        level++;
        out += c;
        i++;
      } else if (c === '}') {
        level--;
        i++;
        if (level === 0) return out;
        out += '}';
      } else {
        out += c;
        i++;
      }
    }
    throw new Error('a brace that is never closed');
  };
  for (;;) {
    const { prelude, stop } = readPrelude();
    if (stop === '') {
      if (prelude) throw new Error('text after the last rule that is not a rule');
      return items;
    }
    i++;
    if (stop === ';') {
      if (prelude) throw new Error(`the statement \`${prelude.slice(0, 40)}\``);
      continue;
    }
    items.push({ prelude, body: readBlock(), depth });
  }
}

/** The index after the string that opens at `start`; throws on an unclosed one. */
function stringEnd(text, start) {
  const q = text[start];
  for (let j = start + 1; j < text.length; j++) {
    if (text[j] === '\\') j++;
    else if (text[j] === q) return j + 1;
    else if (text[j] === '\n') break;
  }
  throw new Error('an unclosed string');
}

/** Is there a `{` outside a string or an escape: the sign of a rule nested in a declaration block. */
function hasBrace(body) {
  for (let j = 0; j < body.length; j++) {
    const c = body[j];
    if (c === '"' || c === "'") j = stringEnd(body, j) - 1;
    else if (c === '\\') j++;
    else if (c === '{') return true;
  }
  return false;
}

/** Splits a selector list at its top-level commas (not inside parentheses, brackets or strings). */
function splitSelectors(prelude) {
  const out = [];
  let cur = '';
  let depth = 0;
  for (let j = 0; j < prelude.length; j++) {
    const c = prelude[j];
    if (c === '"' || c === "'") {
      const end = stringEnd(prelude, j);
      cur += prelude.slice(j, end);
      j = end - 1;
    } else if (c === '\\') {
      cur += prelude.slice(j, j + 2);
      j++;
    } else if (c === '(' || c === '[') {
      depth++;
      cur += c;
    } else if (c === ')' || c === ']') {
      depth--;
      cur += c;
    } else if (c === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

function rebuild(text, root, depth) {
  let out = '';
  for (const item of scan(text, depth)) {
    if (item.prelude.startsWith('@')) {
      const name = /^@([a-z-]+)/i.exec(item.prelude)?.[1]?.toLowerCase() ?? '';
      if (!ALLOWED_AT.has(name)) throw new Error(`\`@${name || '?'}\`, which a plugin stylesheet may not use`);
      if (depth >= 1) throw new Error(`\`@${name}\` inside another at-rule`);
      out += `${item.prelude} {\n${rebuild(item.body, root, depth + 1)}}\n`;
      continue;
    }
    if (!item.prelude) throw new Error('a block with no selector');
    if (hasBrace(item.body)) throw new Error('a rule nested inside a declaration block');
    const selectors = splitSelectors(item.prelude);
    for (const s of selectors) {
      if (!s) throw new Error('an empty selector');
      if (s.includes('&')) throw new Error(`the selector \`${s.slice(0, 40)}\`, which uses \`&\``);
      if (/^[>+~]/.test(s)) throw new Error(`the selector \`${s.slice(0, 40)}\`, which starts with a combinator`);
    }
    out += `${selectors.map((s) => `${root} ${s}`).join(',\n')} {${item.body}}\n`;
  }
  return out;
}

/**
 * The sheet rebuilt under `root` (a selector such as `[data-lattice-plugin="gantt"]`), or why it cannot be.
 * @param {string} css
 * @param {string} root
 * @returns {{ css: string } | { refusal: string }}
 */
export function scopeSheet(css, root) {
  const text = String(css ?? '');
  if (!text.trim()) return { css: '' };
  if (text.length > SHEET_MAX) return { refusal: `it is ${text.length} characters, past the ${SHEET_MAX} a plugin stylesheet may hold` };
  try {
    return { css: rebuild(text, root, 0) };
  } catch (e) {
    return { refusal: e instanceof Error ? e.message : String(e) };
  }
}

/** Why a plugin's `styles.css` is refused at the gate, or null. The same read `scopeSheet` makes, so a sheet the gate admits always scopes. */
export function pluginCssRefusal(css) {
  const r = scopeSheet(css, '[x]');
  return 'refusal' in r ? `its styles.css holds ${r.refusal}` : null;
}
