/**
 * The pre-commit PDF auto-rebuild has TWO independent filters, and they must
 * agree: lefthook's `pdf-rebuild` glob decides whether the job runs at all, and
 * `classify()` in tools/build-staged-pdfs.js decides what it rebuilds once it
 * has. A path that `classify()` understands but the glob cannot reach is a
 * SILENTLY DEAD GATE — the hook simply never fires, nothing fails, and the
 * committed PDF drifts away from its markdown.
 *
 * That is not hypothetical, and it has now bitten TWICE.
 *
 * FIRST: `classify()` handled `exemplars/<sector>/<name>.md` from the day it was
 * written, but the glob never listed `exemplars/**`. A commit touching only
 * exemplar markdown never started the job, so 45 worked decks that each ship a
 * committed PDF had no auto-rebuild at all — and 14 went stale in one branch,
 * the committed PDF still showing KPI rows the markdown no longer contained.
 *
 * SECOND, while fixing the first: the glob was widened to `examples/**‍/*.md`,
 * which in lefthook v2.1.6 requires AT LEAST ONE intervening directory. That
 * matches `examples/token-contrast/indaco.md` and NOT `examples/pricing.md`, so
 * the fix silently dropped all 108 top-level example decks — trading 59 covered
 * decks for 109 dropped ones. The first version of THIS FILE passed anyway,
 * because it emulated the hook with `picomatch`, which matches zero directories
 * for `**‍/` and cheerfully calls the broken pattern fine.
 *
 * So this test drives the REAL lefthook binary against a throwaway repo (HARD
 * RULE #23 — a claim about lefthook's filter needs an artifact from lefthook, not
 * from a stand-in library), and walks the REAL repo for the paths to check, so a
 * new deck family that ships a committed PDF is covered the moment it lands.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const YAML = require('yaml');

const { classify } = require('../../../tools/build-staged-pdfs.js');

const ROOT = path.join(__dirname, '..', '..', '..');

/**
 * Markdown that ships a committed PDF which `classify()` deliberately does NOT
 * handle. Each is a PRE-EXISTING gap, none on the path of the change that added
 * this test (HARD RULE #18 — log an off-path defect rather than ignoring it or
 * dragging it into an unrelated diff). Recorded so the gap is visible and counted
 * instead of silently excused; the staleness test below fails if an entry rots.
 *
 * These reasons are deliberately literal about what does and does not exist. An
 * earlier draft claimed palette-audit was "rebuilt when a theme changes" — no such
 * builder exists anywhere in the repo, and an inaccurate entry costs the whole
 * ledger its credibility.
 */
