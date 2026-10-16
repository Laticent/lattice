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

test('![bg] on a plain slide is painted by the engine, not lifted into a sizeless .lattice-bg div', () => {
  const { html } = exportHtml('# T\n\n![bg contain](sample:photo-pano.jpg)\n');
  assert.ok(!html.includes('class="lattice-bg'), 'no lattice-bg div on a non-image slide');
  assert.match(html, /<section[^>]*background-image:url\([^)]*photo-pano\.jpg/, 'the section carries the picture');
  assert.match(html, /<section[^>]*background-size:contain/, 'the contain keyword survives');
});

test('![bg] on an image slide is still lifted to .lattice-bg', () => {
  const { html } = exportHtml('<!-- _class: image -->\n\n# T\n\n![bg](sample:photo-pano.jpg)\n');
  assert.ok(html.includes('class="lattice-bg'), 'image slide keeps its lattice-bg div');
});
