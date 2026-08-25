/**
 * Unit: lib/theme/parse.js — theme CSS ⇄ a total, ordered, selector-aware
 * declaration record.
 *
 * This is the acceptance test for the record shape
 * `engineering/decisions/2026-08-25-hand-editing-generated-assets.md` specifies:
 * a hand-edited theme is only safe to save if reading it and writing it back is
 * lossless, and the shipped corpus is the only honest place to prove that.
 *
 * THE POINT OF THE CORPUS SWEEP is that it fails on a naive implementation. A
 * flat token map keyed on `REQUIRED_TOKENS` deletes 48 distinct custom
 * properties across 19 of the 32 shipped themes, turns `themes/ardesia-dark.css`
 * from a dark theme into a light one (`color-scheme` is not a token), and loses
 * the `@import` that carries the entire content of 13 files. Each of those has
 * its own test below, so a regression names its defect instead of just moving a
 * count.
 *
 * The two serialization modes are both exercised, and the second is why the
 * first means anything:
 *
 *   - raw mode re-emits each untouched node's source slice — byte fidelity for a
 *     hand-formatted file;
 *   - canonical mode re-renders every node body from structure, so a declaration
 *     missing from the record vanishes from the output. Raw mode alone would pass
 *     a parser that recorded nothing at all.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const csstree = require('css-tree');

const {
  parseTheme, serializeThemeRecord, themeRecordView, tokenMapBySelector, isRootIsh,
  themeTokenMap, rootSpecificity, renameThemeDirective,
} = require('../../../lib/theme/parse.js');
const { auditBoth } = require('../../../lib/theme/contrast.js');
const { deriveTheme, requiredTokenList } = require('../../../lib/theme/derive.js');
const { serializeTheme, extraNames } = require('../../../lib/theme/serialize.js');
const { STARTERS } = require('../../../lib/theme/starters.js');

const THEMES_DIR = path.join(__dirname, '..', '..', '..', 'themes');
const THEME_FILES = fs.readdirSync(THEMES_DIR).filter((f) => f.endsWith('.css')).sort();
const readTheme = (f) => fs.readFileSync(path.join(THEMES_DIR, f), 'utf8');

/**
 * An INDEPENDENT census of every selector, at-rule and declaration, via css-tree.
 *
 * This is the oracle, and the corpus tests are worth nothing without it. Comparing
 * `fingerprint(roundTripped)` to `fingerprint(source)` compares our parser's output
 * to our own parser's reading — a declaration it never recorded is missing from
 * BOTH sides, so the comparison is satisfied by a parser that silently deletes.
 * Not hypothetical: a maker-checker pass monkey-patched `parseTheme` to strip all
 * 84 `--text-*` declarations from 14 shipped themes, and every corpus test here
 * still passed, including the one whose name is "preserves every declaration".
 *
 * css-tree is a devDependency and this uses `parse` ONLY — never `generate`, which
 * is what would make it a HARD RULE #22 re-wrap sink. Parsing to compare creates no
 * serializer.
 */
function census(css) {
  const ast = csstree.parse(css, {
    positions: false, parseValue: false, parseAtrulePrelude: false, parseSelector: false,
  });
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const out = [];
  csstree.walk(ast, (node) => {
    if (node.type === 'Rule') out.push(`RULE ${norm(node.prelude?.value)}`);
    else if (node.type === 'Atrule') out.push(`AT @${node.name} ${norm(node.prelude?.value)}`);
    else if (node.type === 'Declaration') {
      out.push(`DECL ${node.property}=${norm(node.value?.value)}${node.important ? '!' : ''}`);
    }
  });
  return out;
}

/**
 * Every selector, at-rule and declaration in source order — the three things the
 * acceptance criterion names, and nothing else. Comments contribute their length
 * rather than their text so the fingerprint stays a structural claim.
 *
 * Used for the IDEMPOTENCE claim, where comparing our reader to itself is the
 * point. The preservation claim uses `census` above.
 */
