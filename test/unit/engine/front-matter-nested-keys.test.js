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
