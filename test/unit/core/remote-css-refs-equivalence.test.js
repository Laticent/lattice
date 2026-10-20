/**
 * `remoteCssRefs` feeds the preview frame's content-security policy (HARD RULE #22), and the first render
 * pays for it on the whole stylesheet (followup 2794-p7: 73 ms to 2 ms on the 966 KB sheet). It jumps to
 * the next quote, backslash, comment opener or `url(` instead of walking every character. This test keeps
 * the character-by-character tokenizer it replaced as the REFERENCE and requires the same references from
 * both, on the real sheet, on the spellings the tokenizer exists for, and on random strings built from
 * the parts that could make them disagree.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { remoteCssRefs, isRemoteUrl } = require('../../../lib/core/remote-ref.js');

function cssEscape(s, i) {
  const hex = /^[0-9a-fA-F]{1,6}[ \t\n\r\f]?/.exec(s.slice(i + 1, i + 8));
  if (hex) {
    const cp = Number.parseInt(hex[0], 16);
    return [cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '�', i + 1 + hex[0].length];
  }
  return [s[i + 1] ?? '', i + 2];
}

/** The tokenizer as it was before the jump-ahead: one character at a time. */
function reference(css) {
  const s = String(css ?? '');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2);
      i = end < 0 ? s.length : end + 2;
    } else if (c === '"' || c === "'") {
      let v = '';
      i++;
      while (i < s.length && s[i] !== c && s[i] !== '\n') {
        if (s[i] === '\\') {
          const [d, n] = cssEscape(s, i);
          v += d === '\n' ? '' : d;
          i = n;
        } else v += s[i++];
      }
      i++;
      if (isRemoteUrl(v)) out.push(v);
    } else if (/[A-Za-z_\\-]/.test(c)) {
      let name = '';
      while (i < s.length && /[A-Za-z0-9_\\-]/.test(s[i])) {
        if (s[i] === '\\') {
          const [d, n] = cssEscape(s, i);
          name += d;
          i = n;
        } else name += s[i++];
      }
      if (s[i] === '(' && name.toLowerCase() === 'url') {
        i++;
        while (/[ \t\n\r\f]/.test(s[i] ?? '')) i++;
        if (s[i] === '"' || s[i] === "'") continue;
        let v = '';
        while (i < s.length && s[i] !== ')') {
          if (s[i] === '\\') {
            const [d, n] = cssEscape(s, i);
            v += d;
            i = n;
          } else v += s[i++];
        }
        if (isRemoteUrl(v.trim())) out.push(v.trim());
      }
    } else i++;
  }
  return out;
}

const CASES = [
  'a{background:u\\72l(https://x.com/a)}',
  'a{b:"/*"} url(https://e.com/1) /* url(https://c.com) */',
  'a{b:url("https://e.com/)")}',
  'a{b:url( https://e.com/x\\)y )}',
  '@import "https://i.com/x.css";',
  '-\\75rl(https://z.com/q)',
  'xurl(https://no.com/a) 1url(https://yes.com/a) -url(https://no.com/b) a1url(https://no.com/c)',
  'URL(https://upper.com/a) Url(https://mixed.com/a)',
  '\\78 url(https://no.com/d)',
  'a{b:"unterminated\nurl(https://n.com/a)',
  'url(\\', '\\', 'a\\', 'a\\41 b(c)', '/*', '/* never closed url(https://c.com)', '/',
];

test('remoteCssRefs matches the character-by-character tokenizer on the shipped stylesheet', () => {
  const sheet = path.join(__dirname, '../../../dist/lattice-min.css');
  if (!fs.existsSync(sheet)) return; // dist/ is built on install; nothing to compare without it
  const css = fs.readFileSync(sheet, 'utf8');
  assert.deepEqual(remoteCssRefs(css), reference(css));
});

test('remoteCssRefs matches the tokenizer on the spellings it exists for', () => {
  for (const c of CASES) assert.deepEqual(remoteCssRefs(c), reference(c), JSON.stringify(c));
});

test('remoteCssRefs matches the tokenizer on 60,000 random strings of the parts that could make them disagree', () => {
  const parts = ['u', 'r', 'l', 'U', 'R', 'L', '(', ')', '"', "'", '\\', '/', '*', ' ', '\n', '-', '_', 'a', '1', '7', '2', ':', 'h', 't', 'p', 's', '.', 'x', ';', 'url(', 'URL(', 'https://a.io/', '\\72l(', '/*', '*/', '\\75 '];
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let k = 0; k < 60000; k++) {
    let t = '';
    for (let j = 1 + Math.floor(rnd() * 30); j > 0; j--) t += parts[Math.floor(rnd() * parts.length)];
    assert.deepEqual(remoteCssRefs(t), reference(t), JSON.stringify(t));
  }
});

test('remoteCssRefs stays linear on a long digit run before a hint (the jump once re-scanned the run per digit)', () => {
  for (const tail of ['url(https://a.io/x)', '\\41', '\\75rl(https://a.io/y)']) {
    const css = 'a{b:' + '0'.repeat(80000) + tail + '}';
    const t = Date.now();
    const got = remoteCssRefs(css);
    assert.ok(Date.now() - t < 250, `80,000 digits before ${tail} took ${Date.now() - t} ms`);
    assert.deepEqual(got, reference(css));
  }
});
