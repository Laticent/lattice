/**
 * Theme identity — the name is GIVEN to the store, not searched for in the CSS.
 *
 * `ThemeStore.add(name, css)` is the contract; `add(css)` survives only for
 * external consumers of the published `./engine` export and the documented
 * `window.LatticePlayground.addThemes` API. See
 * engineering/decisions/2026-08-16-theme-identity-ownership.md.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ThemeStore } = require('../../../lib/engine/themes.js');
const { createEngine } = require('../../../lib/engine/index.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const BASE = fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8');

describe('ThemeStore.add — identity is an argument', () => {
  test('add(name, css) registers under the GIVEN name, ignoring the directive', () => {
    // The point of the contract: the caller decides. A sheet whose directive says
    // something else does not get to override the name it was registered under —
    // which is what made `themes/foo.css` declaring `@theme bar` a silent hazard.
    const s = new ThemeStore();
    assert.equal(s.add('given', '/* @theme declared */\nsection{}'), true);
    assert.equal(s.has('given'), true);
    assert.equal(s.has('declared'), false);
  });

  test('add(css) still recovers the name from @theme (the published legacy form)', () => {
    const s = new ThemeStore();
    assert.equal(s.add('/* @theme legacy */\nsection{}'), true);
    assert.equal(s.has('legacy'), true);
  });

  test('a nameless registration THROWS rather than silently no-op\'ing', () => {
    // The old failure mode: `add()` returned false and no caller checked it, so a
    // malformed sheet vanished and the deck rendered scaffold-only with no signal.
    const s = new ThemeStore();
    assert.throws(() => s.add(null, 'section{}'), TypeError);
    assert.throws(() => s.add(undefined, 'section{}'), TypeError);
    assert.throws(() => s.add(42, 'section{}'), TypeError);
    // The LEGACY form keeps its false return — external callers may rely on it.
    assert.equal(s.add('section{color:red}'), false);
  });

  test('a NAMED registration with a missing stylesheet throws — it does not fall back to the scan', () => {
    // Found by the adversarial trio, in the branch this change itself added. Keying the
    // form on `cssText === undefined` meant `add('lattice', undefined)` took the LEGACY
    // path: the given name was discarded and the NAME was scanned as css, so a named
    // registration silently no-op'd — the exact failure this method exists to abolish,
    // reachable through its own new branch. The form is now `arguments.length`.
    const s = new ThemeStore();
    assert.throws(() => s.add('lattice', undefined), TypeError, 'add(name, undefined) must throw, not scan the name');
    assert.throws(() => s.add('lattice', null), TypeError, 'add(name, null) must throw, not register null');
    assert.throws(() => s.add('lattice', 42), TypeError);
    assert.equal(s.has('lattice'), false, 'nothing may be registered by a throwing call');
  });

  test('add(name) with the stylesheet forgotten does not register the NAME as a theme', () => {
    // One argument is the legacy form by definition, so `add('mytheme')` scans
    // 'mytheme' for a directive, finds none, and returns false. It must not throw
    // (external callers pass one argument legitimately) and must not register.
    const s = new ThemeStore();
    assert.equal(s.add('mytheme'), false);
    assert.equal(s.has('mytheme'), false);
  });

  test('a poisoned entry can never report as registered', () => {
    // `add(name, null)` used to return TRUE and store null: `has(name)` was then true
    // forever, permanently disarming every `if (!hasTheme(name))` self-heal guard in
    // docs/src/lib/theme-fetch.ts, while cssFor served scaffold-only CSS. A `true` that
    // means "registered nothing" is worse than the `false` this change set out to kill.
    const s = new ThemeStore();
    for (const bad of [null, undefined, 42, {}, []]) {
      assert.throws(() => s.add('poison', bad), TypeError, `add('poison', ${JSON.stringify(bad)}) must throw`);
    }
    assert.equal(s.has('poison'), false);
  });

  test('the legacy form still accepts a Buffer and a boxed String (published API)', () => {
    // `typeof entry === 'object'` routed BOTH to add(undefined, undefined) — they
    // registered under the pre-change code and silently stopped under the new one.
    // `fs.readFileSync(p)` with the encoding forgotten is an ordinary Node call shape
    // on a published CJS export, so that was a real regression, in the same silent
    // class this change removes.
    const css = "/* @theme boxed */\nsection{}";
    const viaEngine = (entry) => {
      const e = createEngine();
      e.addThemes([entry]);
      return e.hasTheme('boxed');
    };
    assert.equal(viaEngine(Buffer.from(css, 'utf8')), true, 'a Buffer must still register');
    assert.equal(viaEngine(new String(css)), true, 'a boxed String must still register');
    assert.equal(viaEngine(css), true);
  });

  test('the legacy scan is BOUNDED — a directive-less sheet cannot cost a full buffer', () => {
    // Unbounded, a miss scanned the whole 1.5 MB base sheet (884 µs measured) to then
    // register nothing. The scan window is 4 KB; a directive parked past it is not found,
    // which is the intended trade — the directive is a header comment by construction.
    const s = new ThemeStore();
    const buried = `${'/* filler */\n'.repeat(1000)}/* @theme buried */\nsection{}`;
    assert.ok(buried.length > 4096);
    assert.equal(s.add(buried), false, 'a directive past the scan window must not be found');
    // ...and the two-argument form does not care where (or whether) a directive sits.
    assert.equal(s.add('buried', buried), true);
    assert.equal(s.has('buried'), true);
  });

  test('re-registering under the same name replaces the css and clears the memo', () => {
    const s = new ThemeStore();
    s.add('lattice', BASE);
    s.add('p', "/* @theme p */\n@import 'lattice';\n:root{--accent:#111}");
    const first = s.cssFor('p');
    s.add('p', "/* @theme p */\n@import 'lattice';\n:root{--accent:#222}");
    const second = s.cssFor('p');
    assert.notEqual(first, second, 'a re-registered theme served stale composed css');
    assert.match(second, /--accent:\s*#222/);
  });
});

