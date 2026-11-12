/**
 * The Lattice layouts VS Code extension (kit/vscode): the directive matcher that decides where
 * the menu may open, and the `.vsix` the kit ships.
 *
 * The matcher is the whole promise: layout names inside `<!-- _class: ` (any word of the class
 * list) and NOTHING in prose. The real-editor probe (0 menus in 150 prose words, the menu on
 * `<!-- _class: `) is in the PR that added it; this pins the decision it rests on.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { classContext } = require('../../../kit/vscode/extension.js');
const { buildVsix, vsixEntries, FILE_NAME } = require('../../../kit/vscode/vsix.js');
const { loadAll } = require('../../../lib/components');

describe('classContext — where the menu may open', () => {
  test('inside a class directive it returns the partial word', () => {
    assert.equal(classContext('<!-- _class: '), '');
    assert.equal(classContext('<!-- _class: kp'), 'kp');
    assert.equal(classContext('<!-- class: split-pa'), 'split-pa');
    assert.equal(classContext('<!--_class:kpi'), 'kpi');
    assert.equal(classContext('<!-- _class: kpi '), '', 'a second class word');
    assert.equal(classContext('<!-- _class: kpi da'), 'da');
  });

  test('anywhere else it returns null, so prose opens nothing', () => {
    for (const line of ['', 'The kpi slide', 'lattice-kpi', '::kpi', '/kpi', 'class: kpi', '_class: kpi',
      '<!-- _paginate: ', '<!-- _class: kpi -->', '<!-- _class: kpi --> and more', '<!-- note: class: kpi',
      '- A bullet with `_class: kpi` in code']) {
      assert.equal(classContext(line), null, JSON.stringify(line));
    }
  });
});

/** Read a stored-or-deflated zip's entries back: [name, Buffer]. */
function unzip(buf) {
  const out = [];
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const method = buf.readUInt16LE(p + 8), size = buf.readUInt32LE(p + 18), raw = buf.readUInt32LE(p + 22);
    const crc = buf.readUInt32LE(p + 14);
    const nlen = buf.readUInt16LE(p + 26), xlen = buf.readUInt16LE(p + 28);
    const name = buf.toString('utf8', p + 30, p + 30 + nlen);
    const body = buf.subarray(p + 30 + nlen + xlen, p + 30 + nlen + xlen + size);
    const data = method === 8 ? zlib.inflateRawSync(body) : body;
    assert.equal(data.length, raw, `${name}: size`);
    assert.equal(zlib.crc32(data), crc, `${name}: crc`);
    out.push([name, data]);
    p += 30 + nlen + xlen + size;
  }
  assert.equal(buf.readUInt32LE(p), 0x02014b50, 'the central directory follows the entries');
  return out;
}

describe('the .vsix', () => {
  test('is byte-for-byte deterministic (the kit --check compares bytes)', () => {
    assert.ok(buildVsix().equals(buildVsix()));
    assert.equal(FILE_NAME, 'lattice-layouts.vsix');
  });

  test('reads back as the files VS Code installs, with a layout per manifest', () => {
    const files = new Map(unzip(buildVsix()));
    assert.deepEqual([...files.keys()], vsixEntries(loadAll()).map(([n]) => n));
    const pkg = JSON.parse(files.get('extension/package.json'));
    assert.equal(pkg.main, './extension.js');
    assert.deepEqual(pkg.activationEvents, ['onLanguage:markdown']);
    assert.match(files.get('extension.vsixmanifest').toString(), new RegExp(`Id="${pkg.name}" Version="${pkg.version}" Publisher="${pkg.publisher}"`));
    const layouts = JSON.parse(files.get('extension/layouts.json'));
    const names = loadAll().map((m) => m.name).sort();
    assert.deepEqual(layouts.map((l) => l.name).sort(), names, 'one entry per manifest, no more, no fewer');
    assert.ok(layouts.every((l) => l.summary && l.bucket), 'each carries its summary and bucket');
  });
});
