/**
 * Integration: speaker notes — the emulator embeds a slide's note comment as a
 * per-page PDF text annotation and a hidden `aside.lattice-notes` in the HTML
 * sidecar. notes-core decides *what* is a note (covered by its unit + marp-core
 * parity test); this pins the emulator WIRING that the unit suite can't reach:
 * index alignment with the rendered slides, the hidden-by-default annotation
 * flag, the --notes-icon toggle, the --notes sidecar, and that the raw comment
 * is stripped (not duplicated) once lifted into the aside.
 *
 * Slow tier: each case runs the emulator's full Chromium PDF stage.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { PDFDocument, PDFName } = require('pdf-lib');
const { ROOT, THEME, EMULATOR, tmpFile } = require('../../helpers/render');

const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'speaker-notes.md');

function render(extraArgs = []) {
  const out = tmpFile('.pdf');
  // `--keep-html`: two cases below read the `.html` sidecar, which is deleted on success by default (P1).
  execFileSync(
    process.execPath,
    [EMULATOR, FIXTURE, THEME, out, 'indaco', '-q', '--keep-html', ...extraArgs],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 },
  );
  return out;
}

// Per page: the note Contents string, or null when the page has no annotation.
async function pageAnnotations(pdfPath) {
  const doc = await PDFDocument.load(fs.readFileSync(pdfPath));
  return doc.getPages().map((pg) => {
    const annots = pg.node.get(PDFName.of('Annots'));
    if (!annots) return null;
    const an = doc.context.lookup(annots.asArray()[0]);
    return {
      contents: an.get(PDFName.of('Contents')).asString(),
      hidden: (an.get(PDFName.of('F'))?.asNumber() ?? 0) === 2,
    };
  });
}

describe('speaker notes (emulator)', () => {
  test('PDF annotations: index-aligned, hidden by default, pragma slide excluded', { timeout: 60000 }, async () => {
    const pdf = render();
    const annots = await pageAnnotations(pdf);
    assert.equal(annots.length, 4, 'expected 4 pages');
    assert.equal(annots[0].contents, 'First note, on slide one.');
    assert.equal(annots[1], null, 'slide 2 carries only a tooling pragma — no note');
    assert.equal(annots[2].contents, 'Note A on slide three.\n\nNote B on slide three.');
    assert.ok(annots[0].hidden && annots[2].hidden, 'annotations are hidden (F=2) by default');
  });

  // Regression: the aside is spliced in with String.replace, where `$1`-`$9`,
  // `$&`, `` $` `` and `$'` are BACKREFERENCES, not literals. A note reading
  // "$100" used to expand to the first capture group ("<section") plus "00",
  // which unbalanced the HTML — the depth-aware section walker then under-counted
  // slides, and the page/note length mismatch silently dropped EVERY annotation
  // from the PDF. Prose about money is the ordinary way to hit this.
  test('a note carrying $-replacement tokens survives verbatim', { timeout: 60000 }, async () => {
    const NOTE = "Fixing it at design costs $1; at the customer, $100. Also $& and $` and $'.";
    const pdf = render();
    const annots = await pageAnnotations(pdf);
    assert.equal(annots[3].contents, NOTE, 'the note round-trips with no backreference expansion');

    const html = fs.readFileSync(pdf.replace(/\.pdf$/, '.html'), 'utf8');
    // The `$`-carrying aside must not have injected a stray, unbalanced <section.
    const slideSections = (html.match(/<section\b[^>]*\bdata-lattice-slide=/g) || []).length;
    assert.equal(slideSections, 4, 'four slide sections in the sidecar');
    const { splitSections } = require('@laticent/markup');
    const at = html.search(/<section\b[^>]*\bdata-lattice-slide=/);
    const walked = splitSections(html.slice(at)).filter((p) => p.type === 'section');
    assert.equal(walked.length, 4, 'the section walker agrees — no unbalanced <section leaked in');
  });

  test('HTML sidecar: hidden aside per noted slide; raw note comment stripped', { timeout: 60000 }, () => {
    const pdf = render();
    const html = fs.readFileSync(pdf.replace(/\.pdf$/, '.html'), 'utf8');
    const asides = [...html.matchAll(/<aside class="lattice-notes" hidden data-slide="(\d+)">([\s\S]*?)<\/aside>/g)]
      .map((m) => ({ slide: m[1], text: m[2] }));
    assert.equal(asides.length, 3, 'three slides have notes');
    assert.deepEqual(asides.map((a) => a.slide), ['1', '3', '4']);
    assert.match(asides[0].text, /First note, on slide one\./);
    // The raw <!-- … --> note comment must be gone (lifted, not duplicated).
    assert.equal(/<!--\s*First note/.test(html), false, 'raw note comment should be stripped');
  });

  test('--notes-icon makes the annotation visible (no Hidden flag)', { timeout: 60000 }, async () => {
    const pdf = render(['--notes-icon']);
    const annots = await pageAnnotations(pdf);
    assert.equal(annots[0].hidden, false, '--notes-icon clears the Hidden flag');
    assert.equal(annots[0].contents, 'First note, on slide one.');
  });

  test('--notes writes a plaintext sidecar, one block per noted slide', { timeout: 60000 }, () => {
    const pdf = render(['--notes']);
    const sidecar = pdf.replace(/\.pdf$/i, '') + '.notes.txt';
    const txt = fs.readFileSync(sidecar, 'utf8');
    assert.match(txt, /# Slide 1\n\nFirst note, on slide one\./);
    assert.match(txt, /# Slide 3\n\nNote A on slide three\.\n\nNote B on slide three\./);
    assert.equal(/# Slide 2/.test(txt), false, 'slide 2 has no note → no block');
  });
});

// Every export that keeps speaker notes says so on the console, and names the switch
// (#1833, the owner's option B, 2026-11-08). Notes ride by default; the CLI is not silent
// about it. Under --strip-notes there is nothing to warn about, and --quiet silences it with
// the rest of the summary.
describe('the CLI says when an export ships speaker notes (#1833)', () => {
  const { spawnSync } = require('child_process');
  function stderrOf(ext, extraArgs = []) {
    const out = tmpFile(ext);
    const r = spawnSync(process.execPath, [EMULATOR, FIXTURE, THEME, out, 'indaco', ...extraArgs], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
    assert.equal(r.status, 0, `export failed: ${r.stderr}`);
    return r.stderr;
  }
  const WARNING = /⚠ (?:1 slide ships|\d+ slides ship) speaker notes in this (\S.*?) — anyone who opens the file can read them\. Export with --strip-notes to remove them\./g;
  const warnings = (text) => [...text.matchAll(WARNING)].map((m) => m[1]);

  for (const [ext, what] of [['.pdf', 'PDF'], ['.pptx', 'PowerPoint file'], ['.html', 'web page']]) {
    test(`${ext}: warns once by default, and not under --strip-notes or --quiet`, { timeout: 240000 }, () => {
      assert.deepEqual(warnings(stderrOf(ext)), [what], `one ${what} warning by default`);
      assert.deepEqual(warnings(stderrOf(ext, ['--strip-notes'])), [], 'nothing ships under --strip-notes, so nothing is said');
      assert.deepEqual(warnings(stderrOf(ext, ['-q'])), [], '--quiet silences it');
    });
  }

  test('.html --player: one warning, for the player, not a second for the page it replaces', { timeout: 240000 }, () => {
    assert.deepEqual(warnings(stderrOf('.html', ['--player'])), ['player']);
  });

  test('.html --read: no warning, because the reading article carries no notes', { timeout: 240000 }, () => {
    assert.deepEqual(warnings(stderrOf('.html', ['--read'])), []);
  });

  test('.pdf --fluid: the emailable viewer beside the PDF carries notes, so both files warn', { timeout: 240000 }, () => {
    assert.deepEqual(warnings(stderrOf('.pdf', ['--fluid'])), ['PDF', 'web page']);
  });
});
