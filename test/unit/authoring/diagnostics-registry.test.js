/**
 * The Diagnostic Protocol's rule registry (spec/diagnostics.md §3) against the code that emits
 * the rules.
 *
 * Why this file exists: the spec called its registry "frozen" and listed 13 rule IDs, while the
 * reference implementation emitted 178. Nothing compared the two, so every new rule landed in
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
 * only the rules a deck happens to trip: the 265 example decks trip 7 of 178.
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

/** §3's rows: each ID with its severities and its autofix mark; families (`<…>`) as regexes. PURE. */
function parseRegistry(md) {
  const start = md.indexOf('## 3. ');
  const end = md.indexOf('\n## 4. ', start);
  assert.ok(start >= 0 && end > start, 'spec/diagnostics.md has no §3 … §4 span');
  const rows = new Map();
  const families = [];
  for (const m of md.slice(start, end).matchAll(/^\| `([^`]+)` \| ([a-z /]+) \| (✓|—) \|/gm)) {
    const [, id, sev, fix] = m;
    const severities = new Set(sev.split('/').map((x) => x.trim()));
    for (const s of severities) assert.ok(SEVERITIES.includes(s), `§3 row \`${id}\` names severity '${s}', which §2 does not define`);
    if (id.includes('<')) {
      // A placeholder stands for one hyphen-free word (`spark`, `icon`, `eyebrow`), so a
      // template with a fixed suffix (`unknown-${key}-value`) cannot pass as a family member.
      const pattern = id.split(/<[^>]+>/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9]+');
      families.push({ id, re: new RegExp(`^${pattern}$`), severities, autofix: fix === '✓' });
    } else {
      assert.ok(!rows.has(id), `§3 lists \`${id}\` twice`);
      rows.set(id, { severities, autofix: fix === '✓' });
    }
  }
  return { rows, families };
}

/**
 * Comments out of the way, so a rule ID quoted in a comment is not read as an emission. Block
 * comments go whole; a line comment goes only when it starts the line, because `//` also opens
 * every URL inside a message string.
 */
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/^\s*\/\/.*$/gm, '');

/** The object literal around `index`: from its `{` to the matching `}`. PURE. */
function objectAround(source, index) {
  let depth = 0;
  let open = index;
  for (; open >= 0; open--) {
    if (source[open] === '}') depth++;
    else if (source[open] === '{') { if (depth === 0) break; depth--; }
  }
  depth = 0;
  let close = open;
  for (; close < source.length; close++) {
    if (source[close] === '{') depth++;
    else if (source[close] === '}' && --depth === 0) break;
  }
  return { body: source.slice(open, close + 1), open };
}

