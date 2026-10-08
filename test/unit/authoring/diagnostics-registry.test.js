/**
 * The Diagnostic Protocol's rule registry (spec/diagnostics.md §3) against the code that emits
 * the rules.
 *
 * Why this file exists: the spec called its registry "frozen" and listed 13 rule IDs, while the
 * reference implementation emitted 177. Nothing compared the two, so every new rule landed in
 * code with tests of its own and the spec quietly fell behind
 * (engineering/decisions/2026-10-08-spec-audit.md §4.1). This test is the comparison. It fails
 * when the code emits a rule ID the registry does not list, when the registry lists one the code
 * no longer emits, when a run-time family (`unknown-${key}`) has no `<…>` row, or when a finding
 * uses a severity §2 does not define.
 *
 * HOW IT READS THE CODE: statically, from the three shapes the emitters use —
 *   - an object literal `rule: 'id'` (lint-core, review-core, the CLI),
 *   - `diag('severity', 'id', …)` (lib/core/flowchart-grammar.js),
 *   - `add('id', 'severity', …)` (lib/core/hub-spoke-model.js),
 * plus template IDs written `rule: \`…${…}…\`` or `` `verbose-${…}` ``, which are families.
 *
 * COVERAGE BOUNDARY, stated plainly: an ID assembled any other way (a variable passed as
 * `rule`, a string built by concatenation) is invisible to this scan. Every emitter in
 * EMITTERS uses one of the shapes above today; a new emitter file must be added to EMITTERS,
 * and a new shape needs a new pattern here. Running the linter over decks instead would see
 * only the rules a deck happens to trip: the 265 example decks trip 7 of 177.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const SPEC = path.join(ROOT, 'spec', 'diagnostics.md');

/** Every file that emits findings in the protocol's shape. */
const EMITTERS = [
  'lib/authoring/lint-core.js',
  'lib/authoring/review-core.js',
  'lib/core/flowchart-grammar.js',
  'lib/core/hub-spoke-model.js',
  'tools/lint-deck.js',
];

const SEVERITIES = ['error', 'warning', 'info', 'suggestion'];

/** §3's rows: literal IDs, and families (an ID containing `<…>`) as regexes. PURE. */
function parseRegistry(md) {
  const start = md.indexOf('## 3. ');
  const end = md.indexOf('\n## 4. ', start);
  assert.ok(start >= 0 && end > start, 'spec/diagnostics.md has no §3 … §4 span');
  const literal = new Set();
  const families = [];
  for (const m of md.slice(start, end).matchAll(/^\| `([^`]+)` \| ([a-z /]+) \|/gm)) {
    const [, id, sev] = m;
    for (const s of sev.split('/').map((x) => x.trim())) {
      assert.ok(SEVERITIES.includes(s), `§3 row \`${id}\` names severity '${s}', which §2 does not define`);
    }
    if (id.includes('<')) {
      const pattern = id.split(/<[^>]+>/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9-]+');
      families.push({ id, re: new RegExp(`^${pattern}$`) });
    } else {
      assert.ok(!literal.has(id), `§3 lists \`${id}\` twice`);
      literal.add(id);
    }
  }
  return { literal, families };
}

