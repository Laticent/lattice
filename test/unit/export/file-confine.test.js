// A render reads a local file only when its REAL path is inside the deck's folder or Lattice's install
// (media note §4.11, "Paths stay inside the deck"). `resolveRelative` checks text; this checks the file system:
// a symlink in the deck folder that points out, and a typed `file:///abs/path`, both land outside.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createFileConfiner } = require('../../../lib/export/file-confine.js');
const { buildPlayerHtml } = require('../../../lib/export/html-player.js');
const { bake } = require('./bake-helper.js');

const photo = path.join(__dirname, '../../../lib/samples/photo-wide.jpg');
const SECRET = Buffer.from('not-a-picture-but-secret-bytes');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'confine-'));
  const deck = path.join(root, 'deck');
  const outside = path.join(root, 'outside');
  fs.mkdirSync(deck);
  fs.mkdirSync(outside);
  fs.copyFileSync(photo, path.join(deck, 'ok.jpg'));
  fs.copyFileSync(photo, path.join(outside, 'secret.jpg'));
  fs.symlinkSync(path.join(outside, 'secret.jpg'), path.join(deck, 'linked.jpg'));
  fs.symlinkSync(outside, path.join(deck, 'linkdir'));
  fs.writeFileSync(path.join(outside, 'host.png'), SECRET);
  return { root, deck, outside };
}

test('a file inside a root is allowed; a symlink that leaves it, a sibling folder and a missing file are not', () => {
  const { root, deck, outside } = fixture();
  try {
    const c = createFileConfiner([deck]);
    assert.equal(c.allows(path.join(deck, 'ok.jpg')), true);
    assert.equal(c.allows(pathToFileURL(path.join(deck, 'ok.jpg')).href), true);
    assert.equal(c.allows(path.join(deck, 'linked.jpg')), false, 'file symlink');
    assert.equal(c.allows(path.join(deck, 'linkdir', 'secret.jpg')), false, 'directory symlink');
    assert.equal(c.allows(path.join(outside, 'secret.jpg')), false, 'typed absolute path');
    assert.equal(c.allows(path.join(deck, 'nope.jpg')), false, 'missing');
    // a sibling whose name starts with the root's name is not inside it
    fs.mkdirSync(`${deck}-evil`);
    fs.copyFileSync(photo, path.join(`${deck}-evil`, 'x.jpg'));
    assert.equal(c.allows(path.join(`${deck}-evil`, 'x.jpg')), false, 'prefix sibling');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the player inliner does not read a symlink that leaves the deck, and draws the stand-in', () => {
  const { root, deck, outside } = fixture();
  try {
    const confine = createFileConfiner([deck]);
    const ok = pathToFileURL(path.join(deck, 'ok.jpg')).href;
    const linked = pathToFileURL(path.join(deck, 'linked.jpg')).href;
    const typed = pathToFileURL(path.join(outside, 'secret.jpg')).href;
    const html = `<img src="${ok}"><img src="${linked}"><div style="background-image:url(&quot;${typed}&quot;)"></div>`;
    const r = bake(html, { confine });
    assert.equal(r.count, 1, 'only the file inside the deck is baked in');
    assert.equal(r.missing.length, 2);
    assert.match(r.missing[0], /outside the deck folder/);
    const photoB64 = fs.readFileSync(photo).toString('base64');
    assert.equal(r.html.split(photoB64).length - 1, 1, 'the picture bytes appear once: the in-deck file');
    assert.doesNotMatch(r.html, /file:\/\//, 'no local path rides into the shared file');
    assert.match(r.html, /image\/svg\+xml,%3Csvg/, 'the stand-in takes its place');
    // without a confiner the old behavior holds (a host that has its own gate)
    assert.equal(bake(html).count, 3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('buildPlayerHtml confines a deck-relative symlink and a typed file address to the deck folder', async () => {
  const { root, deck, outside } = fixture();
  try {
    const typed = pathToFileURL(path.join(outside, 'secret.jpg')).href;
    const docHtml = `<section data-lattice-slide="1"><img src="linked.jpg" alt="a"><img src="${typed}" alt="b"><img src="ok.jpg" alt="c"></section>`;
    const { html, report } = await buildPlayerHtml({ docHtml, source: '', title: 't', assetBaseUrl: pathToFileURL(deck + path.sep).href });
    const photoB64 = fs.readFileSync(photo).toString('base64');
    // The player may carry a picture more than once (a hoisted asset); what matters is that the two refused
    // addresses add none, so the count equals a deck that names ok.jpg alone.
    const alone = await buildPlayerHtml({ docHtml: '<section data-lattice-slide="1"><img src="ok.jpg" alt="c"></section>', source: '', title: 't', assetBaseUrl: pathToFileURL(deck + path.sep).href });
    const copies = (h) => h.split(photoB64).length - 1;
    assert.ok(copies(alone.html) >= 1);
    assert.equal(copies(html), copies(alone.html), 'the refused pictures add no bytes');
    assert.doesNotMatch(html, /file:\/\//);
    assert.ok(report.missing.some((m) => /outside the deck folder/.test(m)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
