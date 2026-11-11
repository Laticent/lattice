/**
 * The D11 gate (tools/check-ownership.js `checkProviderAttributeWriters`, record note §5.7, step 3): the host's apply
 * step is the only writer of a computed `data-*` attribute, and no plugin writes a slide-metadata attribute by name.
 * Each arm is shown failing on a deliberate violation in a throwaway tree, and passing on the real one.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkProviderAttributeWriters, SANCTIONED_PROVIDER_ATTRIBUTE_WRITERS } = require('../../../tools/check-ownership.js');

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'd11-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}
const run = (root, sanctioned = [{ file: 'lib/engine/slides.js' }]) => {
  const errors = [];
  checkProviderAttributeWriters(errors, { root, sanctioned });
  return errors;
};
const HOST = { 'lib/engine/slides.js': 'token.attrSet(`data-${kb}`, value);\n' };

describe('D11: the host writes every provider attribute', () => {
  test('the real tree passes, and every allowlist entry says why', () => {
    const errors = [];
    checkProviderAttributeWriters(errors);
    assert.deepEqual(errors, []);
    for (const e of SANCTIONED_PROVIDER_ATTRIBUTE_WRITERS) assert.ok(e.why.length > 40, e.file);
  });

  test('a computed data-* writer outside the allowlist fails, in a plugin or in the host', () => {
    const root = tree({ ...HOST, 'lib/plugins/x/x.transform.js': "el.setAttribute('data-' + key, v);\n", 'lib/core/y.js': 'tok.attrSet(`data-${k}`, v);\n' });
    const errors = run(root);
    assert.equal(errors.length, 2, errors.join('\n'));
    assert.match(errors[0], /lib\/core\/y\.js:1/);
    assert.match(errors[1], /lib\/plugins\/x\/x\.transform\.js:1/);
  });

  test('a plugin writing a slide-metadata attribute by name fails; its own markup string does not', () => {
    const root = tree({ ...HOST, 'lib/plugins/x/x.js': "section.setAttribute('data-footer', 'x');\nattrs.push('data-focus-style=\"ring\"');\n" });
    const errors = run(root);
    assert.equal(errors.length, 1, errors.join('\n'));
    assert.match(errors[0], /writes `data-footer`/);
  });

  test('a stale allowlist entry fails', () => {
    const errors = run(tree({ 'lib/engine/slides.js': '// nothing here\n' }));
    assert.match(errors.join('\n'), /stale entry/);
  });
});
