const test = require('node:test');
const assert = require('node:assert/strict');
const { describe } = test;
const { mulberry32 } = require('../../helpers/regex-differential');
const { assertLinearRegexes } = require('../../helpers/regex-trace');

test('a unicode-range face is fetched only for a slide that shows a character in its range', async () => {
  const { unusedRangeFaceUrls } = await import('../../../lib/core/slide-camera.mjs');
  const css = [
    "@font-face{font-family:'Noto Color Emoji';src:url(https://x.test/fonts/e0.woff2) format('woff2');unicode-range:U+1f1e6-1f1ff}",
    "@font-face{font-family:'Noto Color Emoji';src:url(https://x.test/fonts/e1.woff2) format('woff2');unicode-range:U+1f680, U+2705}",
    "@font-face{font-family:Outfit;src:url(https://x.test/fonts/o.woff2) format('woff2')}",
  ].join('\n');
  assert.deepEqual([...unusedRangeFaceUrls(css, 'plain text')].sort(), ['https://x.test/fonts/e0.woff2', 'https://x.test/fonts/e1.woff2']);
  assert.deepEqual([...unusedRangeFaceUrls(css, 'go \u{1F680}')], ['https://x.test/fonts/e0.woff2']);
  assert.deepEqual([...unusedRangeFaceUrls(css, '\u{1F1EB}\u{1F1F7} \u{2705}')], []);
});

test('withoutFontFaces drops every rule of the named family and keeps the rest', async () => {
  const { withoutFontFaces } = await import('../../../lib/core/slide-camera.mjs');
  const emoji = "@font-face{font-family:'Noto Color Emoji';src:url(https://x.test/e0.woff2) format('woff2');unicode-range:U+1f680}";
  const emojiBare = '@font-face{font-family:Noto Color Emoji;src:url(https://x.test/e1.woff2)}';
  const text = "@font-face{font-family:Outfit;src:url(https://x.test/o.woff2) format('woff2')}";
  const css = `${emoji}\n${text}\n${emojiBare}\nsection{font-family:Outfit,'Noto Color Emoji'}`;
  assert.equal(withoutFontFaces(css, ['Noto Color Emoji']), `\n${text}\n\nsection{font-family:Outfit,'Noto Color Emoji'}`);
  assert.equal(withoutFontFaces(css, ["'noto color emoji'"]).includes('e0.woff2'), false);
  assert.equal(withoutFontFaces(css, []), css, 'no family named: nothing changes');
  assert.equal(withoutFontFaces(css, ['']), css, 'an empty name matches nothing');
});

test('onlyUsedFontFaces keeps the faces of the families a slide draws with and drops the rest', async () => {
  const { onlyUsedFontFaces } = await import('../../../lib/core/slide-camera.mjs');
  const outfit = "@font-face{font-family:Outfit;src:url(data:font/woff2;base64,AAAA)}";
  const caveat = "@font-face{font-family:'Caveat';src:url(data:font/woff2;base64,BBBB)}";
  const emoji = "@font-face{font-family:\"Noto Color Emoji\";src:url(data:font/woff2;base64,CCCC);unicode-range:U+1f680}";
  const nameless = '@font-face{src:url(data:font/woff2;base64,DDDD)}';
  const css = `${outfit}\n${caveat}\n${emoji}\n${nameless}\nsection{color:red}`;
  assert.equal(onlyUsedFontFaces(css, new Set(['outfit', 'noto color emoji'])), `${outfit}\n\n${emoji}\n${nameless}\nsection{color:red}`);
  assert.equal(onlyUsedFontFaces(css, new Set()).includes('Outfit'), false, 'no family used: every named face goes');
});

test('onlyUsedFontFaces with no family list keeps every face', async () => {
  const { onlyUsedFontFaces } = await import('../../../lib/core/slide-camera.mjs');
  const css = "@font-face{font-family:Outfit;src:url(data:font/woff2;base64,AAAA)}";
  assert.equal(onlyUsedFontFaces(css, null), css);
});

