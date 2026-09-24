/**
 * Integration: a deck renders from the CLI with packages from the store, and the store is
 * gated at render time (engineering/decisions/2026-09-23-portable-packages.md §6).
 *
 * The unit tests pin `lattice packages` and the pure embed helper (lib/packages/render.js);
 * this drives the real renderer (lattice-emulator.js → .html, a browser render), which is the
 * only place the palette chain, the installed theme's CSS and the embedded component meet.
 *
 * THE STORE IS A PLAIN FOLDER. A package unzipped into it by hand never went through `add`,
 * so two arms put packages there directly and assert the render gate refuses them: a theme
 * that beacons (HARD RULE #22) fails the render, and a component that does is left out with
 * a warning. Without those arms, deleting the render-time gate would keep this file green.
 *
 * Slow tier: four CLI renders.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
const TIMEOUT = 180000;

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `lattice-installed-${p}-`));

/** Write a package folder straight into a store, as someone unzipping it by hand would. */
function place(store, type, name, files) {
  const dir = path.join(store, type, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [f, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), body);
}

const themeFiles = (name, css) => ({ [`${name}.manifest.json`]: JSON.stringify({ name, type: 'theme', format: 1, label: name }), [`${name}.css`]: css });
const compFiles = (name, css) => ({
  [`${name}.manifest.json`]: JSON.stringify({ name, type: 'component', format: 1 }),
  [`${name}.styles.css`]: css,
  [`${name}.gallery.md`]: `<!-- _class: ${name} -->\n\n## ${name}\n`,
});

function render(store, deck) {
  const dir = tmp('deck');
  fs.writeFileSync(path.join(dir, 'deck.md'), deck);
  const r = spawnSync(process.execPath, [EMULATOR, path.join(dir, 'deck.md'), path.join(dir, 'deck.html')], { encoding: 'utf8', timeout: TIMEOUT, env: { ...process.env, LATTICE_HOME: store } });
  const html = fs.existsSync(path.join(dir, 'deck.html')) ? fs.readFileSync(path.join(dir, 'deck.html'), 'utf8') : '';
  return { ...r, html };
}

describe('the CLI renders from the package store, and gates it', () => {
  test('an installed theme and component render', { timeout: TIMEOUT }, async () => {
    const home = tmp('home');
    const store = path.join(home, 'packages');
    const { main } = require('../../../lib/packages/cli.js');
    const src = tmp('src');
    fs.mkdirSync(path.join(src, 'probe-brand'));
    for (const [f, b] of Object.entries(themeFiles('probe-brand', "/* @theme probe-brand */\n@import 'lattice';\n:root { --accent: #2d4ed8; }\n"))) fs.writeFileSync(path.join(src, 'probe-brand', f), b);
    fs.mkdirSync(path.join(src, 'probe-box'));
    for (const [f, b] of Object.entries(compFiles('probe-box', 'section.probe-box { outline: 7px solid var(--accent); }'))) fs.writeFileSync(path.join(src, 'probe-box', f), b);
    const quiet = { log: () => {}, err: () => {} };
    assert.equal(await main(['add', path.join(src, 'probe-brand'), '--packages', store], quiet), 0);
    assert.equal(await main(['add', path.join(src, 'probe-box'), '--packages', store], quiet), 0);

    const r = render(home, '---\ntheme: probe-brand\n---\n\n<!-- _class: probe-box -->\n\n## Boxed\n');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /theme: probe-brand \(installed package/);
    assert.match(r.stdout, /components: probe-box \(installed packages\)/);
    assert.match(r.html, /--accent:\s*#2d4ed8/i, 'the installed theme is in the document');
    assert.match(r.html, /section\.probe-box \{ outline: 7px solid var\(--accent\); \}/, 'the installed component is embedded');
    assert.doesNotMatch(r.stderr, /no component "probe-box"/);
  });

  test('a theme placed in the store by hand that beacons is refused, and the render fails', { timeout: TIMEOUT }, () => {
    const home = tmp('home');
    place(path.join(home, 'packages'), 'theme', 'evil', themeFiles('evil', '/* @theme evil */\nsection { background-image: url(https://evil.invalid/b.png); }\n'));
    const r = render(home, '---\ntheme: evil\n---\n\n# Hi\n');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /the installed theme evil is refused/);
    assert.equal(r.html, '');
  });

  test('a component placed in the store by hand that beacons is left out, with a warning', { timeout: TIMEOUT }, () => {
    const home = tmp('home');
    place(path.join(home, 'packages'), 'component', 'beacon-box', compFiles('beacon-box', 'section.beacon-box { background: url(https://evil.invalid/b.png); }'));
    const r = render(home, '---\ntheme: indaco\n---\n\n<!-- _class: beacon-box -->\n\n## B\n');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /the installed component beacon-box is refused/);
    assert.doesNotMatch(r.html, /evil\.invalid/);
  });

  test('a component the deck names that nobody has is reported, not rendered silently', { timeout: TIMEOUT }, () => {
    const r = render(tmp('home'), '---\ntheme: indaco\n---\n\n<!-- _class: probe-nowhere -->\n\n## N\n\n---\n\n<!-- _class: kpi finish finish-atrium -->\n\n## K\n');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /no component "probe-nowhere"/);
    assert.match(r.stderr, /lattice packages add probe-nowhere\.lattice-component\.zip/);
    // Shipped components and engine classes are never reported.
    assert.doesNotMatch(r.stderr, /no component "(kpi|finish|finish-atrium)"/);
  });
});
