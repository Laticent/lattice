// A CLI export must put the same picture on the slide as the Studio, wherever `-o` points.
// Two defects shared one cause (followups #2727): the CLI lifted `![bg]` on EVERY slide into a
// `.lattice-bg` div whose CSS exists only for `section.image`, and it called `engine.render`
// without the deck's `baseUrl`, so a relative prose image resolved against the OUTPUT folder.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '../../..');

function exportHtml(deck) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-media-'));
  try {
    fs.mkdirSync(path.join(dir, 'deck'));
    fs.mkdirSync(path.join(dir, 'out'));
    fs.copyFileSync(path.join(ROOT, 'lib/samples/photo-pano.jpg'), path.join(dir, 'deck/pic.jpg'));
    fs.writeFileSync(path.join(dir, 'deck/d.md'), deck);
    const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), path.join(dir, 'deck/d.md'), '-o', path.join(dir, 'out/x.html')], { encoding: 'utf8', env: { ...process.env, LATTICE_KEEP_HTML: '1' } });
    assert.equal(r.status, 0, r.stderr);
    return { html: fs.readFileSync(path.join(dir, 'out/x.html'), 'utf8'), deckUrl: pathToFileURL(path.join(dir, 'deck') + path.sep).href };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('a relative prose image resolves against the deck folder, not the output folder', () => {
  const { html, deckUrl } = exportHtml('# T\n\n![a](pic.jpg)\n');
  assert.ok(html.includes(`src="${deckUrl}pic.jpg"`), 'prose image src is an absolute file:// URL beside the deck');
});

test('the photo a bleed or an image slide places is its .lattice-bg panel, the sample resolved', () => {
  for (const cls of ['content bleed', 'image']) {
    const { html } = exportHtml(`<!-- _class: ${cls} -->\n\n# T\n\n![Pano](sample:photo-pano.jpg)\n`);
    assert.match(html, /<div class="lattice-bg[^>]*background-image:url\([^)]*photo-pano\.jpg/, cls);
  }
});

test('a Marp `![bg]` exports as an ordinary picture since the engine break (2026-11-13), not a background', () => {
  const { html } = exportHtml('# T\n\n![bg contain](sample:photo-pano.jpg)\n');
  assert.ok(!html.includes('class="lattice-bg'), 'no panel');
  assert.doesNotMatch(html, /<section[^>]*background-image:url/, 'no section background');
  assert.match(html, /<img [^>]*photo-pano\.jpg/, 'an ordinary picture');
});
