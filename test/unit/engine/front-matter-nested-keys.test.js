/**
 * Unit: lib/engine/directives.js `parseFrontMatter` reads only TOP-LEVEL keys as directives (#2050).
 *
 * It used to read every line through `line.trim()`, so a key nested under a block (`lenses:`,
 * `acronyms:`) that shares a name with a KNOWN_DIRECTIVES entry became the deck's directive:
 * a lens with id `footer` printed its registry, approval digest included, in every footer.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { parseFrontMatter, KNOWN_DIRECTIVES } = require('../../../lib/engine/directives');
const { createEngine } = require('../../../lib/engine');

const fm = (lines) => `---\n${lines.join('\n')}\n---\n\n# Slide\n\nBody.\n`;
const LENS = '  footer: { label: "Footer view", base: none, approved: "sha256:16a4077" }';

describe('parseFrontMatter: a nested key is not a directive (#2050)', () => {
  test('the issue repro: a lens named `footer` sets no footer directive', () => {
    const { directives } = parseFrontMatter(fm(['marp: true', 'theme: indaco', 'lenses:', LENS]));
    assert.equal(directives.footer, undefined);
    assert.equal(directives.theme, 'indaco');
  });

  test('a nested key AFTER a real directive does not clobber it', () => {
    const { directives } = parseFrontMatter(fm(['footer: Real footer', 'lenses:', LENS]));
    assert.equal(directives.footer, 'Real footer');
  });

  test('every KNOWN_DIRECTIVES name is ignored when nested, and read when top-level', () => {
    for (const key of KNOWN_DIRECTIVES) {
      const nested = parseFrontMatter(fm(['block:', `  ${key}: nested`, `\t${key}: tabbed`])).directives;
      assert.equal(nested[key], undefined, `nested ${key}`);
      const top = parseFrontMatter(fm([`${key}: top   `])).directives;
      assert.equal(top[key], 'top', `top-level ${key}`);
    }
  });

  test('the render stamps no data-footer from a nested key', () => {
    const html = createEngine().render(fm(['marp: true', 'theme: indaco', 'lenses:', LENS]), {}).html;
    assert.doesNotMatch(html, /data-footer=/);
    const kept = createEngine().render(fm(['theme: indaco', 'footer: Real footer', 'lenses:', LENS]), {}).html;
    assert.match(kept, /data-footer="Real footer"/);
  });
});

describe('a repeated top-level key reads as its LAST line everywhere, and lint warns (#3050, D1)', () => {
  const { topLevelFrontMatterValue } = require('../../../lib/core/front-matter-key');
  const { readGlobalStyle } = require('../../../lib/core/front-matter-style.js');
  const core = require('../../../lib/authoring/lint-core');

  test('the engine and the shared reader agree on the last line, and on `key :`', () => {
    for (const lines of [['theme: cuoio', 'theme: indaco'], ['size: 16:9', 'size : story'], ['class: kpi', 'foo:', '  class: x', 'class: dark']]) {
      const key = lines[0].split(':')[0].trim();
      const engine = parseFrontMatter(fm(lines)).directives[key];
      assert.equal(topLevelFrontMatterValue(lines.join('\n'), key), engine, lines.join(' / '));
    }
  });

  test('the export pastes the last top-level `style:`, in either form', () => {
    assert.equal(readGlobalStyle('style: "a{}"\nstyle: "b{}"'), 'b{}');
    assert.equal(readGlobalStyle('style: "a{}"\nstyle : |\n  z{}\n'), 'z{}');
  });

  test('the general reader (`frontMatterValue`, e.g. `finish:`, `motion:`) takes the last top-level line too', () => {
    const { frontMatterValue, frontMatterName } = require('../../../lib/core/front-matter-key');
    // The checker's refutation of the first cut: these registers still read the FIRST line, so the
    // `duplicate-key` message told the author to delete the live one.
    assert.equal(frontMatterName('finish: sketch\nfinish: paper', 'finish'), 'paper');
    assert.equal(frontMatterValue('motion: off\nmotion : on', 'motion'), 'on');
    // A top-level line beats a nested one; a key that is ONLY nested still reads, as it always has.
    assert.equal(frontMatterValue('lenses:\n  logo: nested\nlogo: top', 'logo'), 'top');
    assert.equal(frontMatterValue('brand:\n  logo: nested', 'logo'), 'nested');
  });

  test('`duplicate-key` warns on each EARLIER line and names the line that wins', () => {
    const src = fm(['theme: cuoio', 'class: kpi', 'theme: indaco', 'style: |', '  theme: not-a-key', 'theme : carbone']);
    const found = core.lintTextWith(src, {}).filter((f) => f.rule === 'duplicate-key');
    assert.deepEqual(found.map((f) => f.line), ['theme: cuoio', 'theme: indaco']);
    assert.match(found[0].message, /the last wins: `theme : carbone`/);
    assert.ok(found.every((f) => f.severity === 'warning' && f.slide === 0));
    // One line per key is clean, and a nested key is not a repeat.
    assert.equal(core.lintTextWith(fm(['theme: indaco', 'lenses:', '  theme: x']), {}).filter((f) => f.rule === 'duplicate-key').length, 0);
  });

  test('every value check reads the line that wins: `unknown-mode` on a live `zzz`, nothing on a dead `bogus`', () => {
    // The checker's repro on the second cut: the linter's own value checks still read the FIRST line, so a
    // live `mode: zzz` went unreported while the deck silently fell back.
    const { lintText, buildVocab } = require('../../../lib/authoring/lint');
    const vocab = buildVocab();
    const rules = (lines) => lintText(fm(['theme: indaco', ...lines]), { vocab }).filter((f) => f.slide === 0).map((f) => `${f.rule}:${f.classToken}`);
    assert.ok(rules(['mode: sketch', 'mode: zzz']).includes('unknown-mode:zzz'));
    assert.ok(!rules(['finish: bogus', 'finish: halo']).some((r) => r.startsWith('unknown-finish')));
  });

  test('a render-target key says it is read as a union, not that the last line wins', () => {
    const found = core.lintTextWith(fm(['player: true', 'player: false']), {}).filter((f) => f.rule === 'duplicate-key');
    assert.equal(found.length, 1);
    assert.match(found[0].message, /any `on` line turns it on/);
  });

  test('a repeated block key reads its LAST block, and the warning says so', () => {
    const found = core.lintTextWith(fm(['lexicon:', '  foo: bar', 'lexicon:', '  baz: qux']), {}).filter((f) => f.rule === 'duplicate-key');
    assert.equal(found.length, 1);
    assert.match(found[0].message, /the last wins\./);
  });

  test('backdrop: and tag: checks read the line that wins', () => {
    const { lintText, buildVocab } = require('../../../lib/authoring/lint');
    const vocab = buildVocab();
    const rules = (lines) => lintText(fm(['theme: indaco', ...lines]), { vocab }).filter((f) => f.slide === 0).map((f) => f.rule);
    assert.ok(rules(['backdrop: 40', 'backdrop: bogus']).includes('unknown-backdrop'));
    assert.ok(!rules(['backdrop: bogus', 'backdrop: 40']).includes('unknown-backdrop'));
  });

  test('a key named after an Object.prototype member does not crash the walk', () => {
    // The duplicate scan once collected keys in a plain `{}`, so `constructor:` found an inherited function.
    for (const key of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
      assert.doesNotThrow(() => core.lintTextWith(fm([`${key}: x`]), {}), key);
      const dup = core.lintTextWith(fm([`${key}: a`, `${key}: b`]), {}).filter((f) => f.rule === 'duplicate-key');
      assert.equal(dup.length, 1, key);
    }
  });

  test('the plugin host reads the LAST `plugins:` line, and the class probe reads the LAST column-0 `class:` line', async () => {
    const { deckPluginList, deckClassTokens } = await import('../../../lib/core/deck-plugins.mjs');
    const deck = '---\nplugins: alpha\nclass: lead\nplugins: beta\nclass: kpi\npptx:\n  class: nested\n---\n\n# A\n';
    assert.deepEqual(deckPluginList(deck), ['beta']);
    // A dead or nested `class:` is not the deck's class: the CLI refuses an unapproved code package by these tokens.
    assert.deepEqual(deckClassTokens(deck), ['kpi']);
  });
});

describe('a repeated key: every writer and stripper acts on EVERY top-level line (#3050, D1)', () => {
  const core = require('../../../lib/authoring/lint-core');
  const REPEATS = {
    'inline then block': '---\nplugins: [a]\ntheme: x\nplugins:\n  - b\n  - c\n---\n\n# A\n',
    'adjacent lines': '---\nplugins: [a]\nplugins: [b]\n---\n\n# A\n',
    'empty last line': '---\nplugins: [a]\nplugins:\ntheme: x\n---\n\n# A\n',
    'spaced colon': '---\nplugins: [a]\ntheme: x\nplugins : [b]\n---\n\n# A\n',
    CRLF: '---\r\nplugins: [a]\r\ntheme: x\r\nplugins: [b]\r\n---\r\n\r\n# A\r\n',
    BOM: '\uFEFF---\nplugins: [a]\ntheme: x\nplugins: [b]\n---\n\n# A\n',
  };
  for (const [name, deck] of Object.entries(REPEATS)) {
    test(`writeDeckPlugins, ${name}: clearing leaves no list, and a write leaves one line`, async () => {
      const { deckPluginList, writeDeckPlugins } = await import('../../../lib/core/deck-plugins.mjs');
      const cleared = writeDeckPlugins(deck, []);
      assert.deepEqual(deckPluginList(cleared), []);
      assert.doesNotMatch(cleared, /^plugins/m);
      assert.match(cleared, /theme: x|# A/);
      const written = writeDeckPlugins(deck, ['g']);
      assert.deepEqual(deckPluginList(written), ['g']);
      assert.equal(written.match(/^plugins/gm).length, 1);
    });
  }

  test('the auto glossary strips every `glossary:` line, so a second pass adds nothing', async () => {
    const { appendAutoGlossary } = await import('../../../lib/core/glossary-auto.mjs');
    for (const head of [['glossary: auto', 'glossary: auto'], ['glossary: off', 'glossary: auto']]) {
      const deck = `---\n${head.join('\n')}\nacronyms:\n  ARR: { expansion: annual recurring revenue, definition: \"Revenue that recurs yearly.\" }\n---\n\n# A\n\nOur ARR rose.\n`;
      const once = appendAutoGlossary(deck);
      assert.doesNotMatch(once, /^glossary/m, head.join(' / '));
      assert.equal(appendAutoGlossary(once), once, head.join(' / '));
    }
  });

  test('an indented-only `glossary: auto` is the trigger the reader reads, so the strip removes it too', async () => {
    const { appendAutoGlossary } = await import('../../../lib/core/glossary-auto.mjs');
    const deck = '---\n  glossary: auto\nacronyms:\n  ARR: { expansion: annual recurring revenue, definition: "Revenue that recurs yearly." }\n---\n\n# A\n\nOur ARR rose.\n';
    const once = appendAutoGlossary(deck);
    assert.notEqual(once, deck);
    assert.equal(appendAutoGlossary(once), once);
  });

  test('--print collapses a spaced repeat of `color-mode:` too', () => {
    const { withPrintColorMode, readFrontMatterColorMode } = require('../../../lib/core/resolve-color-mode');
    const out = withPrintColorMode('---\ncolor-mode: dark\ncolor-mode : light\n---\n\n# A\n');
    assert.doesNotMatch(out, /light/);
    assert.equal(readFrontMatterColorMode(out), 'print');
  });

  test('bakeSplits leaves one `split:` line', () => {
    const { bakeSplits } = require('../../../lib/core/bake-splits');
    const out = bakeSplits('---\nsplit: rule\nsplit: headings\n---\n\n# A\n\n## B\n\nText.\n');
    assert.equal(out.match(/^split/gm).length, 1);
  });

  test('the unknown-plugin fix edits the live line, and the fit finding quotes a top-level line', () => {
    const { applyFix } = require('../../../lib/authoring/lint-core');
    const deck = fm(['plugins: [mermiad]', 'theme: indaco', 'plugins: [mermiad, pills]']);
    const f = core.lintTextWith(deck, {}).find((x) => x.rule === 'unknown-plugin');
    assert.ok(f, 'unknown-plugin fires');
    assert.equal(f.line, 'plugins: [mermiad, pills]');
    assert.match(applyFix(deck, f), /plugins: \[mermiad\]\ntheme: indaco\nplugins: \[mermaid, pills\]/);
    // Identical dead and live lines: `chunkLine` starts the fix at the live one.
    for (const twin of [fm(['plugins: [mermiad]', 'plugins: [mermiad]']), fm(['plugins:', '  - mermiad', 'theme: x', 'plugins:', '  - mermiad'])]) {
      const t = core.lintTextWith(twin, {}).find((x) => x.rule === 'unknown-plugin');
      const fixed = applyFix(twin, t);
      assert.ok(fixed.indexOf('mermiad') < fixed.indexOf('mermaid') && fixed.includes('mermaid'), fixed);
    }
    const { lintText, buildVocab } = require('../../../lib/authoring/lint');
    const fit = lintText(fm(['fit: reprot', 'style: |', '  fit: other']), { vocab: buildVocab() }).find((x) => /fit/.test(x.rule) && x.slide === 0);
    assert.ok(fit, 'the fit register reports `reprot`');
    assert.equal(fit.line, 'fit: reprot');
  });

  test('the retired `form:` check reads the last line', () => {
    const retired = (lines) => core.lintTextWith(fm(lines), {}).filter((x) => x.rule === 'retired-form-key');
    assert.equal(retired(['form: on', 'form: off']).length, 1);
    assert.equal(retired(['form: off', 'form: on']).length, 0);
  });
});