test('pseudoElementFamilies resolves var() on the slide and reports what it cannot read', async () => {
  const { pseudoElementFamilies } = await import('../../../lib/core/slide-camera.mjs');
  const lookup = (name) => (name === '--font-label' ? ' "JetBrains Mono", monospace' : '');
  const viaVar = pseudoElementFamilies('.n::before{counter-increment:x;font-family:var(--font-label);content:counter(x)}', lookup);
  assert.deepEqual(viaVar, { families: ['"JetBrains Mono", monospace'], unresolved: false });
  const plain = pseudoElementFamilies('.a::before,.b::after{font-family:Outfit,serif}', lookup);
  assert.deepEqual(plain, { families: ['Outfit,serif'], unresolved: false });
  assert.equal(pseudoElementFamilies('.a::before{font-family:var(--nope)}', lookup).unresolved, true, 'a custom property the slide lacks');
  assert.equal(pseudoElementFamilies('.a::before{font:12px X}', lookup).unresolved, true, 'a font: shorthand');
  assert.deepEqual(pseudoElementFamilies('p{font-family:Outfit}', lookup), { families: [], unresolved: false }, 'a rule on an element is not a pseudo-element');
});

test('withoutDuplicateFaces drops a page face only when the host supplies the same face', async () => {
  const { withoutDuplicateFaces } = await import('../../../lib/core/slide-camera.mjs');
  const page = [
    '@font-face{font-family:Outfit;font-weight:400;src:url(data:x)}',
    '@font-face{font-family:Outfit;font-weight:700;src:url(data:y)}',
    '@font-face{font-family:Outfit;font-weight:400;font-stretch:75%;src:url(data:z)}',
  ].join('\n');
  const host = "@font-face{font-family:'Outfit';font-weight:400;src:url(data:h)}";
  assert.equal(withoutDuplicateFaces(page, host), '\n@font-face{font-family:Outfit;font-weight:700;src:url(data:y)}\n@font-face{font-family:Outfit;font-weight:400;font-stretch:75%;src:url(data:z)}');
  assert.equal(withoutDuplicateFaces(page, ''), page, 'no host faces: nothing changes');
});

// The chat's `render_slide` look sends the camera ONE slide's faces (deck-export.js `rasterizeSlidePreview`). With only
// `withoutDuplicateFaces`, every other weight of a family in a font stack stayed in the page sheet, twice (the theme's
// `fonts/` rules and the preview's bundled ones), and the camera fetched and inlined all of them: 16 files, 765 KB, for a
// title slide that draws four faces. Counted in the addresses the camera would fetch, not in time (HARD RULE #32).
test('withoutHostFamilies leaves the camera no page face to fetch for a family the host carries, and keeps the rest', async () => {
  const { withoutHostFamilies, withoutDuplicateFaces, cssUrlSpans } = await import('../../../lib/core/slide-camera.mjs');
  const pageFace = (dir, family, weight, style = 'normal') => `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};src:url(https://x.test/${dir}/${family.replace(/ /g, '-')}-${weight}-${style}.woff2) format('woff2')}`;
  const page = [];
  for (const dir of ['themes/fonts', '_astro']) {
    for (const w of [300, 400, 500, 600, 700]) page.push(pageFace(dir, 'Outfit', w));
    page.push(pageFace(dir, 'Playfair Display', 400), pageFace(dir, 'Playfair Display', 400, 'italic'), pageFace(dir, 'Playfair Display', 700, 'italic'));
  }
  page.push(pageFace('katex', 'KaTeX_Main', 400), 'section{font-family:Outfit,KaTeX_Main}');
  const pageText = page.join('\n');
  // The look's sheet: the faces the slide draws, as data: URIs (font-embed.js `buildFamilyFontCss`).
  const host = ["@font-face{font-family:'Outfit';font-style:normal;font-weight:300;src:url(data:font/woff2;base64,AAAA)}", "@font-face{font-family:'Playfair Display';font-style:normal;font-weight:400;src:url(data:font/woff2;base64,BBBB)}"].join('');
  const fetched = (css) => cssUrlSpans(css).filter((sp) => sp.value.startsWith('https:')).map((sp) => sp.value);
  // Vendored: the theme's copies and the bundled files (font-embed.js `isVendoredFontUrl`). KaTeX's file is not ours.
  const vendored = (u) => /\/(themes\/fonts|_astro)\//.test(u);
  assert.equal(fetched(pageText).length, 17);
  assert.equal(fetched(withoutDuplicateFaces(pageText, host)).length, 13, 'by key, only the two drawn faces leave, from each copy');
  assert.deepEqual(fetched(withoutHostFamilies(pageText, host, vendored)), ['https://x.test/katex/KaTeX_Main-400-normal.woff2'], 'by family, every vendored weight of a carried family leaves; KaTeX, which the host does not carry, stays');
  assert.ok(withoutHostFamilies(pageText, host, vendored).endsWith('section{font-family:Outfit,KaTeX_Main}'), 'the rest of the sheet is untouched');
  assert.equal(withoutHostFamilies(pageText, '', vendored), pageText, 'no host faces: nothing changes');
});

