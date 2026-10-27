/**
 * Integration: the slide camera (lib/core/slide-camera.mjs) keeps the emoji slice a pseudo-element draws, and leaves the word
 * `body` in a CSS string alone. Both were #2904 red-team findings.
 *
 * The emoji half cannot be judged from a picture in this sandbox: its system emoji font IS Noto Color Emoji, so a dropped slice
 * falls back to the same glyphs. The oracle is what the camera asks its host for: the slice's font file must be among the
 * addresses it sends to `toDataUri`. Before the fix it decided from `textContent`, which never holds `content:` text.
 *
 * Needs Chromium and the camera bundle (`npm run build`).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..', '..');
const BUNDLE = path.join(ROOT, 'dist', 'lattice-pdf-compose-min.js');
const { EMOJI_SLICES, slicesFor } = require('../../../lib/fonts/emoji-faces.js');

test('a ::before emoji keeps its slice, and content:" body " stays text', { skip: !fs.existsSync(BUNDLE) && 'needs npm run build' }, async () => {
  const puppeteer = require('puppeteer');
  const fontsDir = path.join(ROOT, 'assets', 'fonts');
  const faces = EMOJI_SLICES.map(
    (s) => `@font-face{font-family:'Noto Color Emoji';src:url(${pathToFileURL(path.join(fontsDir, `${s.file}.woff2`)).href}) format('woff2');unicode-range:${s.range}}`,
  ).join('\n');
  // The rules live in the page's <head>, as a theme's or a `style:` line's do: a <style> inside the slide would ride along in
  // the camera's clone, unrewritten, and hide both defects.
  const html = `<!doctype html><html><head><style>${faces}
    body{margin:0} section{width:640px;height:360px;font:32px sans-serif}
    h1::before{content:"\\1F680 ";font-family:'Noto Color Emoji',sans-serif}
    p::before{content:" body ";color:rgb(200,0,0)}</style></head>
    <body><section data-lattice-slide><h1>Launch</h1><p>x</p></section></body></html>`;
  const launch = { headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await puppeteer.launch(launch);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 640, height: 360 });
    await page.setContent(html);
    await page.addScriptTag({ content: fs.readFileSync(BUNDLE, 'utf8') });
    const asked = await page.evaluate(async () => {
      const urls = [];
      const el = document.querySelector('section');
      await globalThis.LatticePdfCompose.captureSlide(el, {
        toDataUri: async (u) => {
          urls.push(u);
          throw new Error('not needed for this check');
        },
      });
      return urls;
    });
    const want = slicesFor('\u{1F680}');
    assert.ok(want.length > 0);
    for (const file of want) assert.ok(asked.some((u) => u.endsWith(`/${file}.woff2`)), `the camera asked for ${file}: ${asked.join(', ')}`);
    assert.ok(!asked.some((u) => u.endsWith('/noto-color-emoji-0.woff2')), 'a slice no character needs is still left out');
    // The rewrite is checked on the stylesheet the camera builds: the string must survive as written.
    const { repointRootSelectors } = await import('../../../lib/core/slide-camera.mjs');
    assert.match(repointRootSelectors('p::before{content:" body "} body{margin:0}'), /content:" body "\} \.__lc-body\{/);
  } finally {
    await browser.close();
  }
});

// The command line picks its emoji slices before any page exists, from the deck's text. An emoji only the author's CSS draws
// (front matter `style:`, here as a CSS escape) carried no slice at all: the page had no emoji font for it, and the picture
// drew it in whatever the machine had. The shipped stylesheet stays out of that text, so a deck without emoji still carries none.
test('the CLI embeds the emoji slices that front-matter CSS draws, and none for a deck without emoji', () => {
  const { spawnSync } = require('node:child_process');
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pseudo-emoji-cli-'));
  try {
    const faces = (fm) => {
      fs.writeFileSync(path.join(dir, 'd.md'), `---\ntheme: indaco\nfonts: used-emoji\n${fm}---\n\n# Launch day\n`);
      const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), path.join(dir, 'd.md'), path.join(dir, 'd.html')], { encoding: 'utf8', timeout: 120000 });
      assert.equal(r.status, 0, r.stderr);
      return (fs.readFileSync(path.join(dir, 'd.html'), 'utf8').match(/@font-face\{font-family:'Noto Color Emoji'/g) || []).length;
    };
    assert.ok(faces('style: |\n  section h1::after { content: " \\1F680"; }\n') > 0, 'the rocket the CSS draws brings its slices');
    assert.equal(faces(''), 0, 'a deck without emoji carries no emoji font');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
