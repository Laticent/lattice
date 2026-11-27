// LFM 1.0 §3.4: bold and italic keep their ordinary Markdown meaning, except where a component DECLARES
// that it reads one as structure. This test holds every component stylesheet to that: a selector whose
// subject is `em` or `strong` must belong to a titled-items layout (its leading bold is the title, §3.1),
// a declared `inlineReads` entry, or a styling-only entry below with its reason. It also fails a stale
// declaration (an `inlineReads` entry whose element the stylesheet never mentions) and checks that
// grammar.json publishes the declarations.
// Failing arms: delete pricing's `inlineReads` and the `em` read goes undeclared; add an `em` rule to a
// component with no declaration and it is reported; point a declaration at `strong` on a stylesheet with
// none and it is stale.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadAll, componentDir } = require('../../../lib/components');
const { CARD_STYLE_LAYOUTS, LEDGER_LAYOUTS } = require('../../../lib/core/list-shapes');
const { SLOT_LAYOUTS } = require('../../../lib/core/slot-label-lift');

const ROOT = path.join(__dirname, '../../..');

// Stylesheets that restyle `em` or `strong` while it keeps its ordinary meaning: still stress, still
// visible as stress. Each entry says why it is not a structural read.
const STYLING_ONLY = Object.freeze({
  checklist: { em: 'a muted italic tail after an item: still emphasis, only quieter' },
  stats: { em: 'an italic subtitle paragraph keeps its italic' },
  glossary: { strong: 'the term column sets bold terms in the accent color: still bold' },
});

const TITLED = new Set([...CARD_STYLE_LAYOUTS, ...LEDGER_LAYOUTS, ...SLOT_LAYOUTS, 'list-steps']);

/** The element names (`em`, `strong`) a stylesheet uses as a type selector, outside comments. */
function readsOf(css) {
  const out = new Set();
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of clean.matchAll(/([^{}]+)\{/g)) {
    for (const sel of m[1].split(',')) {
      for (const tag of ['em', 'strong']) {
        if (new RegExp(`(^|[\\s>+~(])${tag}(?![\\w-])`).test(sel.trim())) out.add(tag);
      }
    }
  }
  return out;
}

const components = loadAll().map((m) => {
  const file = path.join(componentDir(m), `${m.name}.styles.css`);
  return { m, css: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '' };
});

test('every stylesheet that reads em or strong declares it', () => {
  const undeclared = [];
  for (const { m, css } of components) {
    const declared = new Set((m.inlineReads || []).map((r) => (/\bstrong\b/.test(r.selector) ? 'strong' : 'em')));
    for (const tag of readsOf(css)) {
      if (declared.has(tag)) continue;
      if (tag === 'strong' && TITLED.has(m.name)) continue;
      if (STYLING_ONLY[m.name]?.[tag]) continue;
      undeclared.push(`${m.name}: reads \`${tag}\``);
    }
  }
  assert.deepEqual(undeclared, [], 'Declare each in the manifest\'s `inlineReads` (LFM 1.0 §3.4), or add a styling-only entry here with its reason.');
});

test('no declaration or styling-only entry is stale', () => {
  const stale = [];
  for (const { m, css } of components) {
    const reads = readsOf(css);
    for (const r of m.inlineReads || []) {
      const tag = /\bstrong\b/.test(r.selector) ? 'strong' : 'em';
      if (!reads.has(tag)) stale.push(`${m.name}: declares \`${r.selector}\`, but its stylesheet never reads \`${tag}\``);
    }
  }
  for (const [name, tags] of Object.entries(STYLING_ONLY)) {
    const c = components.find((x) => x.m.name === name);
    for (const tag of Object.keys(tags)) {
      if (!c || !readsOf(c.css).has(tag)) stale.push(`STYLING_ONLY.${name}.${tag}: the stylesheet no longer reads it`);
    }
  }
  assert.deepEqual(stale, []);
});

test('grammar.json publishes the structural reads', () => {
  const grammar = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/docs/grammar.json'), 'utf8'));
  const by = Object.fromEntries(grammar.components.map((c) => [c.name, c]));
  assert.equal(by.pricing.inlineReads[0].selector, 'ul > li > em');
  assert.deepEqual(by.inventory.titledItems, { liftsTitle: true });
  // citation-card's action card needed a typed `**` before LFM 1.0 (§3.1: a renderer must not need it).
  assert.deepEqual(by['citation-card'].titledItems, { liftsTitle: true });
  assert.deepEqual(by['cards-grid'].titledItems, { liftsTitle: false });
  assert.deepEqual(by['list-steps'].titledItems.liftVariants, ['chevron', 'converge', 'ghost']);
  assert.equal(by.title.titledItems, null);
  assert.ok(by['cards-grid'].beats.includes('key-insight'));
  assert.equal(by.inventory.lists, 'neutral');
  for (const c of grammar.components) {
    for (const k of ['lists', 'titledItems', 'beats', 'inlineReads']) assert.ok(k in c, `${c.name} lacks ${k}`);
  }
});