describe('addThemes accepts both shapes', () => {
  const deck = '# One\n';

  test('{ name, css } and a bare string both register and render identically', () => {
    const a = createEngine();
    a.addThemes([
      { name: 'lattice', css: BASE },
      { name: 'p', css: "/* @theme p */\n@import 'lattice';\n:root{--accent:#840}" },
    ]);
    const b = createEngine();
    b.addThemes([BASE, "/* @theme p */\n@import 'lattice';\n:root{--accent:#840}"]);
    assert.equal(a.hasTheme('p'), true);
    assert.equal(b.hasTheme('p'), true);
    assert.equal(a.render(deck, 'p').css, b.render(deck, 'p').css, 'the two shapes composed different css');
    assert.equal(a.render(deck, 'p').html, b.render(deck, 'p').html);
  });

  test('the two shapes mix in one call', () => {
    const e = createEngine();
    e.addThemes([BASE, { name: 'p', css: "/* @theme p */\n@import 'lattice';\n:root{--accent:#840}" }]);
    assert.equal(e.hasTheme('lattice'), true);
    assert.equal(e.hasTheme('p'), true);
  });
});

describe('the on-disk palettes agree with their manifests', () => {
  // The gate (tools/check-ownership.js checkThemeIdentity) is the enforcement; this
  // asserts the same binding in the fast suite so a mismatch fails `npm test` too.
  const THEMES = path.join(ROOT, 'themes');
  const files = fs.readdirSync(THEMES).filter((f) => f.endsWith('.css')).sort();

  test('filename ≡ @theme ≡ manifest name, for every palette', () => {
    assert.ok(files.length >= 32, `expected the full palette set, saw ${files.length}`);
    const bad = [];
    for (const f of files) {
      const name = f.replace(/\.css$/, '');
      const declared = /@theme\s+([A-Za-z0-9_-]+)/.exec(fs.readFileSync(path.join(THEMES, f), 'utf8'))?.[1];
      if (declared !== name) bad.push(`${f}: @theme ${declared ?? '(none)'}`);
      const mp = path.join(THEMES, `${name}.manifest.json`);
      if (fs.existsSync(mp)) {
        const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
        if (m.name !== undefined && m.name !== name) bad.push(`${f}: manifest name "${m.name}"`);
      }
    }
    assert.deepEqual(bad, []);
  });

  test('the engine base declares @theme lattice (every palette @imports that name)', () => {
    const css = fs.readFileSync(path.join(ROOT, 'lib', '_theme.css'), 'utf8');
    assert.match(css, /@theme\s+lattice\b/);
  });
});