function fingerprint(record, out = []) {
  for (const n of record.nodes) {
    if (n.type === 'rule') { out.push(`RULE ${n.selector}`); fingerprint(n, out); }
    else if (n.type === 'atrule') {
      out.push(`AT @${n.name} ${n.prelude}`);
      if (n.nodes) fingerprint(n, out);
    } else if (n.type === 'decl') out.push(`DECL ${n.property}=${n.value}${n.important ? '!' : ''}`);
    else if (n.type === 'comment') out.push(`CMT ${n.text.length}`);
    else out.push(`RAW ${n.text}`);
  }
  return out;
}

describe('theme-parse — the shipped corpus', () => {
  // The headline acceptance criterion, stated as it is in #1841.
  test('parse → serialize → parse preserves every declaration, selector and at-rule across all 32 themes', () => {
    assert.equal(THEME_FILES.length, 32, 'corpus size moved — re-read the round-trip claims below');
    for (const f of THEME_FILES) {
      const css = readTheme(f);
      const once = parseTheme(css);
      const out = serializeThemeRecord(once, { canonical: true });
      // Against css-tree on BOTH sides, so a declaration our parser never recorded
      // shows up as a difference instead of being absent from the comparison too.
      assert.deepEqual(census(out), census(css), `${f}: structure changed across a round-trip`);
      // And our own reader agrees with itself, which is what the record's stability
      // claim needs — a second save must not keep changing the file.
      assert.deepEqual(fingerprint(parseTheme(out)), fingerprint(once), `${f}: record unstable`);
    }
  });

  test('the corpus sweep FAILS when the parser drops declarations', () => {
    // Guards the oracle itself. A parser that silently deletes must redden the test
    // above; before the census landed it did not, and every corpus assertion here
    // was certifying the parser against its own blind spot.
    const css = readTheme('indaco.css');
    const record = parseTheme(css);
    for (const rule of record.nodes.filter((n) => n.type === 'rule')) {
      rule.nodes = rule.nodes.filter((c) => !(c.type === 'decl' && c.property.startsWith('--text-')));
      rule.dirty = true;
    }
    const mutated = serializeThemeRecord(record, { canonical: true });
    assert.notDeepEqual(census(mutated), census(css), 'a dropped declaration must be visible to the census');
  });

  test('an untouched theme re-serializes byte-identically, whatever its formatting', () => {
    for (const f of THEME_FILES) {
      const css = readTheme(f);
      assert.equal(serializeThemeRecord(parseTheme(css)), css, `${f}: not byte-identical`);
    }
  });

  test('every non-contract custom property survives — the 48 a flat map deletes', () => {
    const required = new Set(requiredTokenList());
    const survivors = new Set();
    let filesWithExtras = 0;
    for (const f of THEME_FILES) {
      const before = themeRecordView(parseTheme(readTheme(f))).tokens.filter((t) => !t.contract);
      if (before.length) filesWithExtras++;
      const after = themeRecordView(
        parseTheme(serializeThemeRecord(parseTheme(readTheme(f)), { canonical: true })),
      ).tokens.filter((t) => !t.contract);
      assert.deepEqual(after.map((t) => t.name), before.map((t) => t.name), `${f}: non-contract tokens lost`);
      for (const t of before) survivors.add(t.name);
    }
    // Named rather than merely counted: these are the families whose loss is a
    // rendering defect, not a thinner file.
    for (const name of ['cat-1-texture', 'cat-12-texture', 'chart-cat1-ink', 'hljs-params', 'hljs-tag']) {
      assert.ok(survivors.has(name), `--${name} is not in the corpus any more — re-check the extras claim`);
      assert.ok(!required.has(name), `--${name} joined REQUIRED_TOKENS; it is no longer an "extra"`);
    }
    assert.equal(filesWithExtras, 19, 'themes carrying non-contract tokens in a root block');
    assert.ok(survivors.size >= 48, `expected >=48 distinct non-contract names, got ${survivors.size}`);
  });

  test('`--spectrum` keeps the operands that make it resolve', () => {
    // The cascade this guards: `--spectrum` IS in the contract and survives a
    // flat map; its three `--brand-*` operands are not. Dropping them leaves it
    // resolving invalid inside a bare `background:` shorthand, which takes the
    // whole declaration down — the white-on-white divider of
    // 2026-08-10-no-safe-default-token-contract.md.
    const map = tokenMapBySelector(parseTheme(readTheme('indaco.css'))).get(':root');
    const spectrum = map.get('spectrum');
    assert.match(spectrum, /var\(--brand-/, 'indaco no longer builds --spectrum from --brand-* operands');
    for (const [, operand] of spectrum.matchAll(/var\(\s*--([a-z0-9-]+)/gi)) {
      assert.ok(map.has(operand), `--spectrum operand --${operand} is missing from the record`);
    }
  });

  test('a dark wrapper stays dark — color-scheme is not a token', () => {
    const record = parseTheme(readTheme('ardesia-dark.css'));
    const view = themeRecordView(record);
    assert.equal(view.tokens.length, 0, 'ardesia-dark declares no tokens of its own');
    assert.deepEqual(
      view.rootOther.map((d) => `${d.node.property}: ${d.node.value}`),
      ['color-scheme: dark'],
      'color-scheme must land in rootOther, never the token record',
    );
    assert.match(serializeThemeRecord(record, { canonical: true }), /color-scheme:\s*dark/);
  });

  test('@import survives — it is the entire token content of 13 themes', () => {
    let importing = 0;
    for (const f of THEME_FILES) {
      const record = parseTheme(readTheme(f));
      const imports = themeRecordView(record).atRules.filter((a) => a.name === 'import');
      assert.ok(imports.length >= 1, `${f}: lost its @import`);
      if (themeRecordView(record).tokens.length === 0) importing++;
      const back = themeRecordView(parseTheme(serializeThemeRecord(record, { canonical: true })));
      assert.deepEqual(
        back.atRules.map((a) => `@${a.name} ${a.prelude}`),
        themeRecordView(record).atRules.map((a) => `@${a.name} ${a.prelude}`),
        `${f}: at-rules changed across a round-trip`,
      );
    }
    // 13, not the 18 the design note gives. 18 is `32 files with an @import`
    // minus `14 self-contained palettes`, and that subtraction double-counts: the
    // four a11y variants BOTH import a11y-base AND declare 19 tokens of their own
    // (their status trio, moved off the red-green axis, is the one thing that
    // differs per CVD type). Only the 13 `*-dark` wrappers declare nothing.
    assert.equal(importing, 13, 'themes whose entire token content comes from an @import');
  });

  test('the non-root tail round-trips untouched', () => {
    // Exactly three files carry rules outside the root scope; they are arbitrary
    // CSS the token model cannot express, and the record's job is to not touch it.
    const withTail = THEME_FILES.filter((f) => themeRecordView(parseTheme(readTheme(f))).tail.length);
    assert.deepEqual(withTail, ['a11y-base.css', 'concrete.css', 'onyx.css']);
    for (const f of withTail) {
      const record = parseTheme(readTheme(f));
      const back = parseTheme(serializeThemeRecord(record, { canonical: true }));
      assert.deepEqual(
        themeRecordView(back).tail.map((r) => r.selector),
        themeRecordView(record).tail.map((r) => r.selector),
      );
    }
  });

  test('`:root` and `:root:root` stay distinct keys', () => {
    // Only `color-scheme` still doubles up (#1826 retired the palette-token
    // duplicates, and checkPackedRootReach now fails them), but the record has to
    // be able to REPRESENT one name at two selectors or the shape is unavailable.
    const view = themeRecordView(parseTheme(readTheme('a11y-base.css')));
    const selectors = view.rootOther
      .filter((d) => d.node.property === 'color-scheme')
      .map((d) => d.selector);
    assert.deepEqual(selectors.sort(), [':root', ':root:root']);
  });
});

describe('theme-parse — the generator half', () => {
  const map = deriveTheme(STARTERS[0].essentials);

  test('generated CSS re-serializes byte-identically from structure alone', () => {
    // Canonical mode, not raw: this asserts the record can REBUILD a Studio theme,
    // which is what makes the CSS view an edit of the model rather than a fork.
    const css = serializeTheme(map, { name: 'probe', label: 'Probe' });
    assert.equal(serializeThemeRecord(parseTheme(css), { canonical: true }), css);
  });

  test('serializeTheme emits names outside the contract', () => {
    const extras = { 'cat-1-texture': 'url(#t1)', 'brand-navy': '#1F4A6E', 'hljs-tag': '#8250df' };
    const css = serializeTheme({ ...map, ...extras }, { name: 'probe', label: 'Probe' });
    const view = themeRecordView(parseTheme(css));
    assert.deepEqual(view.tokens.filter((t) => !t.contract).map((t) => t.name), Object.keys(extras));
    assert.equal(view.tokens.length, Object.keys(map).length + Object.keys(extras).length);
  });

  test('a map with no extras emits exactly what it emitted before the extras block', () => {
    // The extras block is additive: a theme carrying none keeps its byte layout,
    // so this producer change does not restate every generated theme.
    const css = serializeTheme(map, { name: 'probe', label: 'Probe' });
    // The real assertion: the block is skipped because there is nothing to put in
    // it. A line count passed even under a parser mutation and would fail as
    // `154 !== 153` the day a contract token is added, pointing the reader at the
    // extras block rather than at the contract.
    assert.equal(extraNames(map).length, 0, 'deriveTheme emitted a non-contract name');
    assert.ok(!css.includes('Beyond the token contract'));
  });

  test('a name that is not a valid identifier is never emitted', () => {
    // Before the extras block the emitted names were 107 constants, so `--${name}:`
    // could not be an injection point; now they are caller-supplied, and this work's
    // whole direction is feeding PARSED theme text back through a map.
    const hostile = 'x: red; } </style><script>alert(1)</script> :root { --y';
    const css = serializeTheme({ ...map, [hostile]: '0', 'good-name': '#fff' }, { name: 'probe' });
    assert.ok(!css.includes('alert(1)'), 'a hostile key reached the sheet');
    assert.match(css, /--good-name: #fff;/);
  });

  test('no `:root:root` mirror is emitted', () => {
    // The design note called for one; #1826 landed afterwards and made it a gate
    // failure. `checkPackedRootReach` rejects a custom property declared at both
    // `:root` and `:root:root` — measured at 3 errors per theme with the mirror,
    // 0 without — so emitting it would make every Studio theme un-graduatable for
    // the opposite of the reason the note gives.
    const css = serializeTheme(map, { name: 'probe', label: 'Probe' });
    assert.ok(!/:root:root/.test(css));
  });
});

describe('theme-parse — hazards', () => {
  test('a `</style` literal is carried, never re-escaped into a live terminator', () => {
    // The HARD RULE #22 third-arm hazard, and the reason this does not use
    // css-tree: any CSS serializer normalizes `<\/style` back into a terminator.
    // Carrying the source bytes means this parser cannot manufacture one that was
    // not already written. It is NOT a sanitizer — the guard for a document that
    // embeds this CSS is sanitizeStyleText at the frame — but it must not be a
    // NEW source of the defect.
    const css = ':root {\n  --x: "<\\/style><script>alert(1)<\\/script>";\n}\n';
    const out = serializeThemeRecord(parseTheme(css), { canonical: true });
    assert.ok(out.includes('<\\/style>'), 'the escaped form must survive verbatim');
    assert.ok(!/<\/style>/i.test(out), 'a live terminator must not be manufactured');
  });

  test('a value carrying `;` or braces is one declaration', () => {
    const css = ':root {\n  --a: url("a;b");\n  --grid: { x: 1 };\n  --c: red;\n}\n';
    const decls = themeRecordView(parseTheme(css)).tokens;
    assert.deepEqual(decls.map((t) => t.name), ['a', 'grid', 'c']);
    assert.equal(decls[0].node.value, 'url("a;b")');
  });

  test('!important and block at-rules survive', () => {
    const css = '@media (min-width: 40rem) {\n  :root { --a: red !important; }\n}\n';
    const record = parseTheme(css);
    assert.equal(serializeThemeRecord(record), css);
    const media = record.nodes.find((n) => n.type === 'atrule');
    assert.equal(media.prelude, '(min-width: 40rem)');
    const decl = media.nodes.find((n) => n.type === 'rule').nodes.find((n) => n.type === 'decl');
    assert.equal(decl.important, true);
    assert.equal(decl.value, 'red');
  });

  test('an unbalanced `}` does not hang the parser', () => {
    // Deleting an opening brace is the most common transient state in a CSS editor,
    // and it used to spin parseNodes forever: `statementEnd` stopped at the stray
    // `}` without consuming it, so `i` never advanced. Not a throw the caller could
    // catch — a frozen main thread, taking the author's unsaved work with it.
    const cases = [
      '}',
      '  }',
      ':root { --a: red; }\n}',
      ':root  --accent: red; }',
      ':root{--a:url(a}b);}',
      String.raw`.a\}b { --a: red; }`,
      String.raw`:root{ --a: \}; --b: red; }`,
    ];
    for (const css of cases) {
      const record = parseTheme(css);
      assert.equal(serializeThemeRecord(record), css, `${JSON.stringify(css)}: not byte-identical`);
    }
  });

  test('a colon-less statement keeps its `;` — no welded `</style`, no swallowed token', () => {
    // Both halves of one defect. The renderer dropped a `raw` node's semicolon, so
    // the fragment welded onto whatever followed.
    //
    // (a) It MANUFACTURED a terminator out of source containing none, falsifying the
    //     property this module's docblock asserts. Removal composes as well as
    //     re-escaping, which the "we carry source bytes" argument did not cover.
    const welded = serializeThemeRecord(parseTheme(':root{x</;style>y:1;}'), { canonical: true });
    assert.ok(!/<\/style/i.test(welded), `manufactured a live terminator: ${welded}`);

    // (b) It DELETED a real token. A missing colon is a routine typo, and one save
    //     used to take the next declaration with it.
    const src = ':root {\n  --accent red;\n  --ink: #111;\n}\n';
    const out = serializeThemeRecord(parseTheme(src), { canonical: true });
    assert.deepEqual(themeRecordView(parseTheme(out)).tokens.map((t) => t.name), ['ink']);
  });

  test('an unterminated block keeps its last character', () => {
    // blockEnd returns the end of input when the brace is still open, and slicing
    // `close - 1` unconditionally ate one byte — a color losing a digit mid-typing,
    // with the wrong value landing in the record a live audit reads.
    const out = serializeThemeRecord(parseTheme(':root{--accent: #ff0000'), { canonical: true });
    assert.match(out, /--accent: #ff0000/);
    assert.equal(tokenMapBySelector(parseTheme(out)).get(':root').get('accent'), '#ff0000');
  });

  test('adding or removing a declaration is not discarded', () => {
    // `dirty` climbing from children catches a MUTATED node, but an added one has no
    // flag and a removed one has no node to flag — so the clean parent's raw slice
    // masked both. Adding and removing tokens is most of what a theme editor does.
    const src = ':root {\n  --a: red;\n  --b: blue;\n}\n';
    const added = parseTheme(src);
    added.nodes.find((n) => n.type === 'rule').nodes.push({
      type: 'decl', property: '--c', value: 'green', semicolon: true, before: '\n  ',
    });
    assert.match(serializeThemeRecord(added), /--c: green;/);

    const removed = parseTheme(src);
    const rule = removed.nodes.find((n) => n.type === 'rule');
    rule.nodes = rule.nodes.filter((n) => n.property !== '--b');
    assert.ok(!serializeThemeRecord(removed).includes('--b'), 'removed declaration still emitted');
  });

  test('a root block nested in an at-rule is still in the view', () => {
    // Walking only the top level put its tokens in NO bucket — invisible to the
    // view, and so indistinguishable from missing to anything reading the record.
    const view = themeRecordView(parseTheme(
      ':root{--bg:#fff;}\n@media (prefers-contrast: more){:root{--accent:#000;}}',
    ));
    assert.deepEqual(view.tokens.map((t) => t.name), ['bg', 'accent']);
  });

  test('`:ROOT` and a comment before the brace are still the root scope', () => {
    // CSS pseudo-classes are ASCII case-insensitive, and a comment may sit between
    // the selector and its brace. Classifying either as a non-root rule drops all
    // ~107 tokens out of the view, which the conformance rung reads as a wholly
    // missing contract — the false indictment the design note argues against.
    assert.deepEqual(themeRecordView(parseTheme(':ROOT{--a:red;}')).tokens.map((t) => t.name), ['a']);
    assert.deepEqual(
      themeRecordView(parseTheme(':root /* palette */ {--a:red;}')).tokens.map((t) => t.name), ['a'],
    );
  });

  test('CSS escapes are honored outside string literals too', () => {
    // `.a\}b` is a class named `a}b`; treating that `}` as a block closer mis-sliced
    // the selector, and for `\}` it hung the parser outright.
    for (const css of [
      String.raw`.a\{b { --a: red; }`,
      String.raw`:root{ --a: \"; --b: red; }`,
    ]) {
      assert.equal(serializeThemeRecord(parseTheme(css)), css);
    }
    const view = themeRecordView(parseTheme(String.raw`:root{ --a: \"; --b: red; }`));
    assert.deepEqual(view.tokens.map((t) => t.name), ['a', 'b']);
  });

  test('a selector with any non-root arm is not the root scope', () => {
    // `:root, section` reaches slides; treating it as root scope would let a
    // slide-level rule be edited as if it were a token declaration.
    assert.ok(isRootIsh(':root'));
    assert.ok(isRootIsh(':root:root'));
    assert.ok(isRootIsh(':where(:root)'));
    assert.ok(!isRootIsh(':root, section'));
    assert.ok(!isRootIsh('section'));
    assert.ok(!isRootIsh(':is(:root, section)'));
  });

  test('malformed and exotic input round-trips rather than throwing', () => {
    // A hand-edit surface is fed half-finished CSS on every keystroke, so the
    // parser has to survive input no theme file would ever contain. Each of these
    // must (a) not throw, (b) re-emit its source byte-for-byte in raw mode, and
    // (c) be idempotent in canonical mode — a second pass changing the output
    // would mean saving twice produces two different files.
    const cases = {
      'unterminated comment': ':root{--a:red}\n/* oops',
      'no trailing semicolon': ':root{--a:red}',
      'brace inside a selector string': '[data-x="}"]{--a:red;}',
      'semicolon inside url()': ':root{--a:url("a;b");--b:blue;}',
      'comment inside a value': ':root{--a: red /* hi */ !important;}',
      'nested rule': ':root{--a:red;&:hover{--a:blue;}}',
      'empty value': ':root{--x:;}',
      CRLF: ':root {\r\n  --a: red;\r\n}\r\n',
      BOM: '﻿:root{--a:red;}',
      '@charset and a block at-rule': '@charset "utf-8";\n@media print{:root{--a:red}}',
      'repeated root': ':root:root:root{--a:red;}',
      'escaped quote in a string': ':root{--a:"a\\"b;c";}',
      'empty input': '',
      'whitespace only': '   \n\n  ',
      'uppercase !IMPORTANT': ':root{--a:red !IMPORTANT;}',
    };
    for (const [label, css] of Object.entries(cases)) {
      const record = parseTheme(css);
      assert.equal(serializeThemeRecord(record), css, `${label}: not byte-identical`);
      const once = serializeThemeRecord(record, { canonical: true });
      const twice = serializeThemeRecord(parseTheme(once), { canonical: true });
      assert.equal(twice, once, `${label}: canonical output is not idempotent`);
    }
  });

  test('canonical output is idempotent across the corpus', () => {
    // Saving a theme twice must not keep changing it.
    for (const f of THEME_FILES) {
      const once = serializeThemeRecord(parseTheme(readTheme(f)), { canonical: true });
      const twice = serializeThemeRecord(parseTheme(once), { canonical: true });
      assert.equal(twice, once, `${f}: canonical output is not idempotent`);
    }
  });

  test('editing one node leaves every other byte alone', () => {
    // The product claim behind raw mode: saving after a one-token edit must not
    // reformat the author's file.
    const css = readTheme('indaco.css');
    const record = parseTheme(css);
    const target = themeRecordView(record).tokens.find((t) => t.name === 'accent');
    target.node.value = '#123456';
    target.node.dirty = true;
    const out = serializeThemeRecord(record);
    assert.ok(out.includes('--accent: #123456;'));
    assert.equal(out.split('\n').length, css.split('\n').length, 'line count moved — something else was rewritten');
    // Everything except the edited line is untouched.
    const before = css.split('\n');
    const after = out.split('\n');
    const changed = before.map((l, i) => (l === after[i] ? null : i)).filter((i) => i != null);
    assert.equal(changed.length, 1, `expected exactly one changed line, got ${changed.length}`);
  });

  /**
   * FLATTENING THE RECORD FOR THE AUDIT (`themeTokenMap`).
   *
   * The Studio's contrast meter takes a flat `{ name: value }` map, so the CSS view
   * has to reduce the record to one — and the reduction is NOT "last declaration
   * wins". Across selectors CSS resolves by SPECIFICITY and does not care which came
   * first, so a `:where(:root)` fallback written at the bottom of a file must lose to
   * the `:root` declaration above it. Getting that backwards would make the meter
   * measure a palette nobody renders.
   */
  describe('themeTokenMap — the flat map the audit consumes', () => {
    test('specificity beats source order, in both directions', () => {
      assert.equal(themeTokenMap(parseTheme(':root{--accent:#111}\n:where(:root){--accent:#999}')).accent, '#111',
        'a zero-specificity fallback written LATER must not win');
      assert.equal(themeTokenMap(parseTheme(':root:root{--accent:#999}\n:root{--accent:#111}')).accent, '#999',
        '…and a higher-specificity declaration written EARLIER still wins');
    });

    /**
     * THE TWO AXES ABOVE SPECIFICITY, both checked against real Chromium during
     * review and both wrong in the first cut. A flatten that gets these backwards
     * makes the WCAG meter measure a palette nobody renders — and, worse,
     * `essentialsFromMap` then PERSISTS those values into the stored record.
     */
    test('`!important` beats specificity, wherever it was written', () => {
      assert.equal(themeTokenMap(parseTheme(':where(:root){--accent:red !important}\n:root{--accent:blue}')).accent, 'red');
      assert.equal(themeTokenMap(parseTheme(':root:root{--accent:blue}\n:root{--accent:red !important}')).accent, 'red');
      // Two importants fall back to the axes below: specificity, then source order.
      assert.equal(themeTokenMap(parseTheme(':where(:root){--accent:red !important}\n:root{--accent:blue !important}')).accent, 'blue');
    });

    test('a token inside a CONDITIONAL at-rule is not the unconditional value', () => {
      // A `@media (prefers-color-scheme: dark)` block is the most idiomatic thing a
      // hand-editor adds, it sits later in the file, and read as an ordinary
      // declaration it won the LIGHT canvas too. It stays in the record — the view
      // still carries it — but a flat map has nowhere to put "…when dark".
      const css = ':root{--accent:blue}\n@media (prefers-color-scheme: dark){:root{--accent:red}}';
      assert.equal(themeTokenMap(parseTheme(css)).accent, 'blue');
      assert.equal(themeTokenMap(parseTheme(':root{--accent:blue}\n@media print{:root{--accent:red}}')).accent, 'blue');
      // …and it is NOT dropped from the record itself.
      const view = themeRecordView(parseTheme(css));
      assert.equal(view.tokens.filter((t) => t.name === 'accent').length, 2);
      assert.deepEqual(view.tokens.map((t) => t.conditional), [false, true]);
    });

    test('a selector LIST takes the strongest of its parts, in either order', () => {
      // Read as one string, `:where(:root), :root` scored 0 (the prefix swallowed the
      // list) and `:root, :where(:root)` scored 2 (counting across the comma).
      assert.equal(rootSpecificity(':where(:root), :root'), 1);
      assert.equal(rootSpecificity(':root, :where(:root)'), 1);
      assert.equal(themeTokenMap(parseTheme(':where(:root), :root{--accent:red}\n:where(:root){--accent:blue}')).accent, 'red');
    });

    test('within one selector it IS source order — that half is unchanged', () => {
      assert.equal(themeTokenMap(parseTheme(':root{--accent:#111;--accent:#999}')).accent, '#999');
    });

    test('rootSpecificity ranks the shapes isRootIsh admits', () => {
      assert.deepEqual(
        [':where(:root)', ':root', ':is(:root)', ':root:root', ':ROOT', ':root /* c */'].map(rootSpecificity),
        [0, 1, 1, 2, 1, 1],
      );
    });

    test('every self-contained shipped palette audits CLEAN through the flatten', () => {
      // The end-to-end claim: parse a real theme, flatten it, and the contrast auditor
      // reaches the same verdict the palette gate does. A flatten that dropped or
      // mis-ranked a token would show up here as a failure or a missing row.
      let checked = 0;
      for (const f of THEME_FILES) {
        const record = parseTheme(readTheme(f));
        const composes = themeRecordView(record).atRules
          .some((a) => a.name === 'import' && !/^(['"])lattice\1;?$/.test(a.prelude.trim()));
        if (composes) continue; // inherits its tokens; the record alone cannot audit
        checked++;
        const audit = auditBoth(themeTokenMap(record), { level: 'gate' });
        assert.equal(audit.ok, true, `${f}: ${JSON.stringify(audit.light.failures.concat(audit.light.missing).slice(0, 3))}`);
      }
      assert.equal(checked, 14, 'the 14 palettes whose only import is the base');
    });

    test('renameThemeDirective rewrites one token, and refuses a name it can only see half of', () => {
      const css = readTheme('indaco.css');
      const out = renameThemeDirective(css, 'harbor');
      const changed = css.split('\n').map((l, i) => (l === out.split('\n')[i] ? null : i)).filter((i) => i != null);
      assert.deepEqual(changed, [0], 'exactly the header line, and nothing else');
      assert.match(out, /@theme harbor\b/);
      assert.equal(renameThemeDirective(css, 'indaco'), css, 'the same name is a no-op');
      assert.equal(renameThemeDirective(':root{--a:1}', 'x'), ':root{--a:1}', 'no directive → untouched');
      assert.equal(renameThemeDirective(css, 'Bad Name'), css, 'an invalid slug → untouched');
      // THE SCAN BOUNDARY. With ~4 KB of preamble (a pasted license header) the
      // 4096-char head can hold a TRUNCATED name, and splicing over only the visible
      // part produced `@theme harborjklmnop` — a directive that is neither name, in
      // the one function that promises to touch a single token.
      const truncating = `/*${'x'.repeat(4076)}*/@theme abcdefghijklmnop\n:root{}`;
      assert.equal(renameThemeDirective(truncating, 'harbor'), truncating);
    });

    test('a composing theme flattens to what it DECLARES, not to what it renders', () => {
      // Stated so nobody reads a `missing` row off a wrapper as a defect: the record
      // is one file. `themes/ardesia-dark.css` declares zero tokens and is correct.
      assert.deepEqual(themeTokenMap(parseTheme(readTheme('ardesia-dark.css'))), {});
    });
  });
});
