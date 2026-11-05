/**
 * Unit: tools/evidence-plan.js — the diff → real-surface plan the raise loop starts from
 * (engineering/workflow.md §The raise loop). Each case names a surface that must appear,
 * so a rule that stops firing turns this red.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { evidencePlan } = require(path.join(__dirname, '..', '..', '..', 'tools', 'evidence-plan.js'));

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
  assert.ok(s.some((x) => /integration tier/.test(x)));
  assert.ok(s.some((x) => /light and dark/.test(x)));
  assert.equal(plan.ownerStop, false);
});

test('an export-pipeline change is the one owner stop', () => {
  assert.equal(evidencePlan(['lib/core/pdf-timestamps.js']).ownerStop, true);
  assert.equal(evidencePlan(['lib/export/x.js']).ownerStop, true);
  assert.equal(evidencePlan(['lattice.js']).ownerStop, true, 'the CLI calls page.pdf()');
  assert.equal(evidencePlan(['lib/core/print-sheet.mjs']).ownerStop, true, 'the @page CSS export uses');
  assert.ok(surfaces(['lattice.js']).some((x) => /integration tier/.test(x)));
});

test('a path in the platform-suites registry plans a dispatch for that suite', () => {
  const step = evidencePlan(['lib/core/sanitize-slide-html.mjs']).steps.find((x) => x.kind === 'dispatch');
  assert.ok(step, 'a dispatch row');
  assert.match(step.command, /suites=.*ios-safari-studio/);
});

test('a suite the PR run already starts is read from the PR, never dispatched again', () => {
  // file-confine.js is in export-confine's paths, and export-confine runs on pull requests: the PR run starts it.
  const plan = evidencePlan(['lib/core/file-confine.js']);
  const read = plan.steps.find((x) => x.kind === 'read');
  assert.ok(read, 'a read row for the PR run');
  assert.match(read.surface, /export-confine/);
  const dispatch = plan.steps.find((x) => x.kind === 'dispatch');
  assert.ok(!dispatch || !/export-confine/.test(dispatch.command), 'export-confine is not dispatched a second time');
});

test('a suite off pull requests is dispatched, and only that one', () => {
  // sanitize-slide-html.mjs reaches ios-safari-studio, which never runs on a pull request.
  const plan = evidencePlan(['lib/core/sanitize-slide-html.mjs']);
  const dispatch = plan.steps.find((x) => x.kind === 'dispatch');
  for (const name of dispatch.command.replace(/.*suites=/, '').split(',')) assert.match(name, /^ios-safari-/, `${name} is dispatched though the PR run starts it`);
});

test('a component doc alone owes no render tier', () => {
  assert.ok(!surfaces(['lib/plugins/chart-family/kinds/bar/bar.docs.md']).some((x) => /integration tier/.test(x)));
});
