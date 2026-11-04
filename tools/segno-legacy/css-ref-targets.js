/**
 * css-ref-targets.js — the code door's `cssRefTargets` (lib/core/door-attr.mjs) as it was before the security spine's P2
 * rebuilt it on `cssRefSpans`' declaration channel.
 *
 * Frozen verbatim from lib/core/door-attr.mjs at 158a43c. It is the ORACLE for
 * test/unit/core/css-decl-readers-differential.test.js: the rebuilt reader must report everything this reported.
 * Nothing in lib/ may read it. Do not fix bugs here. Delete it when nobody reads it.
 */
const { cssEscape, cssString } = require('../../lib/core/css-token-readers.js');

/** A string a URL parser would read as a network address: a scheme, `//`, or a backslash pair (leading control characters and spaces are skipped, as a parser skips them). */
const ADDRESS_START = /^(?:(?:https?|wss?|ftp|file|blob|javascript|vbscript):|\/\/|\\\\|\\\/|\/\\)/i;
function isAddressString(v) {
  // A URL parser deletes tab, LF and CR anywhere in the input (`ht\9 tps:` is `https:`), then skips leading control characters and spaces.
  const u = String(v).replace(/[\t\n\r]/g, '');
  let k = 0;
  while (k < u.length && u.charCodeAt(k) <= 32) k++;
  return ADDRESS_START.test(u.slice(k));
}

/** Is the next significant character at `i` a `:`, skipping whitespace and comments? A plain scan: a regex for this backtracks on `/*` repeated (CodeQL). */
function colonFollows(s, i) {
  while (i < s.length) {
    if (/\s/.test(s[i])) i++;
    else if (s[i] === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2);
      if (end < 0) return false;
      i = end + 2;
    } else return s[i] === ':';
  }
  return false;
}

function cssRefTargets(css) {
  // CSS's preprocessing: CRLF, CR and FF are each one newline before the tokenizer runs, so a string ends where the browser ends it.
  const s = String(css ?? '').replace(/\r\n?|\f/g, '\n');
  const out = [];
  let depth = 0;
  let i = 0;
  // A string held in a custom property is text until something reads it where an address goes:
  // `--q:"https://x/y"` on a parent and `background:image-set(var(--q) 1x)` on a CHILD fetches it
  // (the red team and the checker, 2026-10-18). Inheritance crosses attributes and elements, so no
  // look at the same value can tell whether it will be read. An ADDRESS-SHAPED string (a network
  // scheme, or `//` or a backslash pair, which a URL parser reads as one) is therefore listed from
  // any custom property. A label that merely holds `/` or `:` (`--sep:"/"`, `--t:"10:30"`) is text.
  let custom = false;
  // remote-ref.js's string reader, so a form feed or a carriage return ends a string here as it
  // does in the browser (and in the web-image gate).
  const readString = () => {
    const [v, next] = cssString(s, i);
    i = next;
    return v;
  };
  while (i < s.length) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2);
      i = end < 0 ? s.length : end + 2;
    } else if (c === '"' || c === "'") {
      const v = readString();
      if (depth > 0) out.push(v.trim());
      else if (custom && isAddressString(v)) out.push(v.trim());
    } else if (c === ';' || c === '}' || c === '{') {
      custom = false;
      i++;
    } else if (c === '(') {
      depth++;
      i++;
    } else if (c === ')') {
      depth = Math.max(0, depth - 1);
      i++;
    } else if (/[A-Za-z_\\-]/.test(c)) {
      let name = '';
      while (i < s.length && /[A-Za-z0-9_\\-]/.test(s[i])) {
        if (s[i] === '\\') {
          const [d, n] = cssEscape(s, i);
          name += d;
          i = n;
        } else name += s[i++];
      }
      if (depth === 0 && name.startsWith('--') && colonFollows(s, i)) custom = true;
      if (s[i] === '(' && name.toLowerCase() === 'url') {
        i++;
        while (/[ \t\n\r\f]/.test(s[i] ?? '')) i++;
        if (s[i] === '"' || s[i] === "'") {
          out.push(readString().trim());
          while (i < s.length && s[i] !== ')') i++;
          i++;
          continue;
        }
        let v = '';
        while (i < s.length && s[i] !== ')') {
          if (s[i] === '\\') {
            const [d, n] = cssEscape(s, i);
            v += d;
            i = n;
          } else v += s[i++];
        }
        i++;
        out.push(v.trim());
      }
    } else i++;
  }
  return out;
}

module.exports = { cssRefTargets };
