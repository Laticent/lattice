/**
 * The selector and prelude walks Segno P5a moved onto the CSS tokenizer (lib/core/css-tokens.js), held to the
 * character walks they replaced: lib/core/leading-is.js (`splitSelectorList`, `leadingIsArms`, `splitLeadingTrivia`,
 * `distributeLeadingIs`) and lib/core/pane-css.js (`widenForPanes`). The old code is copied below as it stood on `main`
 * dbc4d73a, comments dropped.
 *
 * Two corpora:
 *   - every stylesheet the build writes and every tracked .css: byte-identical output;
 *   - seeded inputs (HARD RULE #32) from fragments that reach every branch, with the escapes, the `\r` and `\f` string
 *     ends and the escaped `url` names the old walks read differently LEFT OUT, so any difference is a regression.
 * Where the tokenizer reads differently on purpose, the case is pinned on its own below.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { eachCssRun } = require('../../../lib/core/css-comments.mjs');
const leading = require('../../../lib/core/leading-is.js');
const pane = require('../../../lib/core/pane-css.js');

const ROOT = path.join(__dirname, '..', '..', '..');

// ── the walks as they stood ──────────────────────────────────────────────────────────────────────────────────────────
function oldSplitSelectorList(list) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of list) {
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    cur += ch;
  }
  parts.push(cur);
  return parts;
}
function oldLeadingIsArms(sel) {
  if (!sel.startsWith(':is(')) return null;
  let depth = 0;
  let i = 3;
  for (; i < sel.length; i++) {
    if (sel[i] === '(') depth++;
    else if (sel[i] === ')' && --depth === 0) break;
  }
  if (depth !== 0) return null;
  return { arms: oldSplitSelectorList(sel.slice(4, i)), rest: sel.slice(i + 1) };
}
function oldDistributeSelector(rawSelector, arms = oldLeadingIsArms) {
  const sel = rawSelector.trim();
  const li = arms(sel);
  if (!li) return sel;
  return li.arms.map((arm) => oldDistributeSelector(arm.trim() + li.rest, arms)).join(', ');
}
function oldSplitLeadingTrivia(prelude) {
  let i = 0;
  for (;;) {
    const before = i;
    while (i < prelude.length && /\s/.test(prelude[i])) i += 1;
    if (prelude.startsWith('/*', i)) {
      const close = prelude.indexOf('*/', i + 2);
      i = close < 0 ? prelude.length : close + 2;
    }
    if (i === before) break;
  }
  return [prelude.slice(0, i), prelude.slice(i)];
}
function oldDistributeLeadingIs(css, split = oldSplitSelectorList, arms = oldLeadingIsArms) {
  let out = '';
  let prelude = '';
  let atRule = false;
  const flush = () => { out += prelude; prelude = ''; atRule = false; };
  eachCssRun(css, (type, text) => {
    if (type !== 'code') { prelude += text; return; }
    let start = 0;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '{') {
        prelude += text.slice(start, i);
        const [trivia, selectors] = oldSplitLeadingTrivia(prelude);
        if (!atRule && selectors.startsWith(':is(') && prelude.length <= 65536) {
          out += trivia + split(selectors).map((sel) => oldDistributeSelector(sel, arms)).join(', ');
        } else {
          out += prelude;
        }
        out += '{';
        prelude = '';
        atRule = false;
        start = i + 1;
        continue;
      }
      if (ch === '}' || ch === ';') {
        prelude += text.slice(start, i + 1);
        flush();
        start = i + 1;
        continue;
      }
      if (ch === '@') atRule = true;
    }
    prelude += text.slice(start);
  });
  flush();
  return out;
}
function oldSkipToken(text, i) {
  const ch = text[i];
  if (ch === '"' || ch === "'") {
    let j = i + 1;
    while (j < text.length && text[j] !== ch && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
    return Math.min(j + 1, text.length);
  }
  if ((ch === 'u' || ch === 'U') && /^url\(\s*[^\s"')]/i.test(text.slice(i, i + 64)) && !/[\w-]/.test(text[i - 1] || '')) {
    const close = text.indexOf(')', i + 4);
    return close < 0 ? text.length : close + 1;
  }
  return -1;
}
function oldPullComments(text) {
  let comments = '';
  let rest = '';
  let semi = 0;
  let i = 0;
  while (i < text.length) {
    const end = oldSkipToken(text, i);
    if (end >= 0) {
      rest += text.slice(i, end);
      i = end;
    } else if (text[i] === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      const stop = close < 0 ? text.length : close + 2;
      comments += text.slice(i, stop);
      i = stop;
    } else {
      rest += text[i];
      if (text[i] === ';') semi = rest.length;
      i++;
    }
  }
  return { comments, rest, semi };
}
function oldWidenForPanes(css, classes, components) {
  if (!css?.includes('section')) return css;
  const only = classes ? new Set(classes) : null;
  const comps = components ? new Set(components) : null;
  let out = '';
  let seg = 0;
  let depth = 0;
  let keyframeDepth = -1;
  let inComment = false;
  for (let i = 0; i < css.length; i++) {
    if (inComment) {
      if (css[i] === '*' && css[i + 1] === '/') {
        inComment = false;
        i++;
      }
      continue;
    }
    if (css[i] === '/' && css[i + 1] === '*') {
      inComment = true;
      i++;
      continue;
    }
    const ch = css[i];
    const end = oldSkipToken(css, i);
    if (end >= 0) {
      i = end - 1;
      continue;
    }
    if (ch === '{') {
      const { comments, rest: prelude, semi } = oldPullComments(css.slice(seg, i));
      const head = prelude.slice(0, semi);
      const sel = prelude.slice(semi);
      const trimmed = sel.trim();
      let next = sel;
      if (trimmed.startsWith('@')) {
        if (keyframeDepth < 0 && /^@(?:-\w+-)?keyframes\b/.test(trimmed)) keyframeDepth = depth;
      } else if (keyframeDepth < 0 && trimmed.includes('section')) {
        next = pane.twinSelectorList(sel, only, comps);
      }
      out += head + comments + next + '{';
      depth++;
      seg = i + 1;
    } else if (ch === '}') {
      out += css.slice(seg, i + 1);
      depth--;
      if (keyframeDepth >= 0 && depth === keyframeDepth) keyframeDepth = -1;
      seg = i + 1;
    }
  }
  return out + css.slice(seg);
}

// ── corpora ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function sheets() {
  const tracked = execFileSync('git', ['ls-files', '*.css'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  const built = fs.existsSync(path.join(ROOT, 'dist')) ? fs.readdirSync(path.join(ROOT, 'dist')).filter((f) => f.endsWith('.css')).map((f) => `dist/${f}`) : [];
  assert.ok(built.includes('dist/lattice.css'), 'dist/lattice.css is missing: run `npm run build` first');
  return [...tracked, ...built].map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);
}

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
const SEED = 0x5a1d;
const FRAGMENTS = [
  'section', 'section.kpi', 'section.cards-grid', ' .cell-stage', ' > ', ' ul', ' li', '.lat-pane-host', ':is(', ':not(', ':where(',
  '(', ')', '[', ']', '[data-x="a,b"]', '[data-y=")"]', ',', ', ', ' ', '\n', '{', '}', ';', ':', 'color: red', '@media print',
  '@keyframes k', '@-webkit-keyframes w', '@import url(x.css)', '"/*"', "'}'", '"{"', '/* c */', '/* , ; { */', 'url(a/*b)',
  'url( a )', 'content:', 'from', 'to', '0%', 'h1', '.a', '.b', 'p',
];
function input(next) {
  let s = '';
  for (let n = 1 + Math.floor(next() * 30); n > 0; n--) s += FRAGMENTS[Math.floor(next() * FRAGMENTS.length)];
  return s;
}

test('selector walks: byte-identical to the character walks on every stylesheet the repo writes or ships', () => {
  let n = 0;
  for (const [f, css] of sheets()) {
    assert.equal(leading.distributeLeadingIs(css), oldDistributeLeadingIs(css), `distributeLeadingIs: ${f}`);
    assert.equal(pane.widenForPanes(css), oldWidenForPanes(css), `widenForPanes: ${f}`);
    assert.equal(pane.widenForPanes(css, ['kpi', 'cards-grid'], ['kpi']), oldWidenForPanes(css, ['kpi', 'cards-grid'], ['kpi']), `widenForPanes (scoped): ${f}`);
    n++;
  }
  assert.ok(n > 150, `only ${n} stylesheets`);
});

test('selector walks: the same answers on 20,000 seeded inputs', () => {
  const next = rng(SEED);
  for (let i = 0; i < 20000; i++) {
    const css = input(next);
    const where = `seed ${SEED}, input ${i}: ${JSON.stringify(css)}`;
    assert.deepEqual(leading.splitSelectorList(css), oldSplitSelectorListAgreed(css), `splitSelectorList, ${where}`);
    assert.deepEqual(leading.leadingIsArms(css), oldLeadingIsArmsAgreed(css), `leadingIsArms, ${where}`);
    // The old prelude walk handed each prelude to the string-blind splitters; where a prelude holds a string or a comment,
    // the walk is compared with the new splitters in it, which holds the walk itself to the old one.
    const agreed = plain(css) ? oldDistributeLeadingIs(css) : oldDistributeLeadingIs(css, leading.splitSelectorList, leading.leadingIsArms);
    assert.equal(leading.distributeLeadingIs(css), agreed, `distributeLeadingIs, ${where}`);
    assert.equal(pane.widenForPanes(css), oldWidenForPanes(css), `widenForPanes, ${where}`);
  }
});

// The two string-free reads: the old splitters counted a bracket or a comma inside a string or a comment, so on those
// inputs the old answer is wrong and the comparison is made only where the input has neither.
const plain = (css) => !/["'/]/.test(css);
function oldSplitSelectorListAgreed(css) {
  return plain(css) ? oldSplitSelectorList(css) : leading.splitSelectorList(css);
}
function oldLeadingIsArmsAgreed(css) {
  return plain(css) ? oldLeadingIsArms(css) : leading.leadingIsArms(css);
}

test('selector walks: what the tokenizer reads differently, on purpose', () => {
  // A comma or a bracket inside a string or a comment is text.
  assert.deepEqual(leading.splitSelectorList('[data-x="a,b"], p'), ['[data-x="a,b"]', ' p']);
  assert.deepEqual(oldSplitSelectorList('[data-x=")"], p'), ['[data-x=")"], p']);
  assert.deepEqual(leading.splitSelectorList('[data-x=")"], p'), ['[data-x=")"]', ' p']);
  assert.deepEqual(leading.splitSelectorList('a /* , */, b'), ['a /* , */', ' b']);
  // A `)` inside a string does not close `:is(` (the old walk closed it there and cut the string in half).
  assert.deepEqual(oldLeadingIsArms(':is([a=")"], b) c'), { arms: ['[a="'], rest: '"], b) c' });
  assert.deepEqual(leading.leadingIsArms(':is([a=")"], b) c'), { arms: ['[a=")"]', ' b'], rest: ' c' });
  // An escaped `@` in a class name is not an at-rule, so the leading `:is()` is distributed.
  assert.equal(leading.distributeLeadingIs(':is(.a\\@b, .c) p{x:y}'), '.a\\@b p, .c p{x:y}');
  assert.equal(oldDistributeLeadingIs(':is(.a\\@b, .c) p{x:y}'), ':is(.a\\@b, .c) p{x:y}');
});
