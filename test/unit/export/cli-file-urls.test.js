// A file: URL is built with pathToFileURL, never by string concatenation: 'file://' + 'C:\\x\\y.html' is not
// a valid Windows address (followups.d/2771-p3-cli-windows-file-urls.md).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../../..');
const FILES = ['lattice.js', 'lib/export/video.mjs'];

test('the CLI export code builds no file: URL by string concatenation', () => {
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const bad = src.split('\n').map((l, i) => [l, i + 1]).filter(([l]) => !/^\s*\/\//.test(l) && /(['"`])file:\/\/\/?\1\s*\+|`file:\/\/\/?\$\{/.test(l));
    assert.deepEqual(bad, [], `${f}: use pathToFileURL(...).href`);
  }
});
