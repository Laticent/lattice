#!/usr/bin/env node
/**
 * The per-rule migration diff (decision 2026-10-26-squadra-lint-library, design.md §15.3): every deck rule
 * that moved from lib/authoring/lint-core.js into the Squadra `deck` ruleset (lib/authoring/rules/), held
 * to the lint-core detector it replaced (frozen in tools/squadra/legacy-detectors.js), on three corpora:
 *
 *   1. every source the lint unit tests hand the linter (tools/squadra/corpus.js): the cases someone
 *      already thought mattered;
 *   2. a mutated corpus: each rule's own bad patterns injected into a spread of tracked decks at four
 *      places (a new first slide, a new last slide, inside the host's first list, and beside a fence that
 *      quotes the pattern). The tracked decks are lint-clean by construction, so on their own they would
 *      give the diff nothing to compare;
 *   3. the tracked decks as they are, to catch a migrated rule that fires where lint-core did not.
 *
 * It compares the full legacy record field by field (rule, slide, line, severity, message, classToken,
 * the fix text, shapeChange, chunkLine) as a multiset per source, so a finding reported twice must be
 * reported twice. A finding the Squadra rule makes fixable where the detector offered no fix is not a
 * difference: it is the migration's gain, counted per rule, and each such fix is APPLIED through lint-core's
 * own `applyFix` (the quick fix and Fix-all path) and must make its finding go away.
 *
 * The diff must RUN, not only pass: it fails when a migrated rule never fires on any corpus, or when a rule
 * that offers a fix never applies one.
 *
 * Also reports the migration's progress numbers (design §15.3): lint-core's line count and the number of
 * rule ids it still emits.
 *
 * Usage:
 *   node tools/squadra-migration-diff.js [--out <file.md>] [--hosts N] [--corpus <inputs.jsonl>]
 * Exits 1 on any difference, a rule that never fires, or a fix that does not resolve its finding.
 */

const fs = require('node:fs');
const path = require('node:path');
const { ROOT, fold, recordLintInputs, trackedDecks, hostsOf } = require('./squadra/corpus');
const { LEGACY } = require('./squadra/legacy-detectors');
const core = require('../lib/authoring/lint-core');
const { deckRuleFindings } = require('../lib/authoring/squadra/deck-rules');
const { RULES } = require('../lib/authoring/rules');

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : dflt;
};
const OUT = flag('--out', null);
const HOSTS = Number(flag('--hosts', 12));

// ── The bad patterns each rule's mutated corpus injects ─────────────────────
//
// `slide` is a whole slide; `inline` is a line that can sit in a list item. Each set is the legacy rule's
// own bad shapes, plus the near misses it must stay quiet on.
const PATTERNS = {
  'tag-alias': {
    slides: [
      '<!-- _class: cards banner-tag -->\n\n# Teams\n\n- Platform\n  - Owns the build.',
      '<!-- class: cards banner-tag -->\n\n# Running class',
      '<!--\n_class: cards\n  banner-tag\n-->\n\n# Split directive',
      '<!-- _class: cards banner-tag tag-corner -->\n\n# Has a placement',
      '<!-- _class: cards banner-tagged -->\n\n# Near miss',
    ],
    inline: '<!-- _class: cards banner-tag -->',
  },
  'say-key-case': {
    slides: [
      '# Results\n\n<!-- Say: revenue grew -->',
      '# Results\n\nIn prose <!-- SAY: inline note --> here.',
      '# Quote\n\n> <!-- Say: quoted -->',
      '# Multi\n\n<!--\nSay: across\nlines\n-->',
      '# Spoken\n\n<!-- say: lowercase is spoken -->',
      '# Code span\n\nWrite `<!-- Say: x -->` to keep it private.',
      '# Dashes\n\n<!--- Say: three dashes --->',
      '# Abrupt close\n\n<!-- sAy: closes with --!> then text',
      '# Long dashes\n\n<!---- SAY: x ----> and <!-- Say: two --> on one line',
      '# Not a key\n\n<!-- Saying: not the key --> <!-- say : lowercase spaced -->',
      '# Unclosed\n\n<!-- Say: never closed',
    ],
    inline: '<!-- Say: in a list item -->',
  },
};

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
function parts(deck) {
  const fm = FRONT_MATTER.exec(deck);
  return { fm: fm ? fm[0] : '', body: fm ? deck.slice(fm[0].length) : deck };
}

