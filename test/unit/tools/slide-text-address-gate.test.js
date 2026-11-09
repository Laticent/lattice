/**
 * `checkSlideTextAddressReaders` — an address the viewer loads or scans comes only from the author's own block, never
 * from slide text and never from inside `[data-lattice-plugin]` (spec/LPM.md §10). Every arm here is a deliberate
 * violation the gate must catch, run in a TEMP tree (a probe written into the real `lib/` would be seen by
 * check-ownership.test.js scanning it concurrently), plus the live tree, which must be clean.
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { checkSlideTextAddressReaders, SANCTIONED_SLIDE_TEXT_ADDRESS_READERS } = require('../../../tools/check-ownership.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-text-address-'));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

let n = 0;
/** A fresh temp tree holding `files` (rel → source); the gate's errors over it. */
function gate(files, sanctions = []) {
  const root = path.join(TMP, String(n++));
  for (const [rel, src] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), src);
  }
  const errors = [];
  checkSlideTextAddressReaders(errors, sanctions, root);
  return errors;
}
const WHY = 'a probe entry whose reason is long enough to count as a written justification for the gate';
const entry = (file, reads, sinks, guard = 'masks') => ({ file, reads, sinks, guard, why: WHY });

// The attack, as a pass would write it: the first bullet's text becomes a poster.
// biome-ignore lint/suspicious/noTemplateCurlyInString: the probe is SOURCE TEXT a pass would hold, `${…}` included
const POSTER = "function f(sec) { const li = sec.querySelector('li'); sec.querySelector('a').style.backgroundImage = `url('${li.textContent}')`; }";

describe('checkSlideTextAddressReaders — what it must catch', () => {
  test('a NEW pass that turns a bullet\'s text into a poster fails the build', () => {
    const errors = gate({ 'lib/transformers/poster.js': POSTER });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /lib\/transformers\/poster\.js reads slide text and writes an address \(reads text\+li, writes css-url\)/);
    assert.match(errors[0], /maskPluginSubtrees/);
  });

  test('each read kind and each sink kind is seen, as the runtime and the HTML kernels spell them', () => {
    const cases = {
      'lib/a.js': 'function f(sec, img) { img.src = sec.textContent; }',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the probe is SOURCE TEXT a pass would hold, `${…}` included
      'lib/b.js': "function f(html) { const m = /<li\\b[^>]*>([^<]*)/.exec(html); return `<img src=\"${m[1]}\">`; }",
      'lib/c.js': "function f(sec, el) { el.setAttribute('href', sec.innerHTML); }",
      'lib/d.js': "const { encode } = require('./qr-card'); function f(sec) { return encode(sec.innerText); }",
      'lib/e.js': "function f(sec) { return qrSvg(sec.outerHTML); }",
    };
    const errors = gate(cases);
    for (const f of Object.keys(cases)) assert.ok(errors.some((e) => e.startsWith(f)), `${f}: ${errors.join('\n')}`);
  });

  test('deleting the mask from a sanctioned reader fails, though its entry still matches', () => {
    const real = fs.readFileSync(path.join(ROOT, 'lib/components/connect/_qr-card/qr-card.js'), 'utf8');
    const rel = 'lib/components/connect/_qr-card/qr-card.js';
    const sanction = SANCTIONED_SLIDE_TEXT_ADDRESS_READERS.filter((s) => s.file === rel);
    assert.deepEqual(gate({ [rel]: real }, sanction), [], 'the real file, as it ships, passes');
    const unmasked = real.replace('const html = maskPluginSubtrees(innerHtml);', 'const html = innerHtml;');
    assert.notEqual(unmasked, real, 'the probe removed the mask');
    const errors = gate({ [rel]: unmasked }, sanction);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /guard 'masks' but no longer calls maskPluginSubtrees/);
  });

  test('a new kind of read or write in a sanctioned file is a new path, not one the old reason covers', () => {
    const errors = gate({ 'lib/p.js': 'function f(sec, img) { if (sec.closest(\'[data-lattice-plugin]\')) return; img.src = sec.textContent; el.setAttribute(\'href\', x); }' }, [entry('lib/p.js', ['text'], ['property'])]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /now reads text, writes property\+set-attribute; .* declares it reads text, writes property/);
  });

  test('a stale entry, a duplicate, a bad guard and a missing reason each fail', () => {
    const errors = gate({ 'lib/p.js': 'const x = 1;' }, [
      entry('lib/gone.js', ['text'], ['property']),
      entry('lib/gone.js', ['text'], ['property']),
      { ...entry('lib/gone2.js', ['text'], ['property'], 'trust-me'), why: 'short' },
    ]);
    assert.ok(errors.some((e) => /duplicate entry for lib\/gone\.js/.test(e)), errors.join('\n'));
    assert.ok(errors.some((e) => /stale entry: lib\/gone\.js/.test(e)));
    assert.ok(errors.some((e) => /lib\/gone2\.js has guard "trust-me"/.test(e)));
    assert.ok(errors.some((e) => /lib\/gone2\.js needs its justification/.test(e)));
  });
});

describe('checkSlideTextAddressReaders — what it must leave alone', () => {
  test('a read with no address, and an address with no read, are not readers', () => {
    assert.deepEqual(gate({ 'lib/a.js': 'function f(sec) { return sec.textContent.length; }', 'lib/b.js': 'function f(img, u) { img.src = u; }' }), []);
  });

  test('a write to textContent is not a read; TextEncoder\'s encode is not a QR; a sink in a comment is not a sink', () => {
    assert.deepEqual(gate({
      'lib/a.js': "function f(el, img, u) { el.textContent = 'x'; img.src = u; }",
      'lib/b.js': 'function f(sec) { return new TextEncoder().encode(sec.textContent); }',
      'lib/c.js': "function f(sec) { return sec.textContent; }\n// img.src = sec.textContent;",
    }), []);
  });

  test('vendored copies and generated files are not ours to census', () => {
    assert.deepEqual(gate({ 'lib/plugins/x/vendor/lib.js': POSTER, 'lib/runtime/x.generated.js': POSTER }), []);
  });

  test('the live tree is clean, and every entry carries its reason', () => {
    const errors = [];
    checkSlideTextAddressReaders(errors);
    assert.deepEqual(errors, []);
    for (const s of SANCTIONED_SLIDE_TEXT_ADDRESS_READERS) assert.ok(s.why.length >= 60, s.file);
  });
});