// What `withoutHostFamilies` must keep (the checker on this PR): the host's faces come from the slide's elements, so a
// face only an author file or a `::first-line` draws is not in it.
test('withoutHostFamilies keeps an author\'s own file under a vendored family name, and backs off on :first-line', async () => {
  const { withoutHostFamilies, withoutDuplicateFaces, cssUrlSpans } = await import('../../../lib/core/slide-camera.mjs');
  const vendored = (u) => u.includes('/themes/fonts/');
  const host = "@font-face{font-family:'Outfit';font-style:normal;font-weight:400;src:url(data:font/woff2;base64,AAAA)}";
  const ours = "@font-face{font-family:'Outfit';font-style:normal;font-weight:700;src:url(https://x.test/themes/fonts/outfit-700.woff2) format('woff2')}";
  const author = "@font-face{font-family:'Outfit';font-style:normal;font-weight:800;src:url(https://author.test/outfit-black.woff2) format('woff2')}";
  const fetched = (css) => cssUrlSpans(css).filter((sp) => sp.value.startsWith('https:')).map((sp) => sp.value);
  assert.deepEqual(fetched(withoutHostFamilies(`${ours}\n${author}`, host, vendored)), ['https://author.test/outfit-black.woff2'], 'the vendored 700 leaves, the author\'s 800 stays');
  const mixed = "@font-face{font-family:'Outfit';font-weight:600;src:url(https://x.test/themes/fonts/outfit-600.woff2),url(https://author.test/o.woff2)}";
  assert.equal(fetched(withoutHostFamilies(mixed, host, vendored)).length, 2, 'a rule with any address of the author\'s stays whole');
  for (const rule of ['p::first-line{font-weight:700}', 'h1:first-letter{font-style:italic}']) {
    const page = `${ours}\n${author}\n${rule}`;
    assert.equal(withoutHostFamilies(page, host, vendored), withoutDuplicateFaces(page, host), `${rule}: every face withoutDuplicateFaces keeps stays`);
  }
});

