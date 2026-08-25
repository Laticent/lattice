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
 * the `@import` that carries the entire content of 18 files. Each of those has
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

const {
  parseTheme, serializeThemeRecord, themeRecordView, tokenMapBySelector, isRootIsh,
} = require('../../../lib/theme/parse.js');
const { deriveTheme, requiredTokenList } = require('../../../lib/theme/derive.js');
const { serializeTheme } = require('../../../lib/theme/serialize.js');
const { STARTERS } = require('../../../lib/theme/starters.js');

const THEMES_DIR = path.join(__dirname, '..', '..', '..', 'themes');
const THEME_FILES = fs.readdirSync(THEMES_DIR).filter((f) => f.endsWith('.css')).sort();
const readTheme = (f) => fs.readFileSync(path.join(THEMES_DIR, f), 'utf8');

/**
 * Every selector, at-rule and declaration in source order — the three things the
 * acceptance criterion names, and nothing else. Comments contribute their length
 * rather than their text so the fingerprint stays a structural claim.
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
      const twice = parseTheme(serializeThemeRecord(once, { canonical: true }));
      assert.deepEqual(fingerprint(twice), fingerprint(once), `${f}: structure changed across a round-trip`);
    }
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
    assert.ok(!css.includes('Beyond the token contract'));
    assert.equal(css.split('\n').length, 153);
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
});
