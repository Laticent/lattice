/**
 * tools/library-prepack.js `stageLicense`: each library's tarball carries the license its
 * package.json names, and never the root AGPL text under an Apache-2.0 label (#3542).
 *
 * The first half reads the real tree: which libraries are Apache-2.0 and which stay AGPL is the
 * owner's grant, so a change to that set must be a deliberate edit here, not a side effect. The
 * second half pins each refusal against a fixture folder, so a broken check cannot pass silently.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { APACHE_2_SHA256, stageLicense } = require('../../../tools/library-prepack.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const LIBS = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).workspaces.filter((w) => w.startsWith('docs/src/lib/'));
const APACHE_TEXT = fs.readFileSync(path.join(ROOT, 'docs', 'src', 'lib', 'ltt', 'LICENSE'));
const AGPL_TEXT = fs.readFileSync(path.join(ROOT, 'LICENSE'));

// The libraries that stay AGPL-3.0-only: Calco and Trama are product features the owner keeps
// (2026-11-28), Cenno is private, and Lente's suggestion rules carry Lattice's component-selection
// policy (docs/src/lib/lente/suggest.ts). LICENSING.md says why.
const STAY_AGPL = ['docs/src/lib/calco', 'docs/src/lib/cenno', 'docs/src/lib/lente', 'docs/src/lib/trama'];

const read = (dir) => JSON.parse(fs.readFileSync(path.join(ROOT, dir, 'package.json'), 'utf8'));

test('every library except Calco, Cenno, Lente and Trama is Apache-2.0, and each one is ready to pack', () => {
  const apache = LIBS.filter((dir) => read(dir).license === 'Apache-2.0');
  const agpl = LIBS.filter((dir) => read(dir).license === 'AGPL-3.0-only');
  assert.deepEqual([...apache, ...agpl].sort(), [...LIBS].sort(), 'a library names a license that is neither Apache-2.0 nor AGPL-3.0-only');
  assert.deepEqual(agpl.sort(), STAY_AGPL);
  // An AGPL library ships no NOTICE: a stray Apache NOTICE left in its folder must never be packed.
  for (const dir of agpl) assert.ok(!(read(dir).files || []).includes('NOTICE'), `${dir} lists NOTICE in files`);
  assert.equal(apache.length, 15);
  // stageLicense on an Apache folder only reads, so running it on the real tree changes nothing.
  for (const dir of apache) assert.equal(stageLicense(path.join(ROOT, dir)), null, dir);
});

test('docs/.gitignore ignores the copied LICENSE of exactly the AGPL libraries', () => {
  // An AGPL library's LICENSE is a pack-time copy of the root text; an Apache one is tracked.
  const ignored = fs.readFileSync(path.join(ROOT, 'docs', '.gitignore'), 'utf8').split('\n').filter((l) => /^src\/lib\/[^/]+\/LICENSE$/.test(l));
  assert.deepEqual(ignored.map((l) => `docs/${l.replace(/\/LICENSE$/, '')}`).sort(), STAY_AGPL);
});

test('the Apache-2.0 text in each library is the canonical file, byte for byte', () => {
  const crypto = require('node:crypto');
  for (const dir of LIBS.filter((d) => read(d).license === 'Apache-2.0')) {
    const bytes = fs.readFileSync(path.join(ROOT, dir, 'LICENSE'));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), APACHE_2_SHA256, dir);
    const notice = fs.readFileSync(path.join(ROOT, dir, 'NOTICE'), 'utf8');
    assert.match(notice, /^@laticent\/[a-z-]+\nCopyright 2026 Sharmarke Aden, doing business as Laticent\.\n/, dir);
  }
});

/** A library folder in a temp root: its package.json, and the files given. */
function fixture(t, pkg, files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'library-prepack-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'LICENSE'), AGPL_TEXT);
  const lib = path.join(root, 'lib');
  fs.mkdirSync(lib);
  fs.writeFileSync(path.join(lib, 'package.json'), JSON.stringify({ name: '@laticent/x', files: ['dist', 'LICENSE', 'NOTICE'], ...pkg }));
  for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(lib, name), bytes);
  return { root, lib };
}

test('an Apache-2.0 library with its LICENSE, NOTICE and files entries passes and is left as it was', (t) => {
  const { root, lib } = fixture(t, { license: 'Apache-2.0' }, { LICENSE: APACHE_TEXT, NOTICE: 'n\n' });
  assert.equal(stageLicense(lib, root), null);
  assert.deepEqual(fs.readFileSync(path.join(lib, 'LICENSE')), APACHE_TEXT);
});

test('an Apache-2.0 library holding the AGPL text is refused, and the text is not replaced', (t) => {
  const { root, lib } = fixture(t, { license: 'Apache-2.0' }, { LICENSE: AGPL_TEXT, NOTICE: 'n\n' });
  assert.match(stageLicense(lib, root), /is not the Apache-2\.0 text/);
  assert.deepEqual(fs.readFileSync(path.join(lib, 'LICENSE')), AGPL_TEXT);
});

test('an Apache-2.0 library with no LICENSE, no NOTICE, or a files list missing one is refused', (t) => {
  assert.match(stageLicense(fixture(t, { license: 'Apache-2.0' }, { NOTICE: 'n\n' }).lib), /has no LICENSE/);
  assert.match(stageLicense(fixture(t, { license: 'Apache-2.0' }, { LICENSE: APACHE_TEXT }).lib), /has no NOTICE/);
  const noNotice = fixture(t, { license: 'Apache-2.0', files: ['dist', 'LICENSE'] }, { LICENSE: APACHE_TEXT, NOTICE: 'n\n' });
  assert.match(stageLicense(noNotice.lib, noNotice.root), /leaves out NOTICE/);
});

test('an AGPL-3.0-only library gets the root LICENSE copied in', (t) => {
  const { root, lib } = fixture(t, { license: 'AGPL-3.0-only' });
  assert.equal(stageLicense(lib, root), null);
  assert.deepEqual(fs.readFileSync(path.join(lib, 'LICENSE')), AGPL_TEXT);
});

test('any other license value is refused', (t) => {
  const { root, lib } = fixture(t, { license: 'MIT' });
  assert.match(stageLicense(lib, root), /names license "MIT"/);
  assert.equal(fs.existsSync(path.join(lib, 'LICENSE')), false);
});