// Every export takes the camera's old path: with the option unset the sheet is `withoutDuplicateFaces`, byte for byte, and
// only the chat's look passes the option (export bytes compared main against this branch: PDF, picture and editable PPTX).
test('pageFontSheet is withoutDuplicateFaces when hostFamilies is unset, and only the look passes the option', async () => {
  const { pageFontSheet, withoutDuplicateFaces } = await import('../../../lib/core/slide-camera.mjs');
  const page = ["@font-face{font-family:'Outfit';font-weight:400;src:url(https://x.test/themes/fonts/outfit-400.woff2)}", "@font-face{font-family:'Outfit';font-weight:700;src:url(https://x.test/themes/fonts/outfit-700.woff2)}", 'section{color:red}'].join('\n');
  const host = "@font-face{font-family:'Outfit';font-weight:400;src:url(data:font/woff2;base64,AAAA)}";
  for (const off of [undefined, null, false]) assert.equal(pageFontSheet(page, host, off), withoutDuplicateFaces(page, host));
  assert.notEqual(pageFontSheet(page, host, () => true), withoutDuplicateFaces(page, host), 'the predicate turns it on');
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '../../../docs/src/components/studio/export/deck-export.js'), 'utf8');
  const shots = [...src.matchAll(/shootSection\(([^;]*?)\);?$/gm)].map((m) => m[1]);
  const passing = shots.filter((args) => args.includes('hostFamilies'));
  assert.equal(passing.length, 1, 'one shootSection call passes hostFamilies');
  const look = src.slice(src.indexOf('export async function rasterizeSlidePreview'));
  assert.ok(look.slice(0, look.indexOf('\n}\n')).includes(passing[0]), 'and it is the one in rasterizeSlidePreview');
  assert.equal((src.match(/hostFamilies/g) || []).length, 5, 'hostFamilies is named in shootSection (3) and rasterizeSlidePreview (2) only');
  for (const caller of ['lib/export/cli-camera.js', 'tools/build-pdf-compose.js']) {
    assert.equal(fs.readFileSync(path.join(__dirname, '../../..', caller), 'utf8').includes('hostFamilies'), false, `${caller} never sets it`);
  }
});

test('fontFaceFamilies names each family once, lower case and unquoted', async () => {
  const { fontFaceFamilies } = await import('../../../lib/core/slide-camera.mjs');
  const css = "@font-face{font-family:'Outfit';font-weight:400}@font-face{font-family:outfit;font-weight:700}@font-face{font-family:\"Noto Color Emoji\";src:url(x)}@font-face{src:url(y)}";
  assert.deepEqual(fontFaceFamilies(css), ['outfit', 'noto color emoji']);
  assert.deepEqual(fontFaceFamilies(''), []);
});

test('pseudoElementFamilies reads every pseudo-element, not only ::before and ::after', async () => {
  const { pseudoElementFamilies } = await import('../../../lib/core/slide-camera.mjs');
  const lookup = (name) => (name === '--sketch-font' ? 'Caveat' : '');
  const css = [
    'li::marker{font-family:var(--sketch-font)}',
    'p::first-line{font-family:Hand !important}',
    'p::first-letter{font-family:Hand\\ Two}',
    '.a:before{font-family:Icons}',
    'p{font-family:Body}',
  ].join('\n');
  const { families, unresolved } = pseudoElementFamilies(css, lookup);
  assert.deepEqual(families.map((f) => f.trim()), ['Caveat', 'Hand', 'Hand Two', 'Icons']);
  assert.equal(unresolved, false);
});

test('urlSwap swaps each address once, longest first, and leaves $ in the replacement alone', async () => {
  const { urlSwap } = await import('../../../lib/core/slide-camera.mjs');
  assert.equal(urlSwap(new Map()), null, 'nothing to swap');
  const swap = urlSwap(new Map([
    ['https://x.test/a.png?a=1&b=2', 'data:image/png;base64,AAA$&'],
    ['https://x.test/a.png', 'data:image/png;base64,BBB'],
    ['https://x.test/gone.png', null],
  ]));
  assert.equal(
    swap('url(https://x.test/a.png?a=1&b=2) url("https://x.test/a.png") url(https://x.test/gone.png)'),
    'url(data:image/png;base64,AAA$&) url("data:image/png;base64,BBB") url(data:,)',
  );
});

