/**
 * The security spine's census (S3; engineering/decisions/2026-11-03-security-findings-spine.md §4): a private reader or
 * a private copy of a policy list outside the spine fails build:check. Its failing arms plant each shape and expect the
 * build to fail, in a scratch tree and against the real allowlist.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const own = require('../../../tools/check-ownership.js');

const { spineCensusHits, spineCensusFindings, checkSecuritySpineCensus, SANCTIONED_SPINE_READERS } = own;

describe('security spine census (S3)', () => {
  test('the tree is clean against its allowlist', () => {
    const errors = [];
    checkSecuritySpineCensus(errors);
    assert.deepEqual(errors, []);
  });

  test('each shape is counted', () => {
    assert.deepEqual(spineCensusHits("const re = /url\\(\\s*['\"]?([^'\")]+)/;"), { 'url-reader': 1 });
    assert.deepEqual(spineCensusHits('const m = html.match(/\\bsrc\\s*=\\s*["\']([^"\']+)/);'), { 'attr-reader': 1 });
    assert.deepEqual(spineCensusHits("const FETCH = new Set(['src', 'srcset', 'poster', 'href']);"), { 'list-copy': 1 });
    assert.deepEqual(spineCensusHits("const CUTS = ['script', 'iframe', 'object', 'embed'];"), { 'list-copy': 1 });
    assert.deepEqual(spineCensusHits('if (/<\\/style/i.test(css)) return null;'), { 'style-closer': 1 });
  });

  test('a writer, a comment, and a list that only mentions a name are not readers', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the source text of a template literal, read as text
    assert.deepEqual(spineCensusHits('const css = `background:url(${u})`; const html = `<img src="${src}">`;'), {});
    assert.deepEqual(spineCensusHits('// a regex like /url\\(/ once read this\n * and /\\bsrc\\s*=/ too'), {});
    assert.deepEqual(spineCensusHits("const KEYS = ['src', 'title', 'alt', 'width', 'height'];"), {});
    // a whole `<style>…</style>` element matcher is not the `</style` test the table owns
    assert.deepEqual(spineCensusHits('html.replace(/<style\\b[^>]*>[\\s\\S]*?<\\/style>/gi, "")'), {});
  });

  test('failing arm: a reader planted in a scratch tree fails the build', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spine-census-'));
    try {
      fs.mkdirSync(path.join(root, 'lib', 'core'), { recursive: true });
      fs.mkdirSync(path.join(root, 'docs', 'src'), { recursive: true });
      fs.writeFileSync(path.join(root, 'lib', 'core', 'planted.js'), "const URL_RE = /url\\(\\s*(['\"]?)([^)]+)\\1\\)/g;\nconst ATTRS = ['src', 'srcset', 'poster'];\n");
      const errors = [];
      checkSecuritySpineCensus(errors, [], root);
      assert.equal(errors.length, 2);
      assert.match(errors[0], /lib\/core\/planted\.js holds 1 url-reader .*none sanctioned/);
      assert.match(errors[1], /lib\/core\/planted\.js holds 1 list-copy/);
      // sanctioned with its count, it passes
      const ok = [];
      checkSecuritySpineCensus(ok, [{ file: 'lib/core/planted.js', shape: 'url-reader', count: 1, why: 't' }, { file: 'lib/core/planted.js', shape: 'list-copy', count: 1, why: 't' }], root);
      assert.deepEqual(ok, []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('failing arm: one more reader in a sanctioned file, and a stale entry, each fail', () => {
    const s = SANCTIONED_SPINE_READERS.find((x) => x.file === 'lib/core/slide-camera.mjs' && x.shape === 'url-reader');
    assert.ok(s, 'slide-camera.mjs is sanctioned on day one');
    assert.match(spineCensusFindings([{ file: s.file, shape: s.shape, n: s.count + 1 }], [s])[0], /holds 4 url-reader .*3 sanctioned/);
    assert.match(spineCensusFindings([], [s])[0], /^stale security-spine sanction/);
  });

  test('every sanction says why', () => {
    for (const s of SANCTIONED_SPINE_READERS) assert.ok(s.why && s.why.length > 30, `${s.file} ${s.shape}`);
  });
});
