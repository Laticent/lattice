/**
 * Unit: tools/evidence-plan.js — the diff → real-surface plan the raise loop starts from
 * (engineering/workflow.md §The raise loop). Each case names a surface that must appear,
 * so a rule that stops firing turns this red.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { evidencePlan, format } = require(path.join(__dirname, '..', '..', '..', 'tools', 'evidence-plan.js'));

const surfaces = (files) => evidencePlan(files).steps.map((s) => s.surface);

test('every plan carries the gates and the unit tests', () => {
  const s = surfaces([]);
  assert.ok(s.includes('gates'));
  assert.ok(s.includes('unit tests for the changed files'));
  assert.equal(evidencePlan([]).ownerStop, false);
});

test('a docs-site change owes three widths, WebKit and Gecko, and screenshots', () => {
  const s = surfaces(['docs/src/components/ui/button.tsx']);
  assert.ok(s.some((x) => /Chromium at desktop, tablet and mobile/.test(x)));
  assert.ok(s.some((x) => /WebKit.*Gecko/.test(x)));
  assert.ok(s.some((x) => /screenshots at 1440, 820 and 390/.test(x)));
});

test('a docs/src/lib change owes screenshots too: it renders what the preview shows', () => {
  assert.ok(surfaces(['docs/src/playground/single-slide-render.ts']).some((x) => /screenshots at 1440/.test(x)));
  assert.ok(!surfaces(['docs/src/test/x.test.ts']).some((x) => /screenshots at 1440/.test(x)));
});

test('a theme CSS change owes the integration tier and a light/dark look, not the owner', () => {
  const plan = evidencePlan(['themes/indaco/indaco.css']);
  const s = plan.steps.map((x) => x.surface);
  assert.ok(s.some((x) => /PR render slice/.test(x)));
  assert.ok(s.some((x) => /light and dark/.test(x)));
  assert.equal(plan.ownerStop, false);
});

test('an export-pipeline change is the one owner stop', () => {
  assert.equal(evidencePlan(['lib/core/pdf-timestamps.js']).ownerStop, true);
  assert.equal(evidencePlan(['lib/export/x.js']).ownerStop, true);
  assert.equal(evidencePlan(['lattice.js']).ownerStop, true, 'the CLI calls page.pdf()');
  assert.equal(evidencePlan(['lib/core/print-sheet.mjs']).ownerStop, true, 'the @page CSS export uses');
  assert.ok(surfaces(['lattice.js']).some((x) => /PR render slice/.test(x)));
});

test('a path in the platform-suites registry plans an optional dispatch for that suite', () => {
  const step = evidencePlan(['lib/core/sanitize-slide-html.mjs']).steps.find((x) => x.kind === 'optional');
  assert.ok(step, 'an optional row');
  assert.match(step.command, /suites=.*ios-safari-studio/);
  assert.match(step.why, /UNVERIFIED/);
});

test('platform suites are dispatch-only: never a read row, never a required dispatch (owner, 2026-11-27)', () => {
  // file-confine.js is in export-confine's paths; before 2026-11-27 the PR run started it and the plan said "read the PR".
  const plan = evidencePlan(['lib/core/file-confine.js']);
  assert.ok(!plan.steps.some((x) => x.kind === 'read' || x.kind === 'dispatch'), 'no row the card waits on');
  const optional = plan.steps.find((x) => x.kind === 'optional');
  assert.ok(optional, 'export-confine is still offered as an optional dispatch');
  assert.match(optional.command, /export-confine/);
  assert.match(format(plan), /\[optional\] rows never set the card's grade/);
});

test('a component doc alone owes no render tier', () => {
  assert.ok(!surfaces(['lib/plugins/chart-family/kinds/bar/bar.docs.md']).some((x) => /PR render slice/.test(x)));
});

test('the render slice follows ci.yml\'s code filter, since PR CI no longer runs it (D2)', () => {
  const owes = (f) => surfaces([f]).some((x) => /PR render slice/.test(x));
  for (const f of ['tools/build.js', 'test/integration/export/export-formats.test.js', 'examples/x.md', 'exemplars/a/b.md', 'kit/Sample-Deck.md', 'package-lock.json', '.github/workflows/ci.yml', 'assets/fonts/x.woff2', 'lib/runtime/index.js']) {
    assert.ok(owes(f), `${f} reaches the render slice in CI, so the plan owes it locally`);
  }
  for (const f of ['docs/src/pages/index.astro', 'engineering/workflow.md', 'lib/components/anchor/x/x.docs.md', '.github/workflows/docs.yml']) {
    assert.ok(!owes(f), `${f} never ran the render slice in CI`);
  }
});