test('the sheet scanners stay linear on a stylesheet that carries megabytes of base64 faces', async () => {
  const camera = await import('../../../lib/core/slide-camera.mjs');
  const face = (family, weight) => `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${'A'.repeat(1_500_000)}) format('woff2')}`;
  const css = [face('Outfit', 400), face('Playfair Display', 700), '.a::before{font-family:Icons}li::marker{font-family:var(--f)}', '@media (min-width:1px){.b::first-line{font-family:Hand}}', 'section{font-family:Outfit}'].join('\n');
  // No clock (HARD RULE #32): every regex these scans run must be one recheck calls linear (test/helpers/regex-trace.js).
  // The defect was a backtracking regex, which no count can see and a stopwatch sees only on a slow enough machine.
  // The `@font-face` and `var()` patterns that used to run here are polynomial; fontFaceRules and replaceVarRefs replaced them.
  const { result: pseudo } = assertLinearRegexes(() => camera.pseudoElementFamilies(css, () => 'Q'));
  assert.deepEqual(pseudo.families.map((f) => f.trim()), ['Icons', 'Q', 'Hand']);
  assert.equal(assertLinearRegexes(() => camera.onlyUsedFontFaces(css, new Set(['outfit']))).result.length, css.length - face('Playfair Display', 700).length);
  assert.equal(assertLinearRegexes(() => camera.withoutDuplicateFaces(css, face('Outfit', 400))).result.includes("font-family:'Outfit'"), false);
  assert.equal(assertLinearRegexes(() => camera.withoutFontFaces(css, ['Playfair Display'])).result.includes('Playfair'), false);
  // This sheet has a `::first-line` rule, so the by-family drop backs off and the 700 face stays; without the rule it goes.
  assert.equal(assertLinearRegexes(() => camera.withoutHostFamilies(css, face('Playfair Display', 400), () => true)).result.includes('Playfair'), true);
  const noFirstLine = css.replace('.b::first-line', '.b::after');
  assert.equal(assertLinearRegexes(() => camera.withoutHostFamilies(noFirstLine, face('Playfair Display', 400), () => true)).result.includes('Playfair'), false);
  assertLinearRegexes(() => camera.unusedRangeFaceUrls(css, 'plain text'));
});

