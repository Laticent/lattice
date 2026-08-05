/**
 * Unit: the deck-wide `class:` register — what it admits, what it refuses, and
 * what the export boundary emits.
 *
 * The behavior over the whole input space is the table in
 * test/unit/core/color-register-table.test.js; this file pins the KERNEL itself,
 * including the cases the table cannot reach — CRLF sources, a duplicate register,
 * a deck with no front matter at all.
 *
 * See lib/core/deck-class-register.js and
 * engineering/decisions/2026-08-05-deck-class-register-boundary.md.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  deckClassRefusal, deckClassTokens, deckClassValue, deckClassRefusals,
  deckClassTokensFromFrontMatter, deckClassRefusalsFromFrontMatter, withSanitizedDeckClass,
} = require('../../../lib/core/deck-class-register');
const {
  withPrintColorMode, deckPrintBand, deckColorModeToken, frontMatterBody,
} = require('../../../lib/core/resolve-color-mode');

describe('deck-class register — refusals', () => {
  test('a component name is refused whether or not `color-mode:` is set', () => {
    assert.equal(deckClassRefusal('kpi', ''), 'component');
    assert.equal(deckClassRefusal('kpi', 'color-light'), 'component');
    assert.equal(deckClassRefusal('content', ''), 'component');
  });

  test('a color-axis token is refused only when `color-mode:` is set', () => {
    assert.equal(deckClassRefusal('dark', ''), null);
    assert.equal(deckClassRefusal('dark', 'color-light'), 'color-mode');
    assert.equal(deckClassRefusal('print', 'dark'), 'color-mode');
    assert.equal(deckClassRefusal('print', ''), null);
  });

  test('everything else is admitted — a modifier, a variant, an unknown token', () => {
    for (const t of ['no-note', 'safe', 'lifted', 'spectrum-off', 'zzzz-not-a-thing']) {
      assert.equal(deckClassRefusal(t, 'dark'), null, t);
    }
  });

  test('authored order is preserved, and the refusals report both reasons', () => {
    assert.deepEqual(deckClassTokens('no-note kpi dark safe', 'color-light'), ['no-note', 'safe']);
    assert.equal(deckClassValue('no-note kpi dark safe', 'color-light'), 'no-note safe');
    assert.deepEqual(deckClassRefusals('no-note kpi dark safe', 'color-light'), [
      { token: 'kpi', reason: 'component' },
      { token: 'dark', reason: 'color-mode' },
    ]);
  });

  test('an empty / absent register is not an error', () => {
    assert.deepEqual(deckClassTokens('', ''), []);
    assert.deepEqual(deckClassTokens(undefined, ''), []);
    assert.deepEqual(deckClassRefusals(null, 'dark'), []);
  });

  test('reading straight off a front-matter body pairs the two keys in one place', () => {
    const fm = 'marp: true\ncolor-mode: light\nclass: dark kpi no-note';
    assert.deepEqual(deckClassTokensFromFrontMatter(fm), ['no-note']);
    assert.deepEqual(deckClassRefusalsFromFrontMatter(fm).map((r) => r.token), ['dark', 'kpi']);
    // …and with no `color-mode:` the alias survives, so a deck that never migrated
    // renders exactly as it always did.
    assert.deepEqual(deckClassTokensFromFrontMatter('marp: true\nclass: dark no-note'), ['dark', 'no-note']);
  });
});

describe('deck-class register — the export boundary', () => {
  const deck = (lines) => `---\n${lines.join('\n')}\n---\n\n## S\n\ntext\n`;

  test('a refused token is gone from the emitted bytes', () => {
    const out = withSanitizedDeckClass(deck(['marp: true', 'color-mode: light', 'class: dark no-note']));
    assert.match(out, /^---\nmarp: true\ncolor-mode: light\nclass: no-note\n---\n/);
  });

  test('a register with nothing admitted loses its line, not just its value', () => {
    const out = withSanitizedDeckClass(deck(['marp: true', 'class: kpi', 'theme: indaco']));
    assert.match(out, /^---\nmarp: true\ntheme: indaco\n---\n/);
    assert.ok(!/class:/.test(out.split('---')[1]), 'no bare `class:` invites re-adding the refused token');
  });

  test('a duplicate register collapses to one line — Lattice reads the first, js-yaml the last', () => {
    const out = withSanitizedDeckClass(deck(['marp: true', 'class: no-note', 'class: safe']));
    assert.equal((out.match(/^[ \t]*class:/gm) || []).length, 1);
    assert.match(out, /class: no-note/, 'the FIRST wins, matching how Lattice reads it');
  });

  test('CRLF survives as a line terminator rather than becoming part of the value', () => {
    const src = '---\r\nmarp: true\r\nclass: kpi safe\r\n---\r\n\r\n## S\r\n';
    const out = withSanitizedDeckClass(src);
    assert.match(out, /\r\nclass: safe\r\n/);
    assert.ok(!/kpi/.test(out));
  });

  test('a deck with nothing to change comes back byte-identical', () => {
    for (const src of [
      deck(['marp: true', 'class: no-note']),
      deck(['marp: true', 'theme: indaco']),
      '# No front matter at all\n',
      '',
    ]) {
      assert.equal(withSanitizedDeckClass(src), src);
    }
  });

  test('it is idempotent — re-exporting a bundle changes nothing further', () => {
    const once = withSanitizedDeckClass(deck(['marp: true', 'color-mode: dark', 'class: light kpi safe']));
    assert.equal(withSanitizedDeckClass(once), once);
  });

  test('an INDENTED `class:` is not the register — a nested key survives', () => {
    // `frontMatterValue` matches `^[ \t]*class:`, so a nested key ABOVE the real
    // one is what a naive read returns. Acting on that while rewriting the
    // top-level line deletes a register the author wrote, decided by a token from
    // somewhere else. The writer reads its own target.
    const src = '---\nmarp: true\nfoo:\n  class: kpi\nclass: safe\n---\n\n## S\n';
    assert.equal(withSanitizedDeckClass(src), src);
  });

  test('a `class:` line inside a block scalar is text, not a register', () => {
    const src = '---\nmarp: true\nstyle: |\n  class: kpi\nclass: kpi safe\n---\n\n## S\n';
    assert.match(withSanitizedDeckClass(src), /style: \|\n {2}class: kpi\nclass: safe\n/);
  });

  test('an INDENTED `color-mode:` does not supersede the alias', () => {
    const src = '---\nfoo:\n  color-mode: light\nclass: dark\n---\n\n## S\n';
    assert.equal(withSanitizedDeckClass(src), src, 'a nested key is not the deck register');
  });

  test('refusing a deck\'s ONLY register drops the whole block', () => {
    // …so it ends up exactly as clean as a deck that never had one, rather than
    // carrying an empty `---\n---` fence. Matches the Studio's own front-matter
    // writer when it clears the last key.
    assert.equal(withSanitizedDeckClass('---\nclass: kpi\n---\n\n## S\n'), '## S\n');
  });

  test('the READER applies the writer\'s column-0 rule — a nested key is not the register', () => {
    // The half that was missing. `frontMatterValue`'s `^[ \t]*key:` matched a NESTED
    // key, so the render path read `color-mode: light` off a child of `foo:`, called
    // the author's real `class: dark` superseded, and dropped it — while the export
    // writer, anchored at column 0, saw no `color-mode:` at all and kept `dark` in
    // the bytes. One source, two decks, which is the whole failure this change ends.
    const fm = 'foo:\n  color-mode: light\nclass: dark';
    assert.equal(deckColorModeToken(fm), '', 'a nested `color-mode:` is not the deck register');
    assert.deepEqual(deckClassTokensFromFrontMatter(fm), ['dark'], 'so it supersedes nothing');
    // …and the export boundary agrees, byte for byte.
    const src = `---\n${fm}\n---\n\n## S\n`;
    assert.equal(withSanitizedDeckClass(src), src);
  });

  test('a `class:` inside a block scalar is not the register on the READ side either', () => {
    assert.deepEqual(deckClassTokensFromFrontMatter('style: |\n  class: kpi\nclass: dark'), ['dark']);
    assert.equal(deckPrintBand('---\nfoo:\n  class: print\n---\n'), false, 'a nested `class: print` is not a print deck');
    assert.equal(deckPrintBand('---\nclass: print\n---\n'), true);
  });

  test('a body line that merely reads `class:` is not front matter and is untouched', () => {
    const src = `---\nmarp: true\n---\n\n## S\n\nWrite \`class: kpi\` to name a layout.\n`;
    assert.equal(withSanitizedDeckClass(src), src);
  });
});

describe('the print flag writes the register that wins', () => {
  test('it sets `color-mode: print`, not the legacy alias', () => {
    const out = withPrintColorMode('---\nmarp: true\n---\n\n## S\n');
    assert.match(out, /^---\nmarp: true\ncolor-mode: print\n---\n/);
    assert.ok(deckPrintBand(out), 'and the band predicate agrees');
  });

  test('it REPLACES an existing `color-mode:` — the whole point of the change', () => {
    // Merging `print` into `class:` (what this used to do) made the flag a no-op on
    // any deck that set `color-mode:`, because `color-mode:` supersedes the alias.
    const out = withPrintColorMode('---\nmarp: true\ncolor-mode: dark\ntheme: indaco\n---\n\n## S\n');
    assert.match(out, /color-mode: print/);
    assert.ok(!/color-mode: dark/.test(out));
    assert.equal(deckColorModeToken(out.split('---')[1]), 'print');
  });

  test('a duplicate `color-mode:` collapses rather than doubling', () => {
    const out = withPrintColorMode('---\ncolor-mode: dark\ncolor-mode: light\n---\n\n## S\n');
    assert.equal((out.match(/^[ \t]*color-mode:/gm) || []).length, 1);
  });

  test('an INDENTED `color-mode:` is not the register — a block scalar survives', () => {
    const out = withPrintColorMode('---\nmarp: true\nstyle: |\n  color-mode: nonsense\ncolor-mode: dark\n---\n\n## S\n');
    assert.match(out, /style: \|\n {2}color-mode: nonsense\ncolor-mode: print\n/);
  });

  test('a deck with no front matter gets one', () => {
    assert.match(withPrintColorMode('## S\n'), /^---\ncolor-mode: print\n---\n/);
  });

  test('it is idempotent', () => {
    const once = withPrintColorMode('---\nmarp: true\n---\n\n## S\n');
    assert.equal(withPrintColorMode(once), once);
  });
});

// ── color-mode-parse-parity ──────────────────────────────────────────────────
//
// One reader is only half the repair. The RESOLVER agreeing with itself still
// leaves the LINTER free to read the register differently, and then it reports on
// a different deck than the one that renders. `findUnknownColorMode` used to
// capture `[A-Za-z0-9_-]+` anchored to end-of-line, so the exact input this whole
// change is written around —
//
//     color-mode: light  # migrated 2026-08
//
// — failed to match and produced NO finding, while the resolver discarded the
// value and fell the deck through to the theme default. Silence on the one typo
// shape the rule exists to catch (the same defect `pace-parse-parity` pins for
// `pace:`, in test/unit/core/pace-names.test.js).
//
// The contract, for every shape below: the resolver returns a class token
// <=> the linter is quiet.
//
// Note the deliberate asymmetry with `pace:`. `resolve-pace.mjs` strips a trailing
// comment; the shared `frontMatterValue` that every other register reads through
// does not. Rather than fork a second front-matter parse for one key, `color-mode:`
// REFUSES a commented value and says so loudly. See
// engineering/decisions/2026-08-05-deck-class-register-boundary.md.
describe('color-mode-parse-parity — the linter and the resolver read the register identically', () => {
  const { findUnknownColorMode } = require('../../../lib/authoring/lint-core');
  const { COLOR_MODE_NAMES, colorModeClass } = require('../../../lib/core/resolve-color-mode');

  const CASES = [
    ['color-mode: light', 'color-light'],
    ['color-mode: dark', 'dark'],
    ['color-mode: DARK', 'dark'],
    ['color-mode:    dark   ', 'dark'],
    ["color-mode: 'dark'", 'dark'],
    ['color-mode: "dark"', 'dark'],
    ['color-mode: system', 'color-system'],
    ['color-mode: inherited', 'color-inherited'],
    ['color-mode: print', 'print'],
    ['color-mode: darrk', null],
    ['color-mode: lite', null],
    // The #1416 input. Not a YAML comment to this reader — part of the value, so
    // the deck renders the theme default and MUST be told.
    ['color-mode: light  # migrated 2026-08', null],
    ['color-mode: dark # night', null],
    // Trailing punctuation is likewise unknown, and likewise reported.
    ['color-mode: dark.', null],
    // `color-mode:` with nothing after it is an unfinished key, not a typo.
    ['color-mode:', 'EMPTY'],
    ['color-mode:   ', 'EMPTY'],
  ];

  for (const [line, expected] of CASES) {
    test(JSON.stringify(line), () => {
      for (const bom of ['', '﻿']) {
        for (const fence of ['---', '--- ']) {
          const src = `${bom}${fence}\ntheme: cuoio\n${line}\n---\n\n# Slide\n`;
          const label = `${JSON.stringify(line)}${bom ? ' (BOM)' : ''}${fence === '--- ' ? ' (padded fence)' : ''}`;

          const token = deckColorModeToken(frontMatterBody(src));
          const findings = findUnknownColorMode(src, COLOR_MODE_NAMES);

          if (expected === 'EMPTY') {
            assert.equal(token, '', `${label}: an empty value declares no color mode`);
            assert.equal(findings.length, 0, `${label}: an unfinished key is not an unknown register`);
            continue;
          }
          if (expected === null) {
            assert.equal(token, '', `${label}: the resolver must reject this`);
            assert.equal(findings.length, 1,
              `${label}: the resolver DISCARDED this value and the linter said nothing — the deck would silently render the theme default`);
            assert.equal(findings[0].rule, 'unknown-color-mode');
            assert.equal(findings[0].classToken, line.replace(/^color-mode:\s*/, '').trim().replace(/^['"]/, '').replace(/['"]$/, ''),
              `${label}: the finding must name the value the resolver actually saw`);
            continue;
          }
          assert.equal(token, expected, `${label}: resolver`);
          assert.equal(findings.length, 0,
            `${label}: the resolver ACCEPTED this value and the linter warned anyway`);
        }
      }
    });
  }

  test('an INDENTED key is not the register on either side', () => {
    // Parity is not just about the VALUE parse. The resolver reads column 0, so a
    // linter that still read `^[ \t]*` would warn about a nested key nothing
    // resolves — and stay silent about a real one it had already consumed.
    const nested = '---\ntheme: cuoio\nfoo:\n  color-mode: darrk\n---\n\n# S\n';
    assert.equal(deckColorModeToken(frontMatterBody(nested)), '');
    assert.equal(findUnknownColorMode(nested, COLOR_MODE_NAMES).length, 0,
      'a nested key is not the deck register, so there is nothing to warn about');

    const shadowed = '---\nfoo:\n  color-mode: dark\ncolor-mode: darrk\n---\n\n# S\n';
    assert.equal(deckColorModeToken(frontMatterBody(shadowed)), '', 'the top-level value is the typo');
    assert.equal(findUnknownColorMode(shadowed, COLOR_MODE_NAMES).length, 1,
      'and the linter must see the same line the resolver did');
  });

  test('every known register name is quiet, and `colorModeClass` agrees the name is known', () => {
    for (const name of COLOR_MODE_NAMES) {
      const src = `---\ntheme: cuoio\ncolor-mode: ${name}\n---\n\n# S\n`;
      assert.equal(findUnknownColorMode(src, COLOR_MODE_NAMES).length, 0, name);
      assert.equal(typeof colorModeClass(name), 'string', name);
    }
  });
});
