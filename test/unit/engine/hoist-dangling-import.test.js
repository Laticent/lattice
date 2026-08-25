/**
 * Unit: `hoistImports` DROPS an unresolvable theme-name import instead of
 * promoting it to the top of the composed sheet.
 *
 * THE BUG. `ThemeStore.resolveThemeImports` inlines every theme-name import it can
 * resolve and leaves the rest IN PLACE — an unknown name, or a cycle it already
 * inlined once. Mid-sheet that residue is inert, because CSS ignores an `@import`
 * that is not before all other rules. `hoistImports` then lifted it to position 0
 * specifically so it would survive that rule, and a bare name at position 0 is a
 * RELATIVE URL the browser fetches. So the composition step turned a reference the
 * registry had already declined into a live network request, in a frame that holds
 * the user's BYOK key (HARD RULE #24).
 *
 * Measured before the fix: a theme carrying `@import 'ghost-theme';` composed to a
 * sheet whose literal first line was `@import 'ghost-theme';`.
 *
 * THE ESCAPE ARM IS THE SHARP ONE. The engine resolver matches raw bytes,
 * case-sensitively, so `@import '\61 rdesia'` does not resolve even when `ardesia`
 * IS registered — and the browser, which decodes, then fetches `./ardesia`. Judging
 * the target the resolver's way would re-open exactly the hole `lib/theme/gate.js`
 * closed on the Studio path, so the judgment here decodes first. This is the
 * "detect with the semantics of the thing that will EXECUTE the CSS, judge with the
 * semantics of the thing that will CONSUME it" rule from lib/core/css-scan.js's
 * header, applied in the direction where the hoist is what hands the browser bytes.
 *
 * SCOPE. This drops a dangling NAME. It does not judge a real URL: `@import url(…)`
 * and quoted paths still hoist exactly as before, because a theme author may
 * legitimately want one and the engine is not the security boundary for it
 * (`lib/theme/gate.js` is, and it rejects both outright for hand-edited theme CSS).
 * The corpus arm below pins that the 32 shipped themes are untouched.
 *
 * See engineering/decisions/2026-08-25-hand-editing-generated-assets.md
 * §"Logged, not fixed here: the engine hoists what it cannot resolve".
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { hoistImports, composeCss } = require('../../../lib/engine/css.js');
const { ThemeStore } = require('../../../lib/engine/themes.js');

const THEMES_DIR = path.join(__dirname, '../../../themes');

describe('hoistImports — a dangling theme name is dropped, a URL is hoisted', () => {
  test('drops a bare quoted name and does not hoist it', () => {
    const out = hoistImports("@import 'ghost-theme';\n.a{color:red}");
    assert.ok(!out.includes('ghost-theme'), 'the dangling import survived');
    assert.equal(out.trim(), '.a{color:red}');
  });

  test('drops it even when it is the ONLY import (nothing left to hoist)', () => {
    // The `hoisted.length === 0` fast path used to return the input untouched,
    // which would have handed the import back in exactly this case.
    const out = hoistImports("@import 'ghost';\n.a{color:red}");
    assert.ok(!out.includes('@import'), out.slice(0, 80));
  });

  test('drops a name hidden behind a CSS escape', () => {
    // `\61 rdesia` decodes to `ardesia` — a REGISTERED theme the raw-byte resolver
    // still could not match, so it reaches here and the browser would fetch it.
    const out = hoistImports(String.raw`@import '\61 rdesia';` + '\n.a{color:red}');
    assert.ok(!out.includes('rdesia'), out.slice(0, 80));
  });

  test('still hoists a real url() import, to the top', () => {
    const out = hoistImports('.a{color:red}\n@import url(https://fonts.example/f.css);');
    assert.ok(out.startsWith('@import url(https://fonts.example/f.css);'), out.slice(0, 80));
    assert.ok(out.includes('.a{color:red}'));
  });

  test('still hoists a quoted PATH — a dot or a slash is not a theme name', () => {
    for (const target of ['./local.css', 'print.css', 'https://x.example/a.css', 'a/b']) {
      const out = hoistImports(`.a{color:red}\n@import '${target}';`);
      assert.ok(out.startsWith(`@import '${target}';`), `${target} was not hoisted: ${out.slice(0, 60)}`);
    }
  });

  test('preserves order and collapses duplicates among the imports it keeps', () => {
    const css = "@import url(a.css);\n@import 'ghost';\n@import url(b.css);\n@import url(a.css);\n.a{}";
    const out = hoistImports(css);
    assert.equal(out.split('\n').slice(0, 2).join('\n'), '@import url(a.css);\n@import url(b.css);');
    assert.ok(!out.includes('ghost'));
  });
});

describe('composeCss — the dangling import never reaches position 0', () => {
  const store = (leafCss) => {
    const s = new ThemeStore();
    s.add('lattice', ':root{--base:1}');
    s.add('ardesia', ':root{--ardesia:1}');
    s.add('leaf', leafCss);
    return s;
  };

  test('an unknown theme name is gone from the composed sheet', () => {
    const css = store("@import 'lattice';\n@import 'ghost-theme';\n:root{--y:2}").cssFor('leaf');
    assert.ok(!css.includes('ghost-theme'), css.slice(0, 120));
  });

  test('an escaped name that names a registered theme is gone too', () => {
    const css = store("@import 'lattice';\n" + String.raw`@import '\61 rdesia';` + '\n:root{--y:2}').cssFor('leaf');
    assert.ok(!/@import/.test(css.split('\n')[0]), css.slice(0, 120));
    assert.ok(!css.includes('rdesia'), css.slice(0, 120));
  });

  test('a cyclic import — already inlined once — is dropped, not hoisted', () => {
    const s = new ThemeStore();
    s.add('lattice', ':root{--base:1}');
    s.add('a', "@import 'lattice';\n@import 'b';\n:root{--a:1}");
    s.add('b', "@import 'a';\n:root{--b:1}");
    const css = s.cssFor('a');
    assert.ok(!/^@import/m.test(css.split('\n')[0]), css.slice(0, 120));
    assert.ok(css.includes('--b:1'), 'b should still have been inlined once');
  });
});

describe('the 32 shipped themes are untouched', () => {
  // The fix can only DROP, so the risk it carries is dropping something real. Every
  // shipped palette imports by bare name and every one of those names resolves, so
  // nothing here should reach the drop branch at all.
  const base = fs.readFileSync(path.join(__dirname, '../../../dist/lattice.css'), 'utf8');
  const files = fs.readdirSync(THEMES_DIR).filter((f) => f.endsWith('.css')).sort();
  const s = new ThemeStore();
  s.add('lattice', base);
  for (const f of files) s.add(path.basename(f, '.css'), fs.readFileSync(path.join(THEMES_DIR, f), 'utf8'));

  test('every theme composes with no surviving @import statement', () => {
    assert.ok(files.length >= 32, `expected the full catalog, saw ${files.length}`);
    for (const f of files) {
      const name = path.basename(f, '.css');
      const css = s.cssFor(name);
      assert.ok(css.length > 1000, `${name} composed to ${css.length} bytes — the base did not inline`);
      // Comments are stripped by composeCss, so any `@import` left is a real statement.
      assert.equal(css.match(/@import/g), null, `${name} composed with a surviving @import`);
    }
  });

  test('composeCss is a no-op change for a sheet with no imports at all', () => {
    const plain = composeCss({ themeCss: ':root{--x:1}', baseLatticeCss: ':root{--b:1}' });
    assert.ok(!plain.includes('@import'));
  });
});