describe('the camera\'s sheet readers answer as CSS reads (css-tree\'s spec tokenizer, seeded, seed 3045)', () => {
  // Segno P5a moved fontFaceRules and replaceVarRefs onto the CSS tokenizer (lib/core/css-tokens.mjs). They were pinned
  // to the regexes they replaced, `/@font-face\s*\{[^}]*\}/g` and `/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g`; they now
  // answer as CSS reads the sheet, which differs where those regexes did not read CSS: a `}` or `)` inside a string, an
  // `@font-face` or `var(` inside a comment, a fallback that is itself a call, a no-break space (not CSS whitespace). The
  // oracle below reads css-tree's tokens (an independent tokenizer) with the same block rules.
  const csstree = require('css-tree');
  const tokensOf = (s) => {
    const out = [];
    csstree.tokenize(s, (type, from, to) => out.push({ type: csstree.tokenNames[type], from, to: Math.min(to, s.length) }));
    return out;
  };
  const OPEN = new Set(['{-token', '(-token', '[-token', 'function-token']);
  const CLOSE = new Set(['}-token', ')-token', ']-token']);
  const trivia = (t) => t?.type === 'whitespace-token' || t?.type === 'comment-token';
  const CLOSER = { '{-token': '}-token', '(-token': ')-token', '[-token': ']-token', 'function-token': ')-token' };
  /** Where the block opened at token `k` closes (the index of its own closer), or -1. Any other closer inside is a token. */
  const closerOf = (toks, k) => {
    const want = [];
    for (let j = k; j < toks.length; j++) {
      if (OPEN.has(toks[j].type)) want.push(CLOSER[toks[j].type]);
      else if (CLOSE.has(toks[j].type) && toks[j].type === want[want.length - 1]) {
        want.pop();
        if (!want.length) return j;
      }
    }
    return -1;
  };
  function oracleFaces(s) {
    const toks = tokensOf(s);
    const out = [];
    const parens = []; // the ( and [ blocks open, as their closers: a `{` inside one opens no rule
    let itemStart = true; // nothing but trivia since the last `;`, `{` or `}` at this level
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k];
      if (t.type === '(-token' || t.type === '[-token' || t.type === 'function-token') parens.push(CLOSER[t.type]);
      else if (t.type === '{-token' && parens.length) parens.push('}-token');
      else if (parens.length && t.type === parens[parens.length - 1]) parens.pop();
      else if (parens.length) continue;
      if (parens.length) continue;
      // A stray `)` or `]` is a token: it starts a style rule's prelude like any other (CSS Syntax 3 §5.4.3).
      if (t.type === ')-token' || t.type === ']-token') {
        itemStart = false;
        continue;
      }
      if (t.type === 'at-keyword-token' && itemStart && s.slice(t.from, t.to).toLowerCase() === '@font-face') {
        let j = k + 1;
        while (trivia(toks[j])) j++;
        if (toks[j]?.type === '{-token') {
          const c = closerOf(toks, j);
          if (c >= 0 && s[toks[c].from] === '}') out.push([t.from, s.slice(t.from, toks[c].to)]);
        }
      }
      if (t.type === 'semicolon-token' || t.type === '{-token' || t.type === '}-token') itemStart = true;
      else if (!trivia(t)) itemStart = false;
    }
    return out;
  }
  function oracleVars(s, fn) {
    const toks = tokensOf(s);
    let out = '';
    let at = 0;
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k];
      if (t.type !== 'function-token' || s.slice(t.from, t.to).toLowerCase() !== 'var(') continue;
      let j = k + 1;
      while (trivia(toks[j])) j++;
      if (toks[j]?.type !== 'ident-token' || !s.startsWith('--', toks[j].from)) continue;
      const c = closerOf(toks, k);
      if (c < 0) break;
      out += s.slice(at, t.from) + fn(s.slice(toks[j].from, toks[j].to));
      at = toks[c].to;
      k = c;
    }
    return at ? out + s.slice(at) : s;
  }
  const draw = (rand, pieces, max) => {
    let s = '';
    const len = Math.floor(rand() * (max + 1));
    for (let i = 0; i < len; i++) s += pieces[Math.floor(rand() * pieces.length)];
    return s;
  };
  const FACE_PIECES = ['@font-face{', '@font-face{font-family:x}', '@font-face {a:b;c:d}', '@font-face', '@font-fac', '{', '{', '}', '}', ' ', '\n', '\t', ' ', 'a', ';', ':', 'x{', '@', '"}"', "'{'", '/*', '*/', '(', ')', 'url(x)', '@media p'];
  const VAR_PIECES = ['var(--a', 'var( --b', 'var(--c,', 'var(', 'VAR(', 'var', '(', ')', ')', ',', '--', '-', 'a', 'Z_9', ' ', '\t', '\n', ' ', '!', 'x', '"', ')"', '/*', '*/', 'rgb(1,2,3)', '[', ']'];

  test('fontFaceRules finds the @font-face rules CSS reads, over 20,000 draws', async () => {
    const { fontFaceRules } = await import('../../../lib/core/slide-camera.mjs');
    const rand = mulberry32(3045);
    let found = 0;
    for (let i = 0; i < 20000; i++) {
      const s = draw(rand, FACE_PIECES, 14);
      const want = oracleFaces(s);
      found += want.length;
      assert.deepEqual(fontFaceRules(s).map((r) => [r.start, r.text]), want, JSON.stringify(s));
    }
    assert.ok(found > 2000, `the draws reached only ${found} faces`);
  });

  test('replaceVarRefs rewrites the var() calls CSS reads, over 20,000 draws', async () => {
    const { replaceVarRefs } = await import('../../../lib/core/slide-camera.mjs');
    const rand = mulberry32(3045);
    let replaced = 0;
    for (let i = 0; i < 20000; i++) {
      const s = draw(rand, VAR_PIECES, 14);
      const want = oracleVars(s, (name) => `<${name}>`);
      if (want !== s) replaced++;
      assert.equal(replaceVarRefs(s, (name) => `<${name}>`), want, JSON.stringify(s));
    }
    assert.ok(replaced > 500, `the draws reached only ${replaced} references`);
  });

  test('where CSS reads differently from the regexes the readers replaced, pinned', async () => {
    const { fontFaceRules, replaceVarRefs } = await import('../../../lib/core/slide-camera.mjs');
    const faces = (s) => fontFaceRules(s).map((r) => r.text);
    // A `}` inside a string does not end the face; a face inside a comment is not one.
    assert.deepEqual(faces('@font-face{font-family:"a}b"} /* @font-face{x:y} */'), ['@font-face{font-family:"a}b"}']);
    // A no-break space is not CSS whitespace, so `@font-face ` is another at-keyword.
    assert.deepEqual(faces('@font-face {x:y}'), []);
    // A fallback that is itself a call goes with the reference.
    assert.equal(replaceVarRefs('var(--a, rgb(0 0 0)) b', () => 'X'), 'X b');
    // A closer that is not the innermost block's own is a token: the `)` inside `[…]` does not end the call.
    assert.equal(replaceVarRefs('var(--a, [x) y]) z', () => 'X'), 'X z');
    // A `var(` inside a string is text.
    assert.equal(replaceVarRefs('"var(--a)" var(--b)', (n) => `<${n}>`), '"var(--a)" <--b>');
  });
});

