// LFM 1.0 §2.1, the version line: one reader (lib/core/lfm-version.js), two callers (lint-core's `lfm-version`
// and the command line's refusal). Failing arm for each: a reader that accepts every major would pass the kernel's
// "newer-major" case only by accident, so each case names the problem it expects.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');

const { readLfmVersion, lfmVersionMessage, LFM_MAJOR } = require('../../../lib/core/lfm-version');
const { lintText } = require('../../../lib/authoring/lint');

test('readLfmVersion: absent, the same major, a newer major, an older major, and not a version', () => {
  assert.equal(LFM_MAJOR, 1);
  assert.deepEqual(readLfmVersion(null), { stated: false, raw: null, ok: true, major: 1, minor: 0, problem: null });
  assert.deepEqual(readLfmVersion(''), { stated: false, raw: null, ok: true, major: 1, minor: 0, problem: null });
  assert.deepEqual(readLfmVersion('1.0'), { stated: true, raw: '1.0', ok: true, major: 1, minor: 0, problem: null });
  assert.deepEqual(readLfmVersion('1.7'), { stated: true, raw: '1.7', ok: true, major: 1, minor: 7, problem: null });
  assert.deepEqual(readLfmVersion('1'), { stated: true, raw: '1', ok: true, major: 1, minor: 0, problem: null });
  assert.equal(readLfmVersion('2.0').problem, 'newer-major');
  assert.equal(readLfmVersion('0.9').problem, 'older-major');
  for (const bad of ['one', '1.0.1', 'v1', '1.x', '-1']) assert.equal(readLfmVersion(bad).problem, 'malformed', bad);
  assert.equal(lfmVersionMessage(readLfmVersion('1.0')), null);
  assert.match(lfmVersionMessage(readLfmVersion('2.0')), /LFM 2\.0.*LFM 1\.x/);
});

function lfmFindings(source) {
  return lintText(source).filter((f) => f.rule === 'lfm-version');
}

test('lint: an unknown major is an error, a non-version a warning, a 1.x line and no line are clean', () => {
  const deck = (v) => `---\nlfm: ${v}\n---\n\n# Hi\n`;
  assert.deepEqual(lfmFindings(deck('1.0')), []);
  assert.deepEqual(lfmFindings(deck('1.4')), []);
  assert.deepEqual(lfmFindings('---\ntheme: indaco\n---\n\n# Hi\n'), []);
  const newer = lfmFindings(deck('2.0'));
  assert.equal(newer.length, 1);
  assert.equal(newer[0].severity, 'error');
  assert.equal(newer[0].slide, 0);
  const odd = lfmFindings(deck('one'));
  assert.equal(odd.length, 1);
  assert.equal(odd[0].severity, 'warning');
  // `lfm:` is a key the table knows, so it is never also `unknown-key`.
  assert.equal(lintText(deck('1.0')).filter((f) => f.rule === 'unknown-key' && f.classToken === 'lfm').length, 0);
});

test('command line: refuses an unknown major before rendering, and says why', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lfm-version-'));
  try {
    const src = path.join(dir, 'deck.md');
    fs.writeFileSync(src, '---\nlfm: 2.0\n---\n\n# Hi\n');
    const r = spawnSync(process.execPath, [path.join(__dirname, '../../../lattice.js'), src, path.join(dir, 'deck.html'), '-q'], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /this Lattice reads LFM 1\.x/);
    assert.equal(fs.existsSync(path.join(dir, 'deck.html')), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
