/**
 * The pre-commit PDF auto-rebuild has TWO independent filters, and they must
 * agree: lefthook's `pdf-rebuild` glob decides whether the job runs at all, and
 * `classify()` in tools/build-staged-pdfs.js decides what it rebuilds once it
 * has. A path that `classify()` understands but the glob cannot reach is a
 * SILENTLY DEAD GATE — the hook simply never fires, nothing fails, and the
 * committed PDF drifts away from its markdown.
 *
 * That is not hypothetical. `classify()` has handled `exemplars/<sector>/<name>.md`
 * since it was written, but the glob only listed `examples/*.md`,
 * `test/integration/baseline-decks/*.md` and `lib/components/**‍/*.gallery.md`.
 * So a commit touching only exemplar markdown never ran the job: 45 worked decks
 * that each ship a committed PDF had no auto-rebuild at all, and in one branch
 * 14 of them went stale — the committed PDF still showed KPI rows the markdown
 * no longer contained. `examples/*.md` was single-level for the same reason and
 * missed all 13 `examples/token-contrast/` decks.
 *
 * This test walks the REAL repo rather than a fixture list, so a new deck family
 * that ships a committed PDF is covered the moment it lands.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const picomatch = require('picomatch');

const { classify } = require('../../../tools/build-staged-pdfs.js');

const ROOT = path.join(__dirname, '..', '..', '..');

/**
 * Markdown that ships a committed PDF which `classify()` deliberately does NOT
 * handle. Each of these is a PRE-EXISTING gap, none of them on the path of the
 * change that added this test (HARD RULE #18 — log an off-path defect rather
 * than ignoring it or dragging it into an unrelated diff). Recorded here so the
 * gap is visible and counted instead of silently excused; the staleness test
 * below fails if an entry rots.
 */
const KNOWN_UNCLASSIFIED = new Set([
  // A dated decision doc that happens to ship a rendered companion PDF. Not a
  // deck family — a one-off, and decision docs are immutable once dated.
  'engineering/decisions/2026-05-12-kpi-candidates.md',
  // The logo specimen sheet under lib/base/_logo/. Its PDF is refreshed by hand
  // when the logo assets change, which is rare and not markdown-driven.
  'lib/base/_logo/logo.gallery.md',
  // The theme designer's palette audit. Rebuilt when a THEME changes, which is a
  // CSS edit — outside this hook's markdown-only scope by design.
  'themes/palette-audit.md',
]);

/** The `glob:` list on lefthook's pre-commit `pdf-rebuild` job. */
function hookGlobs() {
  const cfg = YAML.parse(fs.readFileSync(path.join(ROOT, 'lefthook.yml'), 'utf8'));
  const job = (cfg['pre-commit']?.jobs || []).find((j) => j.name === 'pdf-rebuild');
  assert.ok(job, 'lefthook.yml has no pre-commit job named "pdf-rebuild"');
  const globs = Array.isArray(job.glob) ? job.glob : [job.glob].filter(Boolean);
  assert.ok(globs.length, 'the pdf-rebuild job has no glob');
  return globs;
}

/** Every markdown file in the repo that ships a sibling committed PDF. */
function decksShippingPdfs() {
  const out = [];
  (function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === '.scratch') continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) { walk(p); continue; }
      if (!ent.name.endsWith('.md')) continue;
      // A deck "ships a PDF" if a sibling artifact exists under either the plain
      // name or the light/dark gallery pair.
      const stem = p.replace(/\.md$/, '');
      if (fs.existsSync(`${stem}.pdf`) || fs.existsSync(`${stem}.light.pdf`)) {
        out.push(path.relative(ROOT, p).split(path.sep).join('/'));
      }
    }
  })(ROOT);
  return out.sort();
}

describe('pre-commit PDF rebuild — glob and classifier agree', () => {
  const globs = hookGlobs();
  const isMatched = picomatch(globs);
  const decks = decksShippingPdfs();

  test('the repo actually has decks shipping committed PDFs (the walk works)', () => {
    // Guard against the sweep silently finding nothing and every assertion below
    // passing vacuously — the same "green while blind" failure this file exists for.
    assert.ok(decks.length > 50, `expected >50 decks shipping PDFs, found ${decks.length}`);
  });

  test('every deck that ships a committed PDF is reachable by the hook glob', () => {
    const unreachable = decks.filter((d) => classify(d) && !isMatched(d));
    assert.deepEqual(
      unreachable,
      [],
      `classify() handles these paths but the lefthook glob cannot reach them, so the\n` +
        `auto-rebuild never runs and their committed PDFs go stale:\n  ${unreachable.join('\n  ')}\n` +
        `Add the missing pattern to the pdf-rebuild glob in lefthook.yml.`,
    );
  });

  test('every deck that ships a committed PDF is understood by classify()', () => {
    const unclassified = decks.filter((d) => !classify(d)).filter((d) => !KNOWN_UNCLASSIFIED.has(d));
    assert.deepEqual(
      unclassified,
      [],
      `these markdown files ship a committed PDF but classify() returns null, so even\n` +
        `when the hook runs their PDF is never rebuilt:\n  ${unclassified.join('\n  ')}\n` +
        `Add a rule to classify(), or — if the PDF is genuinely built by another path —\n` +
        `add the file to KNOWN_UNCLASSIFIED with the reason.`,
    );
  });

  test('the KNOWN_UNCLASSIFIED list has not gone stale', () => {
    // An entry that no longer exists, or that classify() has since learned to
    // handle, is a lie in the ledger — fail so the list stays honest rather than
    // quietly excusing paths that are now covered.
    for (const p of KNOWN_UNCLASSIFIED) {
      assert.ok(fs.existsSync(path.join(ROOT, p)), `KNOWN_UNCLASSIFIED entry no longer exists: ${p}`);
      assert.equal(classify(p), null, `classify() now handles ${p} — remove it from KNOWN_UNCLASSIFIED`);
    }
  });

  test('the two known-missed families are covered', () => {
    // Regression pins for the exact paths that went stale. Belt and braces: the
    // sweeps above would catch these, but naming them documents the bug.
    for (const p of ['exemplars/corporate/board-update.md', 'examples/token-contrast/indaco.md']) {
      assert.ok(fs.existsSync(path.join(ROOT, p)), `fixture path vanished: ${p}`);
      assert.ok(isMatched(p), `lefthook pdf-rebuild glob no longer matches ${p}`);
      assert.ok(classify(p), `classify() no longer understands ${p}`);
    }
  });

  test('the glob does not sweep in prose that produces no PDF', () => {
    // examples/chart-theme-gallery/ holds a README plus PDFs built by an unrelated
    // path under different names — matching the glob is fine, but classify() must
    // not treat the README as a deck and try to render it.
    assert.equal(classify('examples/chart-theme-gallery/README.md'), null);
  });
});
