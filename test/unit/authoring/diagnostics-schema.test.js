// spec/diagnostics.schema.json is the Diagnostic Protocol 1.0's finding and report (spec/diagnostics.md §1, §1.1).
// The reference CLI's --json output must validate against it, on decks that raise front-matter, slide and renamed-key
// findings. Failing arms: a finding with no `message`, a front-matter finding on `slide: 1` in the code (the 1.0 fix),
// and a report with no `coverage` each fail.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Ajv = require('ajv/dist/2020');

const ROOT = path.join(__dirname, '../../..');
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'spec/diagnostics.schema.json'), 'utf8'));
const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);

function lintJson(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diag-schema-'));
  try {
    const file = path.join(dir, 'deck.md');
    fs.writeFileSync(file, source);
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/lint-deck.js'), '--json', file], { encoding: 'utf8' });
    return JSON.parse(r.stdout);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const DECK = [
  '---',
  'paginate: true',
  'finsh: halo',
  'pagination: skip',
  '---',
  '',
  '<!-- @meta{layout=cards-grid} -->',
  '',
  '## Bets',
  '',
  '- **Expand EU.** Two markets live by Q4.',
  '',
].join('\n');

test('the reference CLI report validates, and front-matter findings sit on slide 0', () => {
  const report = lintJson(DECK);
  assert.ok(validate(report), JSON.stringify(validate.errors, null, 2));
  assert.equal(report.version, '1.0');
  // §1.1: a tier the run left out is listed. The fit checks need a browser, so a JSON report always names them.
  assert.deepEqual(report.coverage.skipped.map((x) => x.tier), ['fit']);
  const all = [...report.findings, ...report.reviewFindings];
  const rules = all.map((f) => f.rule);
  for (const r of ['key-renamed', 'unknown-key', 'pagination-unsupported-value']) assert.ok(rules.includes(r), `${r} in ${rules}`);
  for (const f of all.filter((x) => ['key-renamed', 'unknown-key', 'pagination-unsupported-value'].includes(x.rule))) {
    assert.equal(f.slide, 0, `${f.rule} on slide ${f.slide}`);
  }
  const renamed = report.findings.find((f) => f.rule === 'key-renamed');
  assert.deepEqual(renamed.replacement, { from: 'paginate', to: 'pagination' });
});

test('--no-review lists the review tier in coverage.skipped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diag-skip-'));
  try {
    const file = path.join(dir, 'deck.md');
    fs.writeFileSync(file, DECK);
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/lint-deck.js'), '--json', '--no-review', file], { encoding: 'utf8' });
    const report = JSON.parse(r.stdout);
    assert.ok(validate(report), JSON.stringify(validate.errors));
    assert.deepEqual(report.coverage.skipped.map((x) => x.tier).sort(), ['fit', 'review']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the schema refuses a finding with no message and a report with no coverage', () => {
  const ok = { version: '1.0', scope: { files: ['d.md'], slides: 'all' }, coverage: { profiles: ['core'] }, findings: [] };
  assert.ok(validate(ok));
  assert.equal(validate({ ...ok, coverage: undefined }), false);
  assert.equal(validate({ ...ok, findings: [{ slide: 0, rule: 'x', severity: 'error' }] }), false);
  assert.equal(validate({ ...ok, findings: [{ slide: 0, rule: 'Acme/X', severity: 'error', message: 'm' }] }), false);
  assert.ok(validate({ ...ok, findings: [{ slide: 0, rule: 'acme/x', severity: 'error', message: 'm', 'acme.score': 3 }] }));
});
