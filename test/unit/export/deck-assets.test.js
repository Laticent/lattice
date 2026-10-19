// `asset:<name>` in the CLI: a folder beside the deck stands in for the Studio Library (lib/export/deck-assets.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildAssetUrls, assetRefs } = require('../../../lib/export/deck-assets.js');
const { createFileConfiner } = require('../../../lib/export/file-confine.js');
const bgImage = require('../../../lib/core/bg-image.js');

function deckWithAssets() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-assets-'));
  const deck = path.join(root, 'deck');
  fs.mkdirSync(path.join(deck, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(deck, 'assets', 'Team-Shot.JPG'), 'x');
  fs.writeFileSync(path.join(deck, 'assets', 'logo.png'), 'x');
  fs.writeFileSync(path.join(deck, 'assets', 'logo.svg'), 'x');
  fs.writeFileSync(path.join(deck, 'assets', 'notes.txt'), 'x');
  fs.writeFileSync(path.join(deck, 'assets', 'Bad Name.png'), 'x');
  fs.writeFileSync(path.join(root, 'outside.png'), 'x');
  fs.symlinkSync(path.join(root, 'outside.png'), path.join(deck, 'assets', 'sneak.png'));
  return { root, deck };
}

test('assets/ becomes the name → URL map: lowercase stem, pictures only, first of a duplicate stem, no symlink out', () => {
  const { root, deck } = deckWithAssets();
  try {
    const { urls, duplicates } = buildAssetUrls(deck, createFileConfiner([deck]));
    assert.deepEqual(Object.keys(urls).sort(), ['logo', 'team-shot']);
    assert.match(urls['team-shot'], /^file:\/\/\/.*Team-Shot\.JPG$/);
    assert.match(urls.logo, /logo\.png$/, 'alphabetical first wins');
    assert.deepEqual(duplicates, ['logo.svg']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('no assets/ folder gives an empty map, and the resolver then draws the stand-in, not a dead address', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-assets-'));
  try {
    const { urls } = buildAssetUrls(root);
    assert.deepEqual(urls, {});
    assert.match(bgImage.resolveAssetUrl('asset:hero', undefined, undefined, urls), /^data:image\/svg\+xml/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a name the folder holds resolves to its file URL', () => {
  const { root, deck } = deckWithAssets();
  try {
    const { urls } = buildAssetUrls(deck);
    assert.equal(bgImage.resolveAssetUrl('asset:Team-Shot', undefined, undefined, urls), urls['team-shot']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('assetRefs reads references outside fences and numbers their slides', () => {
  const md = '---\ntheme: x\n---\n![](asset:a)\n\n---\n```\n![](asset:in-fence)\n```\n![](asset:B)\n';
  assert.deepEqual(assetRefs(md), [{ name: 'a', slide: 1 }, { name: 'b', slide: 2 }]);
});

test('assetRefs ignores prose, inline code and comments, and reads the front-matter logo', () => {
  const md = '---\nlogo: asset:brand\n---\nAbout `asset:code` and asset:prose.\n<!--\n---\n-->\n![](asset:real)\n---\n![](asset:team.v2)\n<div style="background:url(asset:bg)"></div>\n';
  assert.deepEqual(assetRefs(md), [{ name: 'brand', slide: 1 }, { name: 'real', slide: 1 }, { name: 'team.v2', slide: 2 }, { name: 'bg', slide: 2 }]);
});
