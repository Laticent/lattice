/**
 * find-address-strings.js — `findAddressStrings` (lib/core/css-scan.js) as it was before the security spine's P2
 * rebuilt it on `cssRefSpans`' declaration channel.
 *
 * Frozen verbatim from lib/core/css-scan.js at 158a43c (the helpers it reads are copied beside it). It is the ORACLE
 * for test/unit/core/css-decl-readers-differential.test.js: the rebuilt reader must report everything this reported.
 * Nothing in lib/ may read it. Do not fix bugs here. Delete it when nobody reads it.
 */
const IMAGESET_NAME = /^(?:-webkit-)?image-set$/;

const ADDRESS_START = /^(?:(?:https?|wss?|ftp|file|blob|javascript|vbscript):|\/\/|\\\\|\\\/|\/\\)/i;

function isAddressString(v) {
  // A URL parser deletes tab, LF and CR from ANYWHERE in the input, so `ht\9 tps://x` is `https://x`
  // (the checker, 2026-10-19: Chromium fetched it). Delete them before the test, as it does.
  const u = String(v).replace(/[\t\n\r]/g, '');
  let k = 0;
  while (k < u.length && u.charCodeAt(k) <= 32) k++;
  return ADDRESS_START.test(u.slice(k));
}

function readEscape(s, i) {
  const hex = /^\\([0-9a-fA-F]{1,6})[ \t\n\r\f]?/.exec(s.slice(i, i + 9));
  if (hex) {
    const cp = parseInt(hex[1], 16);
    return [cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : '\uFFFD', i + hex[0].length];
  }
  if (s[i + 1] === '\n') return ['', i + 2]; // a line continuation, inside a string
  return [s[i + 1] ?? '', i + 2];
}

const isNameChar = (c) => /[A-Za-z0-9_\\-]/.test(c) || c.charCodeAt(0) > 0x7f;

function findAddressStrings(src) {
  // CSS's preprocessing first: CRLF, a lone CR and FF are each one newline before the tokenizer
  // runs. Skipping it let a bare CR end a string for the browser and not for this walk, which then
  // read the next custom property as text (the checker, 2026-10-19). `at[k]` maps back to `src`.
  let s = '';
  const at = [];
  for (let k = 0; k < src.length; k++) {
    const c = src[k];
    if (c === '\r' && src[k + 1] === '\n') continue; // the LF that follows stands for both
    s += c === '\r' || c === '\f' ? '\n' : c;
    at.push(k);
  }
  const out = [];
  const fns = []; // the open functions, innermost last, lowercased
  // How many open functions are image-set: a count, not a scan of `fns` per string, which was
  // quadratic on `(` repeated (29 s on 160 KB, the checker).
  let imageSets = 0;
  let urlStart = 0; // where the open quoted url( began, so its finding points at the url itself
  let prop = ''; // the declaration (or descriptor) a value belongs to, '' outside one
  let i = 0;
  const readName = () => {
    let name = '';
    while (i < s.length && isNameChar(s[i])) {
      if (s[i] === '\\') {
        if (s[i + 1] === '\n' || s[i + 1] == null) break;
        const [d, n] = readEscape(s, i);
        name += d;
        i = n;
      } else name += s[i++];
    }
    return name;
  };
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'") {
      const start = i;
      let v = '';
      i++;
      while (i < s.length && s[i] !== c && s[i] !== '\n') {
        if (s[i] === '\\') {
          const [d, n] = readEscape(s, i);
          v += d;
          i = n;
        } else v += s[i++];
      }
      i++;
      const inner = fns[fns.length - 1];
      if (inner === 'url') {
        out.push({ kind: 'url', value: `${c}${v}${c}`, index: at[urlStart] ?? at[start] });
      } else if (inner !== 'type' && imageSets > 0) out.push({ kind: 'image-set', value: v, index: at[start] });
      else if ((prop.startsWith('--') || prop === 'initial-value') && isAddressString(v)) {
        out.push({ kind: 'var', value: v.trim(), index: at[start], where: prop === 'initial-value' ? 'an `@property` initial-value' : `the custom property \`${prop}\`` });
      }
    } else if (c === ';' || c === '{' || c === '}') {
      if (fns.length === 0) prop = '';
      i++;
    } else if (c === '(') {
      fns.push('');
      i++;
    } else if (c === ')') {
      if (IMAGESET_NAME.test(fns.pop() ?? '')) imageSets--;
      i++;
    } else if (isNameChar(c) && !/[0-9]/.test(c)) {
      const name = readName();
      if (!name) {
        i++;
        continue;
      }
      if (s[i] === '(') {
        const fn = name.toLowerCase();
        i++;
        if (fn === 'url') {
          // An unquoted url( … ) run is one token: read it whole (escapes decoded, as the tokenizer
          // decodes them), so nothing in it reads as a string, and report its target. A run with no
          // closing `)` is cut at the end of the sheet, as CSS cuts a bad url, and still reported.
          const startUrl = i - 4;
          let k = i;
          while (/[ \t\n\r\f]/.test(s[k] ?? '')) k++;
          if (s[k] !== '"' && s[k] !== "'") {
            let v = '';
            i = k;
            while (i < s.length && s[i] !== ')') {
              if (s[i] === '\\') {
                const [d, n] = readEscape(s, i);
                v += d;
                i = n;
              } else v += s[i++];
            }
            i++;
            out.push({ kind: 'url', value: v.replace(/[ \t\n\r\f]+$/, ''), index: at[startUrl] ?? at[k] });
            continue;
          }
          urlStart = i - 4;
        }
        fns.push(fn);
        if (IMAGESET_NAME.test(fn)) imageSets++;
      } else if (fns.length === 0) {
        let k = i;
        while (/[ \t\n\r\f]/.test(s[k] ?? '')) k++;
        if (s[k] === ':') prop = name.startsWith('--') ? name : name.toLowerCase();
      }
    } else i++;
  }
  return out;
}

module.exports = { findAddressStrings };