/** One rule's patterns injected into one host at the four places. */
function mutations(host, pats) {
  const { fm, body } = parts(host);
  const b = body.replace(/^\n+/, '').replace(/\n*$/, '\n');
  const out = [];
  for (const p of pats.slides) {
    out.push(`${fm}\n${p}\n\n---\n\n${b}`);
    out.push(`${fm}\n${b}\n---\n\n${p}\n`);
    out.push(`${fm}\n${b}\n---\n\n\`\`\`md\n${p}\n\`\`\`\n\n${p}\n`);
  }
  const lines = b.split('\n');
  const li = lines.findIndex((l) => /^\s*[-*] \S/.test(l));
  if (li >= 0) {
    const indent = /^\s*/.exec(lines[li])[0];
    out.push(`${fm}\n${[...lines.slice(0, li + 1), `${indent}  ${pats.inline}`, ...lines.slice(li + 1)].join('\n')}`);
    out.push(`${fm}\n${[...lines.slice(0, li), `${lines[li]} ${pats.inline}`, ...lines.slice(li + 1)].join('\n')}`);
  }
  return out;
}

// ── Compare ─────────────────────────────────────────────────────────────────

const FIELDS = ['rule', 'slide', 'line', 'severity', 'message', 'classToken', 'fix', 'shapeChange', 'chunkLine'];
const keyOf = (f) => JSON.stringify(FIELDS.map((k) => (f[k] === undefined ? null : f[k])));

function multisetDiff(a, b) {
  const count = new Map();
  for (const f of a) count.set(keyOf(f), (count.get(keyOf(f)) || 0) + 1);
  const onlyB = [];
  for (const f of b) {
    const k = keyOf(f);
    if (count.get(k) > 0) count.set(k, count.get(k) - 1);
    else onlyB.push(f);
  }
  const onlyA = [];
  for (const [k, n] of count) for (let i = 0; i < n; i++) onlyA.push(JSON.parse(k));
  return { onlyA, onlyB };
}

function compare(name, sources, stats) {
  const rows = [];
  for (const { id, legacy } of RULES.map((r) => ({ id: r.legacy, legacy: LEGACY[r.legacy] }))) {
    const s = stats[id];
    let diffs = 0;
    for (const src of sources) {
      const before = legacy(src);
      const after = deckRuleFindings(src, id);
      s.legacy += before.length;
      s.squadra += after.length;
      const { onlyA, onlyB } = multisetDiff(before, after);
      if (onlyA.length || onlyB.length) {
        diffs++;
        if (s.examples.length < 5) s.examples.push({ corpus: name, source: src.slice(0, 600), lintCoreOnly: onlyA, squadraOnly: onlyB.map((f) => FIELDS.map((k) => f[k])) });
      }
      for (const f of after) {
        if (!f.autofixable) continue;
        s.fixable++;
        const next = core.applyFix(src, f);
        if (next == null || next === src) {
          s.fixFailed++;
          continue;
        }
        const left = deckRuleFindings(next, id).filter((g) => g.slide === f.slide && g.line === f.line).length;
        const was = after.filter((g) => g.slide === f.slide && g.line === f.line).length;
        if (left < was) s.fixResolved++;
        else s.fixFailed++;
      }
    }
    s.diffs += diffs;
    rows.push({ id, diffs });
  }
  return { name, total: sources.length, rows };
}

function emittedRuleIds(text) {
  return new Set([...text.matchAll(/\brule: '([a-z0-9-]+)'/g)].map((m) => m[1]));
}

/**
 * Run the diff. `inputs` is corpus 1 (pass `[]` to skip it, as the unit test does: recording it runs the
 * whole lint test suite). Returns `{ report, failures, stats }`.
 */
