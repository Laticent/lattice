/**
 * The dark canvas must not repaint a frame that paints its own — and the list of
 * those frames, which lives in a CSS selector, must not rot.
 *
 * `section.dark` paints the deck-wide canvas at (0,1,1). A frame that paints its
 * OWN section canvas does so at the same specificity, and every component
 * stylesheet is bundled BEFORE base.modifiers.css — so without an exemption the
 * deck-wide canvas wins and the frame loses the surface it drew for itself. That
 * shipped: under `color-mode: dark`, `divider` lost its vertical spectrum rail
 * and `title`/`closing` lost `--surface-inverse`.
 *
 * The exemption is a hand-written list inside the selector, because CSS cannot
 * ask "does this component paint its own canvas?". This test asks it instead, so
 * the list is checked against the tree on every run rather than trusted.
 *
 * WHY NOT KEY ON SOVEREIGNTY. The obvious mechanical answer is the `form` class
 * the engine stamps on every non-sovereign section, which needs no list at all.
 * It is the wrong set: ten frames are sovereign and only four paint. Keying on it
 * would have taken the deck-wide hairline off the other six — compare-code,
 * image, premise, scene, split-compare, split-panel — which own their layout but
 * no background and still want it. Measured before choosing: six changed, none
 * of them asked for.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const LIB = path.join(__dirname, '..', '..', '..', 'lib');
const MODIFIERS = path.join(LIB, 'base', 'base.modifiers.css');

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** The class names the dark-canvas rule exempts. */
function exemptedClasses() {
  const css = stripComments(fs.readFileSync(MODIFIERS, 'utf8'));
  const m = css.match(/section\.dark:not\(:where\(([^)]*)\)\)\s*\{/);
  assert.ok(m, 'could not find the `section.dark:not(:where(...))` canvas rule');
  return m[1].split(',').map((s) => s.trim().replace(/^\./, '')).filter(Boolean).sort();
}

/** Every frame whose own stylesheet paints a SECTION-LEVEL canvas. */
function canvasPainters() {
  const found = new Set();
  const roots = [path.join(LIB, 'components'), path.join(LIB, 'base')];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.styles.css')) scan(p);
    }
  };
  const scan = (file) => {
    const css = stripComments(fs.readFileSync(file, 'utf8'));
    // `section.<name> {` with no further compound — the frame's own base canvas.
    for (const m of css.matchAll(/section\.([a-z][a-z0-9-]*)\s*\{([^}]*)\}/g)) {
      const [, name, body] = m;
      const paint = body.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/);
      if (!paint) continue;
      // A frame painting `var(--bg)` is painting the DECK GROUND — the same
      // surface `section.dark` would paint, so the cascade taking it over costs
      // nothing and exempting it would be noise. `image` and `scene` do exactly
      // this. What matters is a frame painting a DIFFERENT surface: an accent
      // cover, an inverse field. Those are the ones the deck-wide canvas erases.
      if (/var\(\s*--bg\s*[,)]/.test(paint[1])) continue;
      found.add(name);
    }
  };
  for (const r of roots) if (fs.existsSync(r)) walk(r);
  return found;
}

test('every frame that paints its own dark canvas is exempted from the deck-wide one', () => {
  const exempt = new Set(exemptedClasses());
  const painters = canvasPainters();
  const missing = [...painters].filter((p) => !exempt.has(p)).sort();
  assert.deepEqual(
    missing, [],
    'these paint a section-level canvas but are NOT exempted in base.modifiers.css, '
    + 'so `color-mode: dark` will repaint over them: ' + missing.join(', '),
  );
});

test('the exemption list carries no component that stopped painting', () => {
  // A name with no component at all is fine — `topic` is listed ahead of its own
  // branch landing, and a class that matches nothing costs nothing. What is NOT
  // fine is a component that still exists and no longer paints: that is a stale
  // entry, and the list has to stay readable as "these paint their own canvas".
  const painters = canvasPainters();
  const exists = (name) => {
    const buckets = fs.readdirSync(path.join(LIB, 'components'), { withFileTypes: true })
      .filter((e) => e.isDirectory());
    return buckets.some((b) =>
      fs.existsSync(path.join(LIB, 'components', b.name, name, `${name}.styles.css`)));
  };
  const stale = exemptedClasses().filter((n) => exists(n) && !painters.has(n));
  assert.deepEqual(stale, [], `stale exemption(s) — these no longer paint: ${stale.join(', ')}`);
});
