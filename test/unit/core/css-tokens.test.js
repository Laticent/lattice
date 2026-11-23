/**
 * The CSS tokenizer (lib/core/css-tokens.js, from css-ref-grammar.js's `cssSheetSpec`), held to a spec tokenizer:
 * css-tree's `tokenize` (CSS Syntax 3 §4), on seeded inputs built from the fragments that make tokenizers disagree
 * (strings and comments inside each other, bad strings at each of the three newlines, every `url(` shape, escapes,
 * non-ASCII names). The inputs leave out the four places the tokenizer differs from the spec on purpose, which its
 * header lists (numbers, `\` before a newline, a `-` that starts no name), and one where css-tree differs from the
 * spec and from browsers: a `url` name spelled with escapes (`u\72l(`), which css-tree reads as a function. That one
 * is pinned below on its own, to the reading css-ref-grammar.js's header records from Chromium. css-tree also keeps the
 * newline that ends a bad string inside the token, where the spec and Chromium read it as whitespace, and ends a bad
 * url that closes on an escape at the end of the input one past the end; `oracle` corrects both. Seeded (HARD RULE #32).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const csstree = require('css-tree');
const { eachCssToken, cssTokens, tokenWork } = require('../../../lib/core/css-tokens.js');

/** mulberry32: a small seeded generator, so a failing input can be rebuilt from its seed. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FRAGMENTS = [
  'a', 'section', 'body', '--x', '--Q_r', '-webkit-mask', 'é', 'éa', '日本', '\\66 oo', '\\31 0', '\\:', 'x\\.y',
  'url(x.png)', 'url( a b )', 'url(a"b)', 'url("q")', "url('q' x)", 'URL(Y)', 'uRl(', 'url(', 'url(\\)x)', 'url( )',
  'blur(', 'image-set(', 'var(', 'light-dark(', 'not(',
  ' ', '  ', '\t', '\n', '\r\n', '\r', '\f',
  '{', '}', '(', ')', '[', ']', ';', ':', ',', '.', '>', '*', '!', '%', '=', '~', '+', '|', '&', '?', '$', '^',
  '"a"', '"a\\"b"', "'/*'", '"*/"', '"open\n', "'open\r", '"open\f', '"\\66"',
  '/*c*/', '/*', '*/', '/', '/**/', '/* "q" */', "/* 'q */",
  '@import', '@font-face', '@media', '@', '@-x', '@--y', '@\\69mport',
  '#', '#id', '#-a', '#é',
];

/** One input: 1 to 40 fragments, joined. */
function input(next) {
  const k = 1 + Math.floor(next() * 40);
  let s = '';
  for (let i = 0; i < k; i++) s += FRAGMENTS[Math.floor(next() * FRAGMENTS.length)];
  return s;
}

/** css-tree's tokens, in this tokenizer's vocabulary; a run of `other` is one token. */
function oracle(css) {
  const names = csstree.tokenNames;
  const map = {
    'ident-token': 'ident', 'function-token': 'function', 'at-keyword-token': 'at', 'hash-token': 'hash',
    'string-token': 'string', 'bad-string-token': 'string', 'url-token': 'url', 'bad-url-token': 'url',
    'whitespace-token': 'ws', 'comment-token': 'comment', 'delim-token': 'other',
    'colon-token': ':', 'semicolon-token': ';', 'comma-token': ',', '[-token': '[', ']-token': ']', '(-token': '(', ')-token': ')',
    '{-token': '{', '}-token': '}',
  };
  const out = [];
  csstree.tokenize(css, (type, from, end) => {
    // css-tree ends a bad url that closes on an escape at the end of the input one past the end (57 of 56).
    const to = Math.min(end, css.length);
    const t = map[names[type]];
    if (!t) throw new Error(`the generator made a ${names[type]} in ${JSON.stringify(css)}`);
    // css-tree keeps the newline that ends a bad string inside the token; CSS Syntax 3 §4.3.5 reconsumes it as
    // whitespace, as Chromium does (css-ref-grammar.js's header).
    if (names[type] === 'bad-string-token' && /[\n\r\f]$/.test(css.slice(from, to))) {
      const nl = css.slice(to - 2, to) === '\r\n' ? 2 : 1;
      push(out, t, from, to - nl);
      push(out, 'ws', to - nl, to);
    } else push(out, t, from, to);
  });
  return out;
}

function push(out, type, from, to) {
  const last = out[out.length - 1];
  if ((type === 'other' || type === 'ws') && last?.type === type && last.to === from) last.to = to;
  else out.push({ type, from, to });
}

function ours(css, from, to) {
  const out = [];
  eachCssToken(css, (type, a, b) => push(out, type, a, b), from, to);
  return out;
}

const SEED = 0x5c55;