const KNOWN_UNCLASSIFIED = new Set([
  // A dated decision doc that ships a rendered companion PDF. A one-off, not a
  // deck family; dated decision notes are not edited after the fact.
  'engineering/decisions/2026-05-12-kpi-candidates.md',
  // The logo specimen sheet. NO builder exists for it (nothing in tools/,
  // package.json or .github/workflows references it) — it is refreshed by hand
  // when the logo assets change. Editing its markdown DOES leave the PDF stale.
  'lib/base/_logo/logo.gallery.md',
  // The theme designer's palette audit. NO builder exists for it either; it is
  // excluded from tools/preview.js ALL_DECKS by name and rebuilt by hand. Editing
  // its markdown likewise leaves the committed PDF stale. A real gap, logged.
  'themes/palette-audit.md',
  // The Marp kit's sample deck. Deliberately NOT classifiable: its committed PDF
  // is rendered by real marp-cli against dist/marp-kit — the surface a recipient
  // actually uses — not by Lattice's own renderer. Rebuilding it through the
  // normal path would quietly replace the artifact with one produced by a
  // DIFFERENT engine, which is exactly the comparison the PDF exists to make. It
  // is refreshed by rendering the kit; see tools/build-marp-kit.js.
  'kit/Sample-Deck.md',
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

/** The pinned lefthook binary, or null when it cannot be found. */
function lefthookBin() {
  for (const p of [
    path.join(ROOT, 'node_modules', 'lefthook-linux-x64', 'bin', 'lefthook'),
    path.join(ROOT, 'node_modules', '.bin', 'lefthook'),
  ]) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Ask the REAL lefthook whether the pdf-rebuild glob fires for each given path.
 * One throwaway repo, one staged file per path, the production glob list verbatim.
 * Returns a Map path → boolean.
 */
function lefthookFires(bin, globs, paths) {
  const out = new Map();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-glob-'));
  try {
    const cfg = { 'pre-commit': { jobs: [{ name: 'pdf-rebuild', glob: globs, run: 'echo JOB-FIRED' }] } };
    for (const rel of paths) {
      // A fresh index per path: a single staged file is the only way to attribute
      // a fire to THAT path rather than to some sibling that also matched.
      fs.rmSync(path.join(tmp, '.git'), { recursive: true, force: true });
      spawnSync('git', ['init', '-q', '.'], { cwd: tmp });
      spawnSync('git', ['config', 'user.email', 't@t'], { cwd: tmp });
      spawnSync('git', ['config', 'user.name', 't'], { cwd: tmp });
      fs.writeFileSync(path.join(tmp, 'lefthook.yml'), YAML.stringify(cfg));
      const f = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, 'probe\n');
      spawnSync('git', ['add', rel], { cwd: tmp });
      const r = spawnSync(bin, ['run', 'pre-commit'], { cwd: tmp, encoding: 'utf8' });
      out.set(rel, `${r.stdout || ''}${r.stderr || ''}`.includes('JOB-FIRED'));
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return out;
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
      // A deck "ships a PDF" if a sibling artifact exists under the plain name or
      // either half of the light/dark gallery pair. `.dark.pdf` is probed too — a
      // deck shipping only a dark artifact would otherwise be invisible here.
      const stem = p.replace(/\.md$/, '');
      if (fs.existsSync(`${stem}.pdf`) || fs.existsSync(`${stem}.light.pdf`) || fs.existsSync(`${stem}.dark.pdf`)) {
        out.push(path.relative(ROOT, p).split(path.sep).join('/'));
      }
    }
  })(ROOT);
  return out.sort();
}

describe('pre-commit PDF rebuild — glob and classifier agree', () => {
  const globs = hookGlobs();
  const decks = decksShippingPdfs();
  const bin = lefthookBin();

  test('the repo actually has decks shipping committed PDFs (the walk works)', () => {
    // Guard against the sweep silently finding nothing and every assertion below
    // passing vacuously — the same "green while blind" failure this file exists for.
    assert.ok(decks.length > 50, `expected >50 decks shipping PDFs, found ${decks.length}`);
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

  test('the glob does not sweep in prose that produces no PDF', () => {
    // examples/chart-theme-gallery/ holds a README plus PDFs built by an unrelated
    // path under different names. The leading-lowercase stem in the subdirectory
    // rule is what keeps README.md out.
    assert.equal(classify('examples/chart-theme-gallery/README.md'), null);
  });

  // ── The real-surface half: does LEFTHOOK actually reach these paths? ──
  // Every deck classify() understands must also start the job. One representative
  // path per shape rather than all 247 — each probe spawns git + lefthook, and the
  // shapes (top-level vs nested, per root) are what the matcher distinguishes.
  describe('lefthook itself reaches every shape classify() handles', () => {
    if (!bin) {
      test('lefthook binary present', () => {
        assert.fail('no lefthook binary under node_modules — cannot verify the real matcher. ' +
          'Run `npm install`; do NOT substitute a glob library, picomatch disagrees with lefthook on `**/`.');
      });
      return;
    }

    // One per distinct shape, each a path classify() returns a job for. Top-level
    // AND nested are BOTH pinned per root: that pair is exactly what `**/` breaks.
    const SHAPES = [
      'examples/pricing.md',
      'examples/token-contrast/indaco.md',
      'exemplars/corporate/board-update.md',
      'design/design-system.gallery.md',
      'test/integration/baseline-decks/gallery.md',
      'lib/components/evidence/kpi/kpi.gallery.md',
      'lib/components/connect/connect.gallery.md',
    ];

    const fires = lefthookFires(bin, globs, SHAPES);
    for (const p of SHAPES) {
      test(`lefthook fires for ${p}`, () => {
        assert.ok(classify(p), `precondition: classify() should handle ${p}`);
        assert.equal(
          fires.get(p), true,
          `the pdf-rebuild glob does NOT match ${p} under the real lefthook, so committing\n` +
            `only that file never starts the job and its PDF silently goes stale.\n` +
            `NOTE: lefthook's \`**/\` requires at least one directory — keep BOTH \`dir/*.md\`\n` +
            `and \`dir/**/*.md\` in the glob list.`,
        );
      });
    }
  });
});
