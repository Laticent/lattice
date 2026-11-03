/**
 * Integration: the MEASURED split (`--fit-pack`), on a real CLI render.
 *
 * The structural split cuts a slide past its component's hard count at one member a page,
 * whether or not the slide fits. The measured split renders the deck whole, keeps a slide that
 * fits whole by the shared verdict (lib/core/fit-measure.js), and packs an overflowing one by
 * measured height (@laticent/fluido `pack`). This file pins the three promises that make it
 * safe to ship (engineering/decisions/2026-10-28-fit-everywhere-model.md §16):
 *
 *  - a slide over its hard count that FITS stays one page;
 *  - a slide that overflows packs several members a page, in fewer pages than one a page;
 *  - no member is lost, under any packer.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const TMP = path.join(ROOT, '.scratch', 'measured-split');

const items = (n) => Array.from({ length: n }, (_, i) => `- Item ${i + 1} on the agenda`).join('\n');
// Eight short items at a portrait box: past agenda's hard count of six, which the structural
// split cuts on any box but the deck's own, and well inside the slide.
const FITS = `---\nmarp: true\ntheme: indaco\nsize: portrait\n---\n\n<!-- _class: agenda -->\n\n## Eight short items\n\n${items(8)}\n`;
// Eighteen items at a square box: more than one page can hold.
const OVER = `---\nmarp: true\ntheme: indaco\nsize: square\n---\n\n<!-- _class: agenda -->\n\n## Eighteen items\n\n${items(18)}\n`;

function render(name, md, ...flags) {
  fs.mkdirSync(TMP, { recursive: true });
  const src = path.join(TMP, `${name}.md`);
  const out = path.join(TMP, `${name}.html`);
  fs.writeFileSync(src, md);
  const r = spawnSync('node', [path.join(ROOT, 'lattice.js'), src, '-o', out, ...flags], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, `render ${name} failed (exit ${r.status}):\n${r.stderr}`);
  return fs.readFileSync(out, 'utf8');
}

const sections = (html) => (html.match(/<section\b[^>]*data-lattice-slide="[^"]*"/g) || []);
const bodies = (html) => sections(html).filter((s) => /data-split-role="body"/.test(s));
const memberCount = (html, n) => Array.from({ length: n }, (_, i) => new RegExp(`Item ${i + 1} on the agenda`).test(html)).filter(Boolean).length;

describe('measured split, through the CLI', () => {
  test('a slide past its hard count that fits stays whole', () => {
    const structural = render('fits-structural', FITS);
    const measured = render('fits-measured', FITS, '--fit-pack', 'knuth-plass');
    assert.ok(bodies(structural).length > 1, 'the structural split cuts it (the control)');
    assert.equal(bodies(measured).length, 0, 'the measured split keeps it whole');
    assert.equal(memberCount(measured, 8), 8);
  });

  for (const packer of ['greedy', 'balanced', 'knuth-plass']) {
    test(`an overflowing slide packs several members a page (${packer})`, () => {
      const structural = render(`over-structural-${packer}`, OVER);
      const measured = render(`over-measured-${packer}`, OVER, '--fit-pack', packer);
      const b = bodies(measured).length;
      assert.ok(b >= 1, 'the measured split splits it');
      assert.ok(b < bodies(structural).length, `fewer body pages than one a page (${b} vs ${bodies(structural).length})`);
      assert.equal(memberCount(measured, 18), 18, 'no member lost');
    });
  }

  test('an unknown packer is refused', () => {
    fs.mkdirSync(TMP, { recursive: true });
    const src = path.join(TMP, 'bad.md');
    fs.writeFileSync(src, FITS);
    const r = spawnSync('node', [path.join(ROOT, 'lattice.js'), src, '-o', path.join(TMP, 'bad.html'), '--fit-pack', 'nope'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 2);
  });
});