test('css-tokens: every token css-tree reads, at the same span (4,000 seeded inputs)', () => {
  const next = rng(SEED);
  let urls = 0;
  for (let i = 0; i < 4000; i++) {
    const css = input(next);
    const got = ours(css);
    const want = oracle(css);
    urls += got.filter((t) => t.type === 'url').length;
    assert.deepEqual(got, want, `seed ${SEED}, input ${i}: ${JSON.stringify(css)}`);
  }
  // The inputs reach the url token often enough to mean something.
  assert.ok(urls > 1000, `only ${urls} url tokens`);
});

test('css-tokens: the tokens cover the input exactly, and an island reads in its host coordinates', () => {
  const next = rng(SEED + 1);
  for (let i = 0; i < 2000; i++) {
    const css = input(next);
    const toks = cssTokens(css);
    assert.equal(toks.map((t) => css.slice(t.from, t.to)).join(''), css, `input ${i}`);
    for (let k = 1; k < toks.length; k++) assert.equal(toks[k].from, toks[k - 1].to);
    // An island: the same tokens as the slice on its own, moved by its start.
    const a = Math.floor(next() * (css.length + 1));
    const b = a + Math.floor(next() * (css.length - a + 1));
    const host = `p{x:"${'h'.repeat(3)}"}${css}`;
    const shift = host.length - css.length;
    const island = cssTokens(host, shift + a, shift + b).map((t) => ({ ...t, from: t.from - shift - a, to: t.to - shift - a }));
    assert.deepEqual(island, cssTokens(css.slice(a, b)), `input ${i}, island [${a}, ${b})`);
  }
});

test('css-tokens: a url name spelled with escapes is a url token, as Chromium reads it (css-tree does not)', () => {
  const kinds = (css) => cssTokens(css).map((t) => [t.type, css.slice(t.from, t.to)]);
  assert.deepEqual(kinds('u\\72l(x)'), [['url', 'u\\72l(x)']]);
  assert.deepEqual(kinds('\\55 RL(x)'), [['url', '\\55 RL(x)']]);
  assert.deepEqual(kinds('\\000075rl( x )'), [['url', '\\000075rl( x )']]);
  assert.deepEqual(kinds('u\\72l("x")'), [['function', 'u\\72l('], ['string', '"x"'], [')', ')']]);
});

test('css-tokens: the documented departures from the spec, pinned', () => {
  const kinds = (css) => cssTokens(css).map((t) => [t.type, css.slice(t.from, t.to)]);
  // Numbers are text, and a digit run does not hide the url after it.
  assert.deepEqual(kinds('10px'), [['other', '10'], ['ident', 'px']]);
  assert.deepEqual(kinds('1url(x)'), [['other', '1'], ['url', 'url(x)']]);
  // A `-` that starts no name still reads as one.
  assert.deepEqual(kinds('- '), [['ident', '-'], ['ws', ' ']]);
  // A backslash before a newline continues a name (CSS ends it and reads a `\` delimiter). Inside a string it is a line
  // continuation, as CSS reads it; the differential's fragments leave this out, since a quote flipping elsewhere in an
  // input would put it outside a string.
  assert.deepEqual(kinds('x\\\ny'), [['ident', 'x\\\ny']]);
  assert.deepEqual(kinds('"x\\\ny"'), [['string', '"x\\\ny"']]);
});

test('css-tokens: linear work on hostile input (counted, not timed)', () => {
  for (const [unit, urls] of [['url(', 1], ['u\\72l(a)', 1], ['/*', 0], ['"', 0], ['@', 0], ['a(', 0]]) {
    for (const n of [1000, 4000]) {
      const css = unit.repeat(n);
      const before = { ...tokenWork };
      const toks = cssTokens(css);
      const parses = tokenWork.parses - before.parses;
      const tokens = tokenWork.tokens - before.tokens;
      assert.equal(tokens, toks.length);
      assert.ok(tokens <= css.length, `${unit} x ${n}: ${tokens} tokens for ${css.length} characters`);
      // One parse, and two more per url token: its body, and the parse that resumes after it (none when the body ends
      // the input).
      const urlTokens = toks.filter((t) => t.type === 'url').length;
      const resumes = urlTokens && toks[toks.length - 1].type === 'url' ? urlTokens - 1 : urlTokens;
      assert.equal(parses, 1 + urlTokens + resumes, `${unit} x ${n}`);
      if (urls) assert.ok(urlTokens >= 1);
    }
  }
});

test('css-tokens: cssUnescape and cssStringValue decode as CSS Syntax 3 §4.3.7 does', () => {
  const { cssUnescape, cssStringValue } = require('../../../lib/core/css-tokens.js');
  assert.equal(cssUnescape('\\75 rl'), 'url');
  assert.equal(cssUnescape('\\000075rl'), 'url');
  assert.equal(cssUnescape('a\\:b'), 'a:b');
  assert.equal(cssUnescape('\\0 '), '�');
  assert.equal(cssUnescape('\\d800 x'), '�x');
  assert.equal(cssUnescape('\\110000'), '�');
  assert.equal(cssUnescape('x\\'), 'x�');
  assert.equal(cssUnescape('a\\\r\nb'), 'ab');
  const v = (css) => cssStringValue(css, 0, css.length);
  assert.deepEqual(v('"a\\"b"'), { value: 'a"b', closed: true });
  assert.deepEqual(v('"a\\\\"'), { value: 'a\\', closed: true });
  assert.deepEqual(v('"a\\"'), { value: 'a"', closed: false });
  assert.deepEqual(v("'open"), { value: 'open', closed: false });
  assert.deepEqual(v('"'), { value: '', closed: false });
});