test('the root rewrite re-points html, body and :root selectors and leaves CSS strings and comments as written', async () => {
  const { repointRootSelectors } = await import('../../../lib/core/slide-camera.mjs');
  const css = `html,body{margin:0} :root{--a:1} .x::before{content:" body "} /* body html */ .y::after{content:'html'} section body{color:red}`;
  assert.equal(
    repointRootSelectors(css),
    `.__lc-root,.__lc-body{margin:0} .__lc-root{--a:1} .x::before{content:" body "} /* body html */ .y::after{content:'html'} section .__lc-body{color:red}`,
  );
  assert.equal(repointRootSelectors(`.q::before{content:"a \\" body"}body{}`), `.q::before{content:"a \\" body"}body{}`.replace(/}body/, '}.__lc-body'), 'an escaped quote does not end the string');
});

test('slide camera: the face and rule reads of a sheet are kept, so a second slide parses nothing again (counted, not timed)', async () => {
  // The camera reads the same sheets for every slide, and each read is a full tokenizer pass over megabytes of base64
  // faces. Without the cache, a 30-slide export re-parsed them on every slide (about 0.2 s a slide on dist/lattice.css).
  const cam = await import('../../../lib/core/slide-camera.mjs');
  const { tokenWork } = await import('../../../lib/core/css-tokens.mjs');
  // A sheet no other test reads, so its first read is cold.
  const filler = Array.from({ length: 40 }, (_, i) => `.r${i}{color:red}`).join('');
  const sheet = `/* slide-camera-faces cache probe */ ${filler} @font-face{font-family:A;src:url(a.woff2)} p::before{font-family:var(--x)} @font-face{font-family:B;unicode-range:U+4E00-9FFF;src:url(b.woff2)}`;
  const slide = () => {
    cam.pseudoElementFamilies(sheet, () => 'x');
    cam.onlyUsedFontFaces(sheet, new Set(['a', 'b']));
    cam.unusedRangeFaceUrls(sheet, 'Hello');
    return cam.fontFaceRules(sheet).length;
  };
  // What a slide reads besides the sheet: pseudoElementFamilies resolves the one `var(--x)` value, a few tokens.
  const { cssTokens } = await import('../../../lib/core/css-tokens.mjs');
  const perValue = cssTokens('var(--x)').length;
  const before = tokenWork.tokens;
  assert.equal(slide(), 2);
  const first = tokenWork.tokens - before;
  assert.ok(first > 20 * perValue, `the first slide read the sheet (${first} tokens)`);
  const again = tokenWork.tokens;
  for (let i = 0; i < 5; i++) slide();
  assert.equal(tokenWork.tokens - again, 5 * perValue, 'five more slides read only the var() value each, never the sheet again');
});

test('slide camera: a face nested inside another goes with its parent, never duplicated', async () => {
  const { onlyUsedFontFaces, withoutFontFaces } = await import('../../../lib/core/slide-camera.mjs');
  const css = '@font-face{font-family:A;@font-face{font-family:B}}p{}';
  // cssRules reports both blocks, one inside the other; a replace walk must not splice the inner one in twice.
  assert.equal(onlyUsedFontFaces(css, new Set(['a', 'b'])), css);
  assert.equal(withoutFontFaces(css, ['a']), 'p{}');
});
