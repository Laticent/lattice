/**
 * Unit: every stylesheet dist/ ships is MARP-SCOPABLE.
 *
 * Marpit-family scopers (marp-core, and our own port in lib/engine/css.js) key on
 * a selector's leftmost compound: a literal leading `section` IS the slide,
 * anything else becomes a slide DESCENDANT. A rule that LEADS with
 * `:is(section.x, figure.x)` therefore scopes to a slide-inside-a-slide and
 * matches nothing.
 *
 * This is the guard that would have caught the second half of #1256. That change
 * applied the distribution at EXPORT time only, so the bundle was fixed while the
 * manual marp-vscode recipe — `markdown.marp.themes` pointed straight at
 * dist/lattice.css, which is what the repo's own .vscode/settings.json does — was
 * not: 617 chart rules stayed dead, every non-chart component worked, and the
 * symptom read as "only the charts are broken." The distribution now runs in
 * tools/build-css.js, and this test pins the shipped result rather than the
 * intermediate.
 *
 * Note the assertion is on the ARTIFACT, not on the source. Authors keep writing
 * the readable dual-surface `:is(section.x, figure.x)` head in
 * lib/components/**.styles.css — that is the point of doing it at build time.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', '..', '..', 'dist');

/** A rule whose FIRST compound is `:is(…)` containing a slide-root target. */
const LEADING_IS_SECTION = /(^|[{};])\s*:is\([^)]*\b(?:section|figure)\b[^)]*\)/g;

function shippedStylesheets() {
  const files = ['lattice.css', 'lattice.min.css', 'lattice-default.css', 'lattice-default.min.css']
    .map((f) => path.join(DIST, f))
    .filter((p) => fs.existsSync(p));
  const themes = path.join(DIST, 'themes');
  if (fs.existsSync(themes)) {
    for (const f of fs.readdirSync(themes)) {
      if (f.endsWith('.css')) files.push(path.join(themes, f));
    }
  }
  return files;
}

describe('shipped CSS is marp-scopable', () => {
  test('the dist stylesheets exist to be checked at all', () => {
    const files = shippedStylesheets();
    assert.ok(files.length >= 5, `expected the dist stylesheets; found ${files.length} (run npm run build)`);
    assert.ok(files.some((f) => f.endsWith('lattice.css')), 'dist/lattice.css is present');
  });

  test('no shipped rule LEADS with :is(section…) / :is(figure…)', () => {
    const offenders = [];
    for (const file of shippedStylesheets()) {
      const css = fs.readFileSync(file, 'utf8');
      // Comments legitimately DISCUSS the pattern — strip them before scanning,
      // the same way the distribution itself skips them.
      const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
      const hits = code.match(LEADING_IS_SECTION) || [];
      if (hits.length) offenders.push(`${path.relative(DIST, file)}: ${hits.length} (e.g. ${hits[0].trim()})`);
    }
    assert.deepEqual(offenders, [],
      'these rules would match nothing on any Marp surface — the build-time '
      + 'distribution in tools/build-css.js should have expanded them');
  });

  test('the chart bucket — the components that use the dual-surface head — is really covered', () => {
    // Guards against a vacuous pass if the head were renamed or the bucket moved:
    // the distributed form MUST be present for these, since their source uses it.
    const css = fs.readFileSync(path.join(DIST, 'lattice.css'), 'utf8');
    for (const name of ['matrix-grid', 'roadmap', 'gantt', 'kanban', 'radar', 'quadrant']) {
      assert.match(css, new RegExp(`section\\.${name}\\b`),
        `${name} should appear as a literal leading section compound`);
    }
  });
});
