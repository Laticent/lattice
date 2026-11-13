/**
 * Integration: the CLI renders a `.lattice` project file (lib/export/lattice-input.js), through the REAL CLI, both as
 * the source runs it (lattice.js) and as npm ships it (the bundled dist/lattice.js, which once started itself again
 * forever on a `.lattice`, because the unpack child was `__filename`: inside the bundle, the CLI).
 *
 * The file is built here with the writer the Studio and the CLI share (lib/core/reopenable.js), carrying what a
 * Studio export carries: the deck, a photo in `media/` with its `media.json` row, and packages in `packages/`.
 *
 *   PHOTO      `asset:pic` resolves to the file's photo, and the PDF holds that JPEG's own bytes
 *   THEME      a theme carried in the file renders, and wins over an installed theme of the same name
 *   INSTALLED  a component the user installed still renders when the input is a `.lattice` (the file's own
 *              packages are searched first, the user's store after; nothing is linked)
 *   CODE       a code component carried in the file fails the render without consent, naming it, and renders
 *              with `--trust`; nothing is written to the trust store or the package store
 *   PLUGINS    `lattice-plugins.json` is looked up from the `.lattice`'s own folder, not the private folder
 *   REFUSED    bytes that are not a deck or a zip are refused at once, never parsed as Markdown; a zip that is
 *              not a .lattice fails with the shared reader's own message
 *
 * Every render runs with its own LATTICE_HOME, and every arm that renders checks that folder afterwards:
 * "for this render only" (owner ruling, 2026-11-13) means nothing appears there.
 *
 * Slow tier: eight CLI renders per CLI.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const JSZip = require('jszip');
const reopenable = require('../../../lib/core/reopenable');

const ROOT = path.join(__dirname, '..', '..', '..');
const CLIS = [['source', path.join(ROOT, 'lattice.js')], ['shipped bin', path.join(ROOT, 'dist', 'lattice.js')]];
const TIMEOUT = 300000;
const PHOTO = fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'lattice-input', 'photo.jpg'));
// Not the product's own `lattice-input-` prefix: a test folder must never look like one the CLI left behind.
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `li-int-${p}-`));

const photoMedia = () => ({
  index: JSON.stringify([{ name: 'pic', kind: 'image', scope: 'library', mime: 'image/jpeg', bytes: PHOTO.length, width: 320, height: 200, sourceName: 'pic.jpg', original: true, addedAt: 0, file: 'pic.jpg' }]),
  files: { 'media/pic.jpg': new Uint8Array(PHOTO) },
});
const themeFiles = (name, accent) => ({ [`${name}.manifest.json`]: JSON.stringify({ name, type: 'theme', format: 1, label: name }), [`${name}.css`]: `/* @theme ${name} */\n@import 'lattice';\n:root { --accent: ${accent}; }\n` });
const compFiles = (name, css) => ({
  [`${name}.manifest.json`]: JSON.stringify({ name, type: 'component', format: 1 }),
  [`${name}.styles.css`]: css,
  [`${name}.gallery.md`]: `<!-- _class: ${name} -->\n\n## ${name}\n`,
});
/** A third-party code component: its transform marks the slide it draws, and nothing else. */
const codeFiles = {
  'ticker.manifest.json': JSON.stringify({ name: 'ticker', type: 'component', format: 1, facts: 1 }),
  'ticker.styles.css': 'section.ticker-drawn h2 { color: var(--accent); }\n',
  'ticker.gallery.md': '<!-- _class: ticker -->\n\n## Ticker\n',
  'ticker.transform.js': 'function ticker(slide) { return slide.html.replace(\' class="\', \' class="ticker-drawn \'); }\nexport { ticker as default };\n',
};

async function writeLattice(dir, { source, packages = [], media }) {
  const file = path.join(dir, 'deck.lattice');
  fs.writeFileSync(file, await reopenable.buildLatticeZip(JSZip, { source, title: 'Probe', packages, media }));
  return file;
}

/** Every file under `dir`, relative: what a render left in the user's home. */
function filesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { recursive: true }).filter((f) => fs.statSync(path.join(dir, f)).isFile()).sort();
}

