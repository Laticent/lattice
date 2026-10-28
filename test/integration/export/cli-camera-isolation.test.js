/**
 * Integration: the CLI's slide camera (lib/export/cli-camera.js) runs where a deck's own scripts cannot reach it.
 *
 * Why this exists. The camera answers its request for a picture's bytes with a confined local read. Until the #2904
 * follow-up it ran in the deck's own JavaScript world, guarded that read with a per-run secret, and skipped loading its
 * bundle when `LatticePdfCompose.captureSlide` already existed. A deck whose `<script>` predefined that global therefore
 * received the export's `captureSlide` call, and with it the secret-bound reader; the export then wrote the deck's picture
 * (measured: a 2 x 2 PNG in place of the 2560 x 1440 slide). The camera now runs in an isolated world, and the read hook is
 * bound to that world alone.
 *
 * Needs Chromium and the camera bundle (`npm run build`).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const BUNDLE = path.join(ROOT, 'dist', 'lattice-pdf-compose-min.js');

// A deck that predefines the camera's global and traps any later assignment to it, so even a bundle loaded over it in the
// deck's world would leave the fake in place. If the export runs the fake, the slide comes out as a 2 x 2 picture.
const ATTACK = `---
theme: indaco
---
<script>
(() => {
  const fake = { captureSlide: async (el, o) => {
    try { await o.toDataUri(location.href.replace(/[^/]*$/, '') + 'photo.jpg'); } catch {}
    const c = document.createElement('canvas'); c.width = 2; c.height = 2;
    const b = await new Promise((r) => c.toBlob(r, 'image/png'));
    return { bytes: new Uint8Array(await b.arrayBuffer()) };
  } };
  Object.defineProperty(globalThis, 'LatticePdfCompose', { get: () => fake, set: () => {}, configurable: false });
})();
</script>

<!-- _class: image -->
![bg right](photo.jpg)
# A photo slide
`;

const pngSize = (buf) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];

test('a deck script that predefines LatticePdfCompose does not replace the CLI camera', { skip: !fs.existsSync(BUNDLE) && 'needs npm run build' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cam-isolation-'));
  try {
    fs.copyFileSync(path.join(ROOT, 'lib/samples/photo-wide.jpg'), path.join(dir, 'photo.jpg'));
    fs.writeFileSync(path.join(dir, 'd.md'), ATTACK);
    const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), path.join(dir, 'd.md'), path.join(dir, 'o.png')], { encoding: 'utf8', timeout: 120000 });
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stderr, /slide camera failed|could not be read/, 'the real camera took the slide and read its photo');
    assert.deepEqual(pngSize(fs.readFileSync(path.join(dir, 'o.001.png'))), [2560, 1440], 'the slide, not the deck script\'s picture');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the camera\'s read hook and globals are absent from the deck\'s world', { skip: !fs.existsSync(BUNDLE) && 'needs npm run build' }, async () => {
  const puppeteer = require('puppeteer');
  const { createCliCamera } = require('../../../lib/export/cli-camera.js');
  const launch = { headless: 'new', args: ['--no-sandbox'] };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await puppeteer.launch(launch);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 320, height: 180 });
    await page.setContent('<section data-lattice-slide style="width:320px;height:180px;background:#c33"></section>');
    const cam = await createCliCamera(page, { bundlePath: BUNDLE });
    const shot = await cam.shoot(0, { scale: 1, type: 'png', opaque: true });
    assert.deepEqual(pngSize(shot), [320, 180]);
    const seen = await page.evaluate(() => ['__latticeCameraUri', '__latticeCameraRead', '__latticeCameraSettle', 'LatticePdfCompose'].filter((k) => k in globalThis));
    assert.deepEqual(seen, [], 'nothing the camera holds is on the deck\'s window');
  } finally {
    await browser.close();
  }
});
