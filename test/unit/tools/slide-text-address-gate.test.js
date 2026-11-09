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
const WHY = 'a probe entry';
const entry = (file, reads, sinks, guards = 1, guard = 'masks') => ({ file, reads, sinks, guards, guard, why: WHY });

// The attack, as a pass would write it: the first bullet's text becomes a poster.
// biome-ignore lint/suspicious/noTemplateCurlyInString: the probe is SOURCE TEXT a pass would hold, `${…}` included
const POSTER = "function f(sec) { const li = sec.querySelector('li'); sec.querySelector('a').style.backgroundImage = `url('${li.textContent}')`; }";

describe('checkSlideTextAddressReaders — what it must catch', () => {
  test('a NEW pass that turns a bullet\'s text into a poster fails the build', () => {
    const errors = gate({ 'lib/transformers/poster.js': POSTER });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /lib\/transformers\/poster\.js reads slide text and writes an address \(reads li\+text, writes css-url×1\)/);
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
    assert.match(errors[0], /makes 0 guard call\(s\).*pins 1/);
  });

  test('a new kind of read or write in a sanctioned file is a new path, not one the old reason covers', () => {
    const errors = gate({ 'lib/p.js': "function f(sec, img, el, x) { if (sec.closest('[data-lattice-plugin]')) return; img.src = sec.textContent; el.setAttribute('href', x); }" }, [entry('lib/p.js', ['text'], { property: 1 })]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /now reads text, writes property×1\+set-attribute×1; .* declares it reads text, writes property×1/);
  });

  test('COUNTS, not yes/no: a second write of a kind already pinned fails, and so does deleting one of two guards', () => {
    // The checker on this gate: the runtime holds two guards and three `.src =`; a file-wide yes/no certified both.
    const two = "function f(sec, a, b) { if (a.closest('[data-lattice-plugin]')) return; if (b.closest('[data-lattice-plugin]')) return; a.src = sec.textContent; }";
    assert.deepEqual(gate({ 'lib/p.js': two }, [entry('lib/p.js', ['text'], { property: 1 }, 2)]), []);
    const oneGuard = two.replace("if (b.closest('[data-lattice-plugin]')) return; ", '');
    assert.match(gate({ 'lib/p.js': oneGuard }, [entry('lib/p.js', ['text'], { property: 1 }, 2)]).join('\n'), /makes 1 guard call\(s\).*pins 2/);
    const secondSink = two.replace('a.src = sec.textContent;', 'a.src = sec.textContent; b.src = sec.textContent;');
    assert.match(gate({ 'lib/p.js': secondSink }, [entry('lib/p.js', ['text'], { property: 1 }, 2)]).join('\n'), /writes property×2; .* declares it .*property×1/);
  });

  test('a regex over markup hunting an address is a read, though it never says <li or textContent', () => {
    // The checker on this gate: both of these passed with no sanction.
    const errors = gate({
      'lib/a.js': 'function f(inner) { const m = /<a\\b[^>]*href="([^"]+)"/.exec(inner); return qrSvg(m[1]); }',
      'lib/b.js': "function f(sec, img) { img.src = sec.querySelector('p').firstChild.data; }",
    });
    assert.ok(errors.some((e) => /^lib\/a\.js reads slide text .*reads regex, writes qr×1/.test(e)), errors.join('\n'));
    assert.ok(errors.some((e) => /^lib\/b\.js reads slide text .*reads text, writes property×1/.test(e)), errors.join('\n'));
  });

  test('a stale entry, a duplicate, a bad guard and a missing reason each fail', () => {
    const errors = gate({ 'lib/p.js': 'const x = 1;' }, [
      entry('lib/gone.js', ['text'], { property: 1 }),
      entry('lib/gone.js', ['text'], { property: 1 }),
      { ...entry('lib/gone2.js', ['text'], { property: 1 }, 1, 'trust-me'), why: ' ' },
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
      'lib/d.js': 'function f(el, t) { el.textContent.length; return `<i data-src="${t}">`; }',
    }), []);
  });

  test('vendored copies and generated files are not ours to census', () => {
    assert.deepEqual(gate({ 'lib/plugins/x/vendor/lib.js': POSTER, 'lib/runtime/x.generated.js': POSTER }), []);
  });

  test('the live tree is clean, and every entry carries its reason', () => {
    const errors = [];
    checkSlideTextAddressReaders(errors);
    assert.deepEqual(errors, []);
    for (const s of SANCTIONED_SLIDE_TEXT_ADDRESS_READERS) assert.ok(s.why.trim(), s.file);
  });
});