function runDiff({ inputs = [], tests = 0, testExit = 'not recorded', hosts: hostCount = HOSTS } = {}) {
  const t0 = Date.now();
  const tracked = trackedDecks().map((d) => fold(d.text));
  const hosts = hostsOf(tracked, hostCount);
  const stats = Object.fromEntries(RULES.map((r) => [r.legacy, { legacy: 0, squadra: 0, diffs: 0, fixable: 0, fixResolved: 0, fixFailed: 0, examples: [] }]));
  const mutated = [];
  for (const r of RULES) {
    if (!PATTERNS[r.legacy]) throw new Error(`tools/squadra-migration-diff.js: '${r.legacy}' moved to Squadra but has no PATTERNS entry, so its mutated corpus is empty`);
    if (!LEGACY[r.legacy]) throw new Error(`tools/squadra-migration-diff.js: '${r.legacy}' moved to Squadra but tools/squadra/legacy-detectors.js has no frozen detector to compare it with`);
    for (const h of hosts) mutated.push(...mutations(h, PATTERNS[r.legacy]));
  }
  const results = [compare('1 · lint unit-test inputs', inputs, stats), compare('2 · bad patterns injected into tracked decks', mutated, stats), compare('3 · tracked decks as they are', tracked, stats)];

  const lintCore = fs.readFileSync(path.join(ROOT, 'lib/authoring/lint-core.js'), 'utf8');
  const lines = [];
  lines.push('# Squadra migration diff', '');
  lines.push(`Generated by \`node tools/squadra-migration-diff.js\` on ${new Date().toISOString().slice(0, 10)} (${Math.round((Date.now() - t0) / 1000)} s). Corpus 1 was recorded from ${tests} lint test files (test exit ${testExit}${testExit === 1 ? '; the recording run\'s own exit: test/unit/core/payload-elision-lint-oracle.test.js patches lint-core after the recording preload has already loaded it, and passes without the preload' : ''}): ${inputs.length} sources. Corpus 2 injects each rule's patterns into ${hosts.length} tracked decks: ${mutated.length} sources. Corpus 3 is ${tracked.length} tracked decks.`, '');
  lines.push('Each migrated rule is compared with the lint-core detector it replaced (frozen in `tools/squadra/legacy-detectors.js`), record by record. A difference is a source where the two disagree on any field.', '');
  lines.push(`| Corpus | Sources | ${RULES.map((r) => `\`${r.legacy}\` differences`).join(' | ')} |`);
  lines.push(`|---|---|${RULES.map(() => '---').join('|')}|`);
  for (const r of results) lines.push(`| ${r.name} | ${r.total} | ${r.rows.map((x) => x.diffs).join(' | ')} |`);
  lines.push('', '| Rule | lint-core findings | Squadra findings | Differences | Fixable now | Fixes applied and resolved | Fixes that failed |', '|---|---|---|---|---|---|---|');
  const failures = [];
  for (const r of RULES) {
    const s = stats[r.legacy];
    lines.push(`| \`${r.id}\` (was \`${r.legacy}\`) | ${s.legacy} | ${s.squadra} | ${s.diffs} | ${r.fixable ? 'yes' : 'no'} | ${s.fixResolved} | ${s.fixFailed} |`);
    if (s.diffs) failures.push(`${r.legacy}: ${s.diffs} sources differ`);
    if (!s.squadra) failures.push(`${r.legacy}: never fired, so the diff proved nothing`);
    if (r.fixable && !s.fixResolved) failures.push(`${r.legacy}: offers a fix but never applied one`);
    if (s.fixFailed) failures.push(`${r.legacy}: ${s.fixFailed} fixes did not apply or did not resolve`);
  }
  lines.push('', '## Progress (design §15.3)', '');
  lines.push(`- \`lib/authoring/lint-core.js\`: ${lintCore.split('\n').length} lines; ${emittedRuleIds(lintCore).size} rule ids written as \`rule: '…'\` literals (rules built at run time, such as \`unknown-\${key}\`, are not counted).`);
  lines.push(`- Rules on Squadra: ${RULES.length} (${RULES.map((r) => `\`${r.id}\``).join(', ')}).`);
  if (failures.length) {
    lines.push('', '## Failures', '', ...failures.map((w) => `- ${w}`));
    for (const r of RULES) for (const e of stats[r.legacy].examples) lines.push('', `### \`${r.legacy}\` in ${e.corpus}`, '', '```json', JSON.stringify({ lintCoreOnly: e.lintCoreOnly, squadraOnly: e.squadraOnly }, null, 1), '```', '', '```md', e.source, '```');
  }
  return { report: `${lines.join('\n')}\n`, failures, stats };
}

function main() {
  const c1 = recordLintInputs(flag('--corpus', null));
  const { report, failures } = runDiff({ inputs: c1.inputs, tests: c1.tests, testExit: c1.testExit });
  if (OUT) fs.writeFileSync(OUT, report);
  process.stdout.write(report);
  process.exit(failures.length ? 1 : 0);
}

if (require.main === module) main();

module.exports = { runDiff, mutations, PATTERNS };