/** The severities an expression can produce: quoted words, plus those of a local helper it calls. */
function severitiesOf(expr, source) {
  const out = new Set([...expr.matchAll(/['"](error|warning|info|suggestion|[a-z]+)['"]/g)].map((m) => m[1]));
  for (const call of expr.matchAll(/\b([A-Za-z_]\w*)\(/g)) {
    const def = source.match(new RegExp(`(?:const|function)\\s+${call[1]}\\b[^\\n]*`));
    if (def) for (const m of def[0].matchAll(/'(error|warning|info|suggestion)'/g)) out.add(m[1]);
  }
  return out;
}

/**
 * Where a rule ID arrives through a variable rather than a literal, which the scan cannot read.
 * Each entry says where the ID really comes from; the test fails on any variable `rule` not
 * listed here, and on an entry that no longer matches anything.
 */
const SANCTIONED_RULE_PASSTHROUGHS = [
  { file: 'lib/authoring/lint-core.js', expr: 'd.rule', why: 'the flowchart kernel\'s diagnostics, scanned in lib/core/flowchart-grammar.js' },
  { file: 'lib/authoring/lint-core.js', expr: 'f.rule', why: 'the hub-spoke kernel\'s findings, scanned in lib/core/hub-spoke-model.js' },
  { file: 'lib/authoring/review-core.js', expr: 'rule', why: '`verbose-*`, built two lines above from a literal and a template the scan reads' },
  { file: 'lib/core/flowchart-grammar.js', expr: 'rule', why: 'the body of `diag()`, whose call sites the scan reads' },
  { file: 'lib/core/hub-spoke-model.js', expr: 'rule', why: 'the body of `add()`, whose call sites the scan reads' },
];

/**
 * Whether a finding object can carry an autofix: it says `autofixable: true` itself, it is wrapped
 * in `withTokenSuggestion(…)`, or it is bound to a name (`const finding = {…}`) that is later
 * spread with `autofixable: true` or passed to `withTokenSuggestion`.
 */
function autofixOf(src, body, open) {
  if (/\bautofixable:\s*(true|!!)/.test(body)) return true;
  const before = src.slice(Math.max(0, open - 60), open);
  if (/withTokenSuggestion\(\s*$/.test(before)) return true;
  const bound = before.match(/(?:const|let)\s+(\w+)\s*=\s*$/);
  if (!bound) return false;
  const after = src.slice(open + body.length, open + body.length + 1200);
  return new RegExp(`withTokenSuggestion\\(\\s*${bound[1]}\\b|\\.\\.\\.${bound[1]},[^}]*autofixable:\\s*true`).test(after);
}

/** What a source file emits: per-ID severities and autofix, family templates, unread `rule` sites. PURE. */
function emitted(source) {
  const src = stripComments(source);
  const ids = new Map();
  const note = (id, severities, autofix) => {
    const r = ids.get(id) || { severities: new Set(), autofix: false };
    for (const s of severities) r.severities.add(s);
    r.autofix = r.autofix || autofix;
    ids.set(id, r);
  };
  for (const m of src.matchAll(/\brule:\s*(['"])([a-z0-9-]+)\1/g)) {
    const { body, open } = objectAround(src, m.index);
    const sev = body.match(/\bseverity:\s*([^,\n}]+(?:\?[^,\n}]+)?)/);
    note(m[2], sev ? severitiesOf(sev[1], src) : [], autofixOf(src, body, open));
  }
  for (const m of src.matchAll(/\bdiag\(\s*'([a-z]+)',\s*'([a-z0-9-]+)'/g)) note(m[2], [m[1]], false);
  for (const m of src.matchAll(/\badd\(\s*'([a-z0-9-]+)',\s*'([a-z]+)'/g)) note(m[1], [m[2]], false);
  const templates = new Map();
  const noteTemplate = (t, index) => {
    const { body, open } = objectAround(src, index);
    const sev = body.match(/\bseverity:\s*([^,\n}]+)/);
    const autofix = autofixOf(src, body, open);
    const r = templates.get(t) || { severities: new Set(), autofix: false };
    if (sev) for (const s of severitiesOf(sev[1], src)) r.severities.add(s);
    r.autofix = r.autofix || autofix;
    templates.set(t, r);
  };
  for (const m of src.matchAll(/\brule:\s*`([^`]*\$\{[^`]*)`/g)) noteTemplate(m[1], m.index);
  for (const m of src.matchAll(/\bconst rule = [^;]*`([a-z0-9-]*\$\{[^}]+\}[a-z0-9-]*)`/g)) {
    // `const rule = … ? 'literal' : \`family-${…}\``, then `{ rule, … }` below it.
    const use = src.indexOf('rule, severity', m.index);
    noteTemplate(m[1], use > 0 ? use : m.index);
    for (const lit of m[0].matchAll(/'([a-z0-9-]+)'/g)) if (!SEVERITIES.includes(lit[1])) note(lit[1], ['suggestion'], false);
  }
  const unread = [];
  for (const m of src.matchAll(/\brule:\s*(?!['"`])([A-Za-z_][\w.]*)/g)) unread.push(m[1]);
  for (const _ of src.matchAll(/[{,]\s*rule\s*(?=[,}])/g)) unread.push('rule');
  return { ids, templates, unread };
}

/** A template's shape as a sample ID, so a family row can be matched against it. PURE. */
const sampleOf = (template) => template.replace(/\$\{[^}]+\}/g, 'x');

const fmt = (set) => [...set].sort().join(' / ') || '(none read)';

/** Everything that disagrees between a registry and what the code emits. PURE. */
function drift(registry, code) {
  const out = [];
  for (const [id, e] of [...code.ids].sort()) {
    const row = registry.rows.get(id);
    if (!row) { out.push(`emitted but not registered: ${id}`); continue; }
    if (e.severities.size && fmt(e.severities) !== fmt(row.severities)) out.push(`severity of ${id}: the code emits ${fmt(e.severities)}, §3 says ${fmt(row.severities)}`);
    if (e.autofix !== row.autofix) out.push(`autofix of ${id}: the code ${e.autofix ? 'can' : 'cannot'} autofix, §3 says ${row.autofix ? '✓' : '—'}`);
  }
  for (const id of [...registry.rows.keys()].sort()) {
    if (!code.ids.has(id)) out.push(`registered but never emitted: ${id}`);
  }
  for (const [t, e] of [...code.templates].sort()) {
    const fam = registry.families.find((f) => f.re.test(sampleOf(t)));
    if (!fam) { out.push(`a run-time family with no <…> row: ${t}`); continue; }
    if (e.severities.size && fmt(e.severities) !== fmt(fam.severities)) out.push(`severity of ${fam.id}: the code emits ${fmt(e.severities)}, §3 says ${fmt(fam.severities)}`);
    if (e.autofix !== fam.autofix) out.push(`autofix of ${fam.id}: the code ${e.autofix ? 'can' : 'cannot'} autofix, §3 says ${fam.autofix ? '✓' : '—'}`);
  }
  for (const f of registry.families) {
    if (![...code.templates.keys()].some((t) => f.re.test(sampleOf(t)))) out.push(`a family row nothing generates: ${f.id}`);
  }
  for (const [id, e] of code.ids) {
    for (const s of e.severities) if (!SEVERITIES.includes(s)) out.push(`a severity §2 does not define: ${s} (${id})`);
  }
  return out;
}

function readCode() {
  const code = { ids: new Map(), templates: new Map(), unread: [] };
  for (const rel of EMITTERS) {
    const e = emitted(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    for (const [id, v] of e.ids) {
      const r = code.ids.get(id) || { severities: new Set(), autofix: false };
      for (const s of v.severities) r.severities.add(s);
      r.autofix = r.autofix || v.autofix;
      code.ids.set(id, r);
    }
    for (const [t, v] of e.templates) code.templates.set(t, v);
    for (const expr of e.unread) code.unread.push({ file: rel, expr });
  }
  return code;
}

describe('the Diagnostic Protocol registry (spec/diagnostics.md §3)', () => {
  const registry = parseRegistry(fs.readFileSync(SPEC, 'utf8'));
  const code = readCode();

  test('lists every rule ID the code emits, and only those, with the right severity and autofix', () => {
    assert.deepEqual(drift(registry, code), []);
  });

  test('reads every `rule` the code sets, or knows why it cannot', () => {
    const key = (x) => `${x.file} ${x.expr}`;
    const sanctioned = new Set(SANCTIONED_RULE_PASSTHROUGHS.map(key));
    const unexplained = code.unread.filter((x) => !sanctioned.has(key(x))).map(key);
    assert.deepEqual(unexplained, [], 'a rule ID set through a variable: read it as a literal, or add a SANCTIONED_RULE_PASSTHROUGHS entry saying where it comes from');
    const seen = new Set(code.unread.map(key));
    const stale = SANCTIONED_RULE_PASSTHROUGHS.filter((x) => !seen.has(key(x))).map(key);
    assert.deepEqual(stale, [], 'a SANCTIONED_RULE_PASSTHROUGHS entry that matches nothing: delete it');
  });

  test('the scan sees every emitter shape, so an empty match cannot pass', () => {
    // A pattern that silently stopped matching would make the drift check vacuous. Each shape
    // has at least one rule known to use it.
    assert.ok(code.ids.has('card-style-inline-title'), 'the object-literal shape found nothing');
    assert.ok(code.ids.has('flowchart-missing-target'), 'the diag() shape found nothing');
    assert.ok(code.ids.has('hub-spoke-crowded'), 'the add() shape found nothing');
    assert.ok(code.ids.get('capacity-scale')?.severities.has('info'), 'a severity from a helper (venueSeverity) was not read');
    assert.ok(code.ids.get('unknown-finish')?.autofix, 'withTokenSuggestion was not read as an autofix');
    assert.ok(code.templates.size >= 3, `expected the three families, found ${[...code.templates.keys()].join(', ')}`);
    assert.ok(code.ids.size >= 178, `expected at least 178 IDs, the count when this test landed; found ${code.ids.size}`);
  });

  test('fails when a registry row is removed (failing arm)', () => {
    const missing = { rows: new Map(registry.rows), families: registry.families };
    missing.rows.delete('unknown-finish');
    assert.deepEqual(drift(missing, code), ['emitted but not registered: unknown-finish']);
  });

  test('fails when the registry lists an ID the code does not emit (failing arm)', () => {
    const stale = { rows: new Map([...registry.rows, ['no-such-rule', { severities: new Set(['warning']), autofix: false }]]), families: registry.families };
    assert.deepEqual(drift(stale, code), ['registered but never emitted: no-such-rule']);
  });

  test('fails when a row has the wrong severity or autofix (failing arm)', () => {
    const rows = new Map(registry.rows);
    rows.set('capacity-scale', { ...rows.get('capacity-scale'), severities: new Set(['warning']) });
    rows.set('mixed-spelling', { ...rows.get('mixed-spelling'), autofix: false });
    assert.deepEqual(drift({ rows, families: registry.families }, code), [
      'severity of capacity-scale: the code emits info / warning, §3 says warning',
      'autofix of mixed-spelling: the code can autofix, §3 says —',
    ]);
  });

  test('fails when a run-time family loses its row (failing arm)', () => {
    const noFamily = { rows: registry.rows, families: registry.families.filter((f) => !f.id.startsWith('verbose-')) };
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the template's source text, as the scan reads it
    assert.deepEqual(drift(noFamily, code), ['a run-time family with no <…> row: verbose-${ov.kind}']);
  });

  test('reads double quotes, ignores comments, and keeps a suffixed template out of a family (failing arms)', () => {
    const e = emitted([
      '// findings.push({ rule: \'ghost-rule\' });',
      'out.push({ rule: "quoted-rule", severity: "hint" });',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: source text for the scan to read
      'out.push({ rule: `unknown-${key}-value`, severity: \'warning\' });',
    ].join('\n'));
    assert.ok(!e.ids.has('ghost-rule'), 'a rule ID in a comment was read as an emission');
    assert.ok(e.ids.has('quoted-rule'), 'a double-quoted rule ID was not read');
    const reg = { rows: new Map([['quoted-rule', { severities: new Set(['warning']), autofix: false }]]), families: registry.families };
    const out = drift(reg, e);
    assert.ok(out.includes('a severity §2 does not define: hint (quoted-rule)'), out.join('\n'));
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the template's source text, as the scan reads it
    assert.ok(out.includes('a run-time family with no <…> row: unknown-${key}-value'), out.join('\n'));
  });
});