test('css-tokens: cssImports reads each @import and the token after it', () => {
  const { cssImports } = require('../../../lib/core/css-tokens.js');
  const read = (css) => cssImports(css).map((r) => [css.slice(r.from, r.to), r.target]);
  assert.deepEqual(read("@import 'onyx';\n:root{}"), [["@import 'onyx';", { type: 'string', value: 'onyx', closed: true }]]);
  assert.deepEqual(read('@import"x"'), [['@import"x"', { type: 'string', value: 'x', closed: true }]]);
  assert.deepEqual(read('@import x;'), [['@import x;', { type: 'ident', value: 'x', closed: true }]]);
  // The whitespace and comments after the target, and one `;`, are inside the span.
  assert.deepEqual(read('@import/*a*/"y" /*n*/ ;b{}'), [['@import/*a*/"y" /*n*/ ;', { type: 'string', value: 'y', closed: true }]]);
  assert.deepEqual(read('@IMP\\6frt  url(z);'), [['@IMP\\6frt  url(z);', { type: 'url', value: 'url(z)', closed: true }]]);
  assert.deepEqual(read('@import'), [['@import', null]]);
  // Not an @import: inside a string, inside a comment, another at-keyword, an escaped `@`.
  assert.deepEqual(read('a{content:"@import \'q\'"} /* @import r; */ @importq; \\@import s;'), []);
});

test('css-tokens: a visitor may tokenize again while a walk is under way (the tape is copied per parse)', () => {
  // The generated parser keeps its tape in module state. A reader that reads a prelude while it walks a sheet
  // (lib/core/leading-is.js) tokenized inside `visit`, and the nested parse overwrote the outer walk's tape.
  const css = 'a{x:url(q)}' + 'b , c{y:z}'.repeat(50) + 'd{}';
  const flat = cssTokens(css);
  const nested = [];
  eachCssToken(css, (type, a, b) => {
    if (type === '{') cssTokens(css.slice(0, a));
    nested.push({ type, from: a, to: b });
  });
  assert.deepEqual(nested, flat);
});

test('css-tokens: cssUrls reads each url() as CSS does, with its decoded address and its raw span', () => {
  const { cssUrls } = require('../../../lib/core/css-tokens.js');
  const read = (css) => cssUrls(css).map((u) => [css.slice(u.from, u.to), u.value, u.quoted, css.slice(u.rawFrom, u.rawTo)]);
  // A computed value's form, with an escaped quote in the address.
  assert.deepEqual(read('url("a\\"b.png")'), [['url("a\\"b.png")', 'a"b.png', true, 'a\\"b.png']]);
  assert.deepEqual(read("url( 'q' )"), [["url( 'q' )", 'q', true, 'q']]);
  assert.deepEqual(read('url( a.png )'), [['url( a.png )', 'a.png', false, 'a.png']]);
  // An escaped name is a url; one in a comment or a string is not.
  assert.deepEqual(read('u\\72l(x) /* url(y) */ "url(z)"'), [['u\\72l(x)', 'x', false, 'x']]);
  // A string that is not followed by `)` is still the address, as Chromium fetches it.
  assert.deepEqual(read('url("a" x)'), [['url("a"', 'a', true, 'a']]);
});

test('css-tokens: cssCommaParts splits at top-level commas only', () => {
  const { cssCommaParts } = require('../../../lib/core/css-tokens.js');
  const parts = (css) => cssCommaParts(css).map(([a, b]) => css.slice(a, b));
  assert.deepEqual(parts('url("a,b"), linear-gradient(red, blue)'), ['url("a,b")', ' linear-gradient(red, blue)']);
  assert.deepEqual(parts('a /* , */ b'), ['a /* , */ b']);
  assert.deepEqual(parts(''), ['']);
});

test('css-tokens: rewriteCssUrls changes only the addresses it is asked to, byte for byte around them', () => {
  const { rewriteCssUrls } = require('../../../lib/core/css-tokens.js');
  const css = 'a{b:url( fonts/x.woff2 ) url("fonts/y.woff2") url(keep.png)} /* url(fonts/z) */ c::after{content:"url(fonts/q)"}';
  assert.equal(
    rewriteCssUrls(css, (raw) => (raw.startsWith('fonts/') ? `/base/${raw}` : undefined)),
    'a{b:url( /base/fonts/x.woff2 ) url("/base/fonts/y.woff2") url(keep.png)} /* url(fonts/z) */ c::after{content:"url(fonts/q)"}',
  );
  assert.equal(rewriteCssUrls(css, () => undefined), css);
});
