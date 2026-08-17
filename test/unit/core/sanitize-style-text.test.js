/**
 * Unit: the STYLESHEET channel of HARD RULE #22 (lib/core/sanitize-style-text.mjs).
 *
 * The property under test is total, so it is asserted as a property and not as a
 * list of payloads: **no output may contain `</style` in any case.** A `<style>`
 * element's content is HTML RAWTEXT, which ends at the first `</style` and knows
 * nothing about CSS comments or strings — so that one sequence is the entire
 * distance between "theme CSS" and "markup in a same-origin, un-sandboxed frame
 * holding the user's OpenRouter key" (#616, HARD RULE #24).
 *
 * Each arm is pinned by a mutant that must fail it, and the pins were RUN, not assumed:
 *   - dropping the sanitize entirely            -> 16/20 fail
 *   - matching case-sensitively (`/<\/style/g`) -> 6 fail (the UPPER/mixed rows)
 *   - a case-SENSITIVE `indexOf` fast-path guard, which is the likeliest real bug in
 *     the guard itself, since it would return early on `</STYLE>` -> 5 fail
 *   - a non-global replace (first occurrence only) -> 4 fail (adjacent + far-apart rows)
 *   - stripping the sequence instead of escaping it -> 3 fail (the CSS-value rows)
 *   - replacing with a literal `'<\/style'`      -> 2 fail (case preservation)
 *
 * Two things this file deliberately does NOT claim to pin. Dropping the `indexOf`
 * fast path fails nothing — it is pure perf, and the equivalence arm below is what
 * proves that. And a lookbehind form (`/(?<=<)\/(?=style)/gi`) also passes all 20:
 * checked, and it is genuinely equivalent here, because the transform INSERTS rather
 * than deletes, so escaping one match cannot push the next against the same `<`. An
 * earlier draft of this docblock asserted that arm caught it. It does not.
 *
 * See engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md.
 */

const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');

let sanitizeStyleText;
before(async () => {
  ({ sanitizeStyleText } = await import('../../../lib/core/sanitize-style-text.mjs'));
});

/** The invariant, stated once. */
const escapes = (s) => !/<\/style/i.test(sanitizeStyleText(s));

describe('the element terminator cannot survive', () => {
  const breaksOut = {
    'bare': '</style>',
    'after a declaration': 'section{color:red}</style><img src=x onerror=1>',
    // The load-bearing case: the CSS comment is intact and well-formed, and the
    // element still ends. This is what makes the serializer escape insufficient
    // on its own.
    'inside a well-formed CSS comment': '/* palette by </style><img src=x onerror=1> */',
    'inside a CSS string': 'section::after{content:"</style><img src=x>"}',
    'uppercase': '</STYLE>',
    'mixed case': '</StYlE>',
    'with a tab before the gt': '</style\t>',
    'self-closing form': '</style/>',
    'no delimiter at all': '</styleXYZ',
    // Escaping the first slash must not push the next one against the same `<`.
    // A single lookbehind pass over the SOURCE gets this wrong.
    'adjacent and overlapping': '</style</style</style',
    'split across newlines around it': 'a{}\n</style\n>\nb{}',
    'many, far apart': `a{}${'x'.repeat(5000)}</style>${'y'.repeat(5000)}</STYLE>`,
  };
  for (const [label, css] of Object.entries(breaksOut)) {
    test(`escapes: ${label}`, () => {
      assert.ok(escapes(css), `\`</style\` survived: ${JSON.stringify(sanitizeStyleText(css))}`);
    });
  }
});

describe('it changes nothing else', () => {
  test('CSS with no `</` is returned byte-identical AND by identity', () => {
    const css = ':root{--a:1}section.lattice > h1{font-size:var(--fs-hero)}/* a banner */';
    assert.equal(sanitizeStyleText(css), css);
    // Identity, not just equality — the perf claim in the module docblock (and in the
    // decision note) rests on the no-match path allocating nothing. `assert.equal` alone
    // passes for a copy, so a mutant that returned `String(text)` killed no test.
    assert.ok(Object.is(sanitizeStyleText(css), css), 'the no-match path must return the input itself');
  });

  test('a `</` that is not a style end tag is untouched', () => {
    for (const css of ['content:"</div>"', 'content:"</script>"', 'a{}/* </b> */']) {
      assert.equal(sanitizeStyleText(css), css);
    }
  });

  test('the fast path is only a fast path — same answer with it bypassed', () => {
    // Equivalence against the unguarded transform over a corpus that DOES contain `</`,
    // so the `indexOf` guard can never be the thing making an arm pass.
    const unguarded = (s) => String(s).replace(/<\/style/gi, (m) => `<\\${m.slice(1)}`);
    for (const css of Object.values({ a: '</style>', b: 'x</STYLE y', c: 'a{}', d: 'content:"</div>"', e: '' })) {
      assert.equal(sanitizeStyleText(css), css ? unguarded(css) : css);
    }
  });

  test('the author\'s case is preserved (a CSS string value must not change)', () => {
    assert.equal(sanitizeStyleText('content:"</STYLE>"'), 'content:"<\\/STYLE>"');
    assert.equal(sanitizeStyleText('content:"</StYlE>"'), 'content:"<\\/StYlE>"');
  });

  test('it ESCAPES rather than deletes — the CSS string still computes to the same value', () => {
    // `\/` is CSS's escape for `/`, so the declared value is unchanged; deleting the
    // sequence instead would silently rewrite the author's content.
    const out = sanitizeStyleText('section::after{content:"</style>"}');
    assert.match(out, /content:"<\\\/style>"/);
    assert.ok(out.includes('style'), 'the text itself must survive, only the pairing is broken');
  });

  test('idempotent — the Studio RESTYLE path re-derives this string per toggle', () => {
    for (const css of ['</style>', 'a{}</StYlE </style', 'plain{}']) {
      assert.equal(sanitizeStyleText(sanitizeStyleText(css)), sanitizeStyleText(css));
    }
  });

  test('falsy in, falsy out (no `String(null)` leaking "null" into a sheet)', () => {
    for (const v of ['', null, undefined]) assert.equal(sanitizeStyleText(v), v);
  });
});

describe('fuzz: the invariant holds over adversarial noise', () => {
  test('no `</style` survives, over 200k cases biased to the boundary alphabet', () => {
    // Deterministic PRNG so a failure is reproducible from the seed alone.
    let seed = 0x2026_0817 >>> 0;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 0x1_0000_0000);
    const alphabet = ['<', '/', 's', 't', 'y', 'l', 'e', 'S', 'T', 'Y', 'L', 'E', '>', '*', '"', "'", '\\', '\n', ' ', '{', '}', '</style', '</STYLE', '</sty'];
    for (let i = 0; i < 200_000; i++) {
      let s = '';
      for (let n = (rnd() * 14) | 0; n >= 0; n--) s += alphabet[(rnd() * alphabet.length) | 0];
      if (!escapes(s)) assert.fail(`\`</style\` survived for input ${JSON.stringify(s)} (case ${i})`);
    }
  });
});