for (const [label, bin] of CLIS) {
  const cli = (args, home) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', timeout: TIMEOUT, env: { ...process.env, LATTICE_HOME: home } });

  describe(`the CLI renders a .lattice project file (${label})`, () => {
    test('a photo the deck names renders from the file, as its own bytes', { timeout: TIMEOUT }, async () => {
      const dir = tmp('photo');
      const home = tmp('home');
      const file = await writeLattice(dir, { source: '---\ntheme: indaco\n---\n\n## A photo\n\n![A gradient](asset:pic)\n', media: photoMedia() });
      const out = path.join(dir, 'deck.pdf');
      const r = cli([file, out], home);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /photos: 1 from the \.lattice/);
      assert.ok(Buffer.from(fs.readFileSync(out)).includes(PHOTO), 'the PDF carries the photo file as it is');
      assert.deepEqual(filesUnder(home), [], 'nothing is written to the user home');
    });

    test('a theme the file carries renders, and wins over an installed one of the same name', { timeout: TIMEOUT }, async () => {
      const dir = tmp('theme');
      const home = tmp('home');
      const installed = path.join(home, 'packages', 'theme', 'probe-brand');
      fs.mkdirSync(installed, { recursive: true });
      for (const [f, b] of Object.entries(themeFiles('probe-brand', '#111111'))) fs.writeFileSync(path.join(installed, f), b);
      const before = filesUnder(home);
      const file = await writeLattice(dir, { source: '---\ntheme: probe-brand\n---\n\n# Branded\n', packages: [{ type: 'theme', name: 'probe-brand', files: themeFiles('probe-brand', '#2d4ed8') }] });
      const out = path.join(dir, 'deck.html');
      const r = cli([file, out], home);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stderr, /the \.lattice carries the theme probe-brand, so its copy is used instead of the installed one/);
      assert.match(r.stdout, /theme: probe-brand \(from the \.lattice\)/);
      const html = fs.readFileSync(out, 'utf8');
      assert.match(html, /--accent:\s*#2d4ed8/i, "the file's theme is the one in the document");
      assert.doesNotMatch(html, /--accent:\s*#111111/i, 'the installed copy is not used');
      assert.deepEqual(filesUnder(home), before, 'the installed store is unchanged');
    });

    test('a component the user installed still renders when the input is a .lattice', { timeout: TIMEOUT }, async () => {
      const dir = tmp('installed');
      const home = tmp('home');
      const comp = path.join(home, 'packages', 'component', 'probe-box');
      fs.mkdirSync(comp, { recursive: true });
      for (const [f, b] of Object.entries(compFiles('probe-box', 'section.probe-box { outline: 7px solid var(--accent); }'))) fs.writeFileSync(path.join(comp, f), b);
      const file = await writeLattice(dir, { source: '---\ntheme: indaco\n---\n\n<!-- _class: probe-box -->\n\n## Boxed\n' });
      const out = path.join(dir, 'deck.html');
      const r = cli([file, out], home);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /components: probe-box \(installed packages\)/);
      assert.match(fs.readFileSync(out, 'utf8'), /section\.probe-box \{ outline: 7px solid var\(--accent\); \}/, 'the installed component is embedded');
    });

    test('a code component in the file fails without consent and renders with --trust, writing nothing', { timeout: TIMEOUT }, async () => {
      const dir = tmp('code');
      const home = tmp('home');
      const file = await writeLattice(dir, { source: '---\ntheme: indaco\n---\n\n<!-- _class: ticker -->\n\n## Stamped\n', packages: [{ type: 'component', name: 'ticker', files: codeFiles }] });
      const out = path.join(dir, 'deck.html');
      const refused = cli([file, out], home);
      assert.notEqual(refused.status, 0);
      assert.match(refused.stderr, /the deck uses the code package ticker, and you have not approved its code \(sha256 [0-9a-f]{64}\)/);
      assert.equal(fs.existsSync(out), false, 'no file is written');
      const trusted = cli([file, out, '--trust'], home);
      assert.equal(trusted.status, 0, trusted.stderr);
      assert.match(trusted.stdout, /--trust: the code in the component ticker runs for this render only/);
      assert.match(trusted.stdout, /components: ticker \(from the \.lattice\)/);
      assert.match(fs.readFileSync(out, 'utf8'), /<section[^>]*class="[^"]*\bticker-drawn\b/, 'the transform drew the slide');
      assert.deepEqual(filesUnder(home), [], 'no approval and no package is written to the user home');
    });

    test("lattice-plugins.json is looked up from the .lattice's own folder", { timeout: TIMEOUT }, async () => {
      const dir = tmp('plugins');
      // A list the deck asks from, and broken: the CLI says so only if it FOUND the list.
      fs.writeFileSync(path.join(dir, 'lattice-plugins.json'), '{}');
      const file = await writeLattice(dir, { source: '---\ntheme: indaco\nplugins: probe-npm-plugin\n---\n\n# Plugins\n' });
      const r = cli([file, path.join(dir, 'deck.html')], tmp('home'));
      assert.match(r.stderr, new RegExp(`${path.join(dir, 'lattice-plugins.json').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} has no "plugins" list`));
    });

    test('bytes that are not a deck are refused at once, and a zip that is not a .lattice fails with its reason', { timeout: TIMEOUT }, async () => {
      const dir = tmp('refused');
      const home = tmp('home');
      const pdf = path.join(dir, 'not-a-deck.md');
      fs.writeFileSync(pdf, Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64)]));
      const binary = cli([pdf, path.join(dir, 'out.pdf')], home);
      assert.equal(binary.status, 1);
      assert.match(binary.stderr, /is not a Markdown deck or a \.lattice project file/);
      const zip = new JSZip();
      zip.file('deck.md', '# no manifest\n');
      const bare = path.join(dir, 'bare.lattice');
      fs.writeFileSync(bare, await zip.generateAsync({ type: 'nodebuffer' }));
      const missing = cli([bare, path.join(dir, 'out.pdf')], home);
      assert.equal(missing.status, 1);
      assert.match(missing.stderr, /That \.lattice file is missing its deck or manifest\./);
      assert.equal(fs.existsSync(path.join(dir, 'out.pdf')), false);
    });
  });
}