/** The IDs, templates and severities a source file emits, by the shapes above. PURE. */
function emitted(source) {
  const ids = new Set();
  const templates = new Set();
  const severities = new Set();
  for (const m of source.matchAll(/rule:\s*'([a-z0-9-]+)'/g)) ids.add(m[1]);
  for (const m of source.matchAll(/\bdiag\(\s*'([a-z]+)',\s*'([a-z0-9-]+)'/g)) {
    severities.add(m[1]);
    ids.add(m[2]);
  }
  for (const m of source.matchAll(/\badd\(\s*'([a-z0-9-]+)',\s*'([a-z]+)'/g)) {
    ids.add(m[1]);
    severities.add(m[2]);
  }
  for (const m of source.matchAll(/\brule:\s*`([^`]*\$\{[^`]*)`/g)) templates.add(m[1]);
  for (const m of source.matchAll(/`([a-z0-9-]*-\$\{[^}]+\}|\$\{[^}]+\}-[a-z0-9-]*)`/g)) {
    // A bare template like `verbose-${ov.kind}` counts only when it sits in a `rule` assignment.
    const before = source.slice(Math.max(0, m.index - 60), m.index);
    if (/\brule\b[^;\n]*$/.test(before)) templates.add(m[1]);
  }
  for (const m of source.matchAll(/severity:\s*(?:[^,\n]*\?\s*)?'([a-z]+)'(?:\s*:\s*'([a-z]+)')?/g)) {
    severities.add(m[1]);
    if (m[2]) severities.add(m[2]);
  }
  return { ids, templates, severities };
}

/** A template's shape as a sample ID, so a family row can be matched against it. PURE. */
const sampleOf = (template) => template.replace(/\$\{[^}]+\}/g, 'x');

/** Everything that disagrees between a registry and what the code emits. PURE. */
function drift(registry, code) {
  const out = [];
  for (const id of [...code.ids].sort()) {
    if (!registry.literal.has(id)) out.push(`emitted but not registered: ${id}`);
  }
  for (const id of [...registry.literal].sort()) {
    if (!code.ids.has(id)) out.push(`registered but never emitted: ${id}`);
  }
  for (const t of [...code.templates].sort()) {
    if (!registry.families.some((f) => f.re.test(sampleOf(t)))) out.push(`a run-time family with no <…> row: ${t}`);
  }
  for (const f of registry.families) {
    if (![...code.templates].some((t) => f.re.test(sampleOf(t)))) out.push(`a family row nothing generates: ${f.id}`);
  }
  for (const s of [...code.severities].sort()) {
    if (!SEVERITIES.includes(s)) out.push(`a severity §2 does not define: ${s}`);
  }
  return out;
}

function readCode() {
  const code = { ids: new Set(), templates: new Set(), severities: new Set() };
  for (const rel of EMITTERS) {
    const e = emitted(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    for (const k of Object.keys(code)) for (const v of e[k]) code[k].add(v);
  }
  return code;
}

describe('the Diagnostic Protocol registry (spec/diagnostics.md §3)', () => {
  const registry = parseRegistry(fs.readFileSync(SPEC, 'utf8'));
  const code = readCode();

  test('lists every rule ID the code emits, and only those', () => {
    assert.deepEqual(drift(registry, code), []);
  });

  test('the scan sees all three emitter shapes, so an empty match cannot pass', () => {
    // A pattern that silently stopped matching would make the drift check vacuous. Each shape
    // has at least one rule known to use it.
    assert.ok(code.ids.has('card-style-inline-title'), 'the object-literal shape found nothing');
    assert.ok(code.ids.has('flowchart-missing-target'), 'the diag() shape found nothing');
    assert.ok(code.ids.has('hub-spoke-crowded'), 'the add() shape found nothing');
    assert.ok(code.templates.size >= 3, `expected the three families, found ${[...code.templates].join(', ')}`);
    assert.ok(code.ids.size >= 177, `expected at least 177 IDs, the count when this test landed; found ${code.ids.size}`);
  });

  test('fails when a registry row is removed (failing arm)', () => {
    const missing = { literal: new Set(registry.literal), families: registry.families };
    missing.literal.delete('unknown-finish');
    assert.deepEqual(drift(missing, code), ['emitted but not registered: unknown-finish']);
  });

  test('fails when the registry lists an ID the code does not emit (failing arm)', () => {
    const stale = { literal: new Set([...registry.literal, 'no-such-rule']), families: registry.families };
    assert.deepEqual(drift(stale, code), ['registered but never emitted: no-such-rule']);
  });

  test('fails when a run-time family loses its row (failing arm)', () => {
    const noFamily = { literal: registry.literal, families: registry.families.filter((f) => !f.id.startsWith('verbose-')) };
    assert.deepEqual(drift(noFamily, code), ['a run-time family with no <…> row: verbose-${ov.kind}']);
  });

  test('fails on a severity §2 does not define (failing arm)', () => {
    const e = emitted("findings.push({ rule: 'x', severity: 'hint' });");
    assert.ok(e.severities.has('hint'));
    assert.deepEqual(drift({ literal: new Set(['x']), families: [] }, e), ['a severity §2 does not define: hint']);
  });
});
