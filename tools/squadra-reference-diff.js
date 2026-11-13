#!/usr/bin/env node
/**
 * The reference diff of the lint-core rewrite (engineering/decisions/2026-11-13-squadra-replaces-lint-core.md §6):
 * run the FROZEN lint-core (tools/squadra/reference/lint-core.js, as it stood at the fork) and the new `deck` ruleset
 * (lib/authoring/squadra, `lintDeck`) over the same corpora and compare what each reports, finding by finding.
 *
 * The corpora (tools/squadra/corpus.js):
 *   1. every source the lint unit tests hand the linter, recorded by running them (`--corpus <file>` reuses one,
 *      `--save-corpus <file>` keeps the recording for the next run);
 *   2. mutated decks: each corpus-1 source with a finding, spliced into a spread of tracked decks after their first
 *      slide, so a rule meets real decks around the case its tests wrote;
 *   3. the tracked decks as they are (`lint:deck --all`'s set).
 *
 * HOW TWO FINDINGS MATCH. On rule (the new id without its `deck/` prefix), severity, slide, message, and the TEXT of
 * the line the finding starts on, trimmed: lint-core names its line by text, so two findings on two identical lines
 * compare alike on both sides, where comparing line numbers would make a false difference. A lint-core finding whose
 * line text is not a line of its slide (`fixLineIndex` cannot place it) matches on the other four alone and is counted
 * as UNLOCATED, so the report says how many matches the line did not check.
 *
 * A rule is MIGRATED when the new ruleset defines `deck/<rule>`. The diff is held only on migrated rules (and on
 * Squadra's own `squadra/*` findings, which always count). Every difference in one must be fixed, or explained in
 * tools/squadra/reference/explained.json, one entry per kind of difference:
 *
 *   { "<rule>": [ { "kind": "lint", "match": "<regex on the message>", "why": "<the reason it is intended>" },
 *                 { "kind": "fix",  "match": "<regex on the source name>", "why": "…" } ] }
 *
 * An entry that explains no difference is STALE and fails the run, so the file cannot quietly switch a rule off.
 *
 * `--fix` adds the fix diff: Fix all through the frozen lint-core (`applyAllFixes`) and through `fixDeck`, compared as
 * text. A source whose two results differ is attributed to the rules whose findings changed under either fix (each
 * path's findings before and after, compared as multisets). It is held when every one of those rules is migrated; a
 * difference no rule accounts for is unexplained and fails.
 *
 * The diff must RUN: it fails when the corpora gave the reference no finding at all, because a diff over sources with
 * nothing to compare proves nothing.
 *
 * Usage:
 *   node tools/squadra-reference-diff.js [--corpus <inputs.jsonl>] [--save-corpus <file>] [--hosts N] [--fix]
 *     [--json] [--out <file.md>] [--rules a,b] (hold only these lint-core rule names) [--examples N]
 * Exits 1 on an unexplained difference in a migrated rule, a stale explanation, or a run with no reference finding.
 */

const fs = require('node:fs');
const path = require('node:path');
const { ROOT, fold, recordLintInputs, splice, trackedDecks, hostsOf } = require('./squadra/corpus');

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : dflt;
};
const HOSTS = Number(flag('--hosts', 8));
const EXAMPLES = Number(flag('--examples', 3));
const OUT = flag('--out', null);
const ONLY = flag('--rules', null)?.split(',').filter(Boolean) ?? null;
const FIX = argv.includes('--fix');
const JSON_OUT = argv.includes('--json');
const EXPLAINED_FILE = path.join(__dirname, 'squadra', 'reference', 'explained.json');

const ref = require('./squadra/reference/lint-core');
const { buildVocab } = require('../lib/authoring/lint');
const { separatorLines } = require('../lib/authoring/slide-split');
const { fencedLines } = require('../lib/core/shape-glyphs');
const { deckRuleset, fixDeck, lintDeck } = require('../lib/authoring/squadra');

const PREFIX = 'deck/';

/** A lint-core finding as the diff compares it. `text` is null when `fixLineIndex` cannot place its line. */
function oldRecords(text, vocab) {
  const lines = text.split('\n');
  const seps = separatorLines(lines);
  const fm = ref.fmChunks(text);
  const fenced = fencedLines(text);
  return ref.lintTextWith(text, vocab).map((f) => {
    const i = ref.fixLineIndex(lines, seps, fm, f, fenced);
    return { rule: f.rule, severity: f.severity, slide: f.slide ?? 0, message: f.message, line: i + 1, text: i >= 0 ? lines[i].trim() : null };
  });
}

/** A Squadra finding as the diff compares it: the text of the line its span starts on, trimmed. */
function newRecords(text, vocab) {
  const lines = text.split('\n');
  return lintDeck(text, { vocab }).map((f) => ({
    rule: f.rule.startsWith(PREFIX) ? f.rule.slice(PREFIX.length) : f.rule,
    severity: f.severity,
    slide: f.location?.slide ?? 0,
    message: f.message,
    line: f.start.line,
    text: (lines[f.start.line - 1] ?? '').trim(),
  }));
}

const loose = (r) => `${r.rule}\u0001${r.severity}\u0001${r.slide}\u0001${r.message}`;
const exact = (r) => `${loose(r)}\u0001${r.text}`;

/**
 * Match two lists of records: exactly first (with the line text), then each unlocated old record against what is
 * left on the other four fields. Returns what matched and what each side has alone.
 */
function match(olds, news) {
  const take = (pool, k) => {
    const list = pool.get(k);
    return list?.length ? list.pop() : null;
  };
  const group = (list, keyOf) => {
    const m = new Map();
    for (const r of list) m.set(keyOf(r), [...(m.get(keyOf(r)) ?? []), r]);
    return m;
  };
  const byExact = group(news, exact);
  const same = [];
  const pending = [];
  for (const r of olds) {
    if (r.text !== null && take(byExact, exact(r))) same.push(r);
    else pending.push(r);
  }
  const byLoose = group([...byExact.values()].flat(), loose);
  const matchedUnlocated = [];
  const oldOnly = [];
  for (const r of pending) {
    if (r.text === null && take(byLoose, loose(r))) matchedUnlocated.push(r);
    else oldOnly.push(r);
  }
  return { same, matchedUnlocated, oldOnly, newOnly: [...byLoose.values()].flat() };
}

/** The rules whose findings differ, as multisets on the loose key, between two lists. */
function changedRules(before, after) {
  const counts = (records) => {
    const m = new Map();
    for (const r of records) m.set(loose(r), (m.get(loose(r)) ?? 0) + 1);
    return m;
  };
  const a = counts(before);
  const b = counts(after);
  const out = new Set();
  for (const k of new Set([...a.keys(), ...b.keys()])) if ((a.get(k) ?? 0) !== (b.get(k) ?? 0)) out.add(k.split('\u0001')[0]);
  return out;
}

/** The entries of explained.json, each with a hit counter, so an entry nothing used is reported stale. */
function loadExplained(file = EXPLAINED_FILE) {
  const raw = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const out = [];
  for (const [rule, list] of Object.entries(raw)) {
    for (const e of Array.isArray(list) ? list : []) out.push({ rule, kind: e.kind, re: new RegExp(e.match), why: e.why, hits: 0 });
  }
  return out;
}
function explain(entries, rule, kind, subject) {
  const e = entries.find((x) => x.rule === rule && x.kind === kind && x.re.test(subject));
  if (e) e.hits++;
  return e ?? null;
}

function main() {
  const vocab = buildVocab();
  const migrated = new Set(deckRuleset(vocab).rules.map((r) => (r.id.startsWith(PREFIX) ? r.id.slice(PREFIX.length) : r.id)));
  const held = (rule) => (rule.startsWith('squadra/') || migrated.has(rule)) && (!ONLY || ONLY.includes(rule));
  const explained = loadExplained();

  const recording = recordLintInputs(flag('--corpus', null));
  const save = flag('--save-corpus', null);
  if (save) fs.writeFileSync(save, `${recording.inputs.map((s) => JSON.stringify(s)).join('\n')}\n`);
  const decks = trackedDecks();
  const sources = [];
  for (const text of recording.inputs) sources.push({ corpus: 'tests', name: `test input ${sources.length + 1}`, text });
  const hosts = hostsOf(decks, HOSTS);
  for (const text of recording.inputs) {
    if (!ref.lintTextWith(text, vocab).length) continue;
    for (const h of hosts) sources.push({ corpus: 'mutated', name: `${h.path} + test input`, text: splice(fold(h.text), text) });
  }
  for (const d of decks) sources.push({ corpus: 'decks', name: d.path, text: d.text });

  const perRule = new Map();
  const tally = (rule) => perRule.get(rule) ?? perRule.set(rule, { rule, old: 0, new: 0, same: 0, unlocated: 0, oldOnly: [], newOnly: [] }).get(rule);
  const byCorpus = {};
  let oldTotal = 0;
  const fixStats = { compared: 0, same: 0, held: [], notMigrated: 0 };
  for (const s of sources) {
    byCorpus[s.corpus] = (byCorpus[s.corpus] ?? 0) + 1;
    const olds = oldRecords(s.text, vocab);
    const news = newRecords(s.text, vocab);
    oldTotal += olds.length;
    for (const r of olds) tally(r.rule).old++;
    for (const r of news) tally(r.rule).new++;
    const m = match(olds, news);
    for (const r of m.same) tally(r.rule).same++;
    for (const r of m.matchedUnlocated) {
      tally(r.rule).same++;
      tally(r.rule).unlocated++;
    }
    for (const r of m.oldOnly) tally(r.rule).oldOnly.push({ source: s.name, ...r });
    for (const r of m.newOnly) tally(r.rule).newOnly.push({ source: s.name, ...r });

    if (FIX) {
      const oldText = ref.applyAllFixes(s.text, vocab);
      const newText = fixDeck(s.text, { vocab }).text;
      fixStats.compared++;
      if (oldText === newText) {
        fixStats.same++;
        continue;
      }
      const rules = new Set([...changedRules(olds, oldRecords(oldText, vocab)), ...changedRules(news, newRecords(newText, vocab))]);
      if (rules.size && ![...rules].every(held)) {
        fixStats.notMigrated++;
        continue;
      }
      fixStats.held.push({ source: s.name, rules: [...rules] });
    }
  }

  const rows = [...perRule.values()].sort((a, b) => b.old + b.new - (a.old + a.new) || (a.rule < b.rule ? -1 : 1));
  const heldRows = rows.filter((r) => held(r.rule));
  const failures = [];
  for (const r of heldRows) {
    for (const [side, list] of [['only in lint-core', r.oldOnly], ['only in Squadra', r.newOnly]]) {
      const open = list.filter((x) => !explain(explained, r.rule, 'lint', x.message));
      if (open.length) failures.push(`${r.rule}: ${open.length} finding${open.length === 1 ? '' : 's'} ${side} with no lint entry in explained.json (first: ${open[0].source}, slide ${open[0].slide}: ${open[0].message})`);
    }
  }
  for (const d of fixStats.held) {
    if (!d.rules.length) failures.push(`fix: ${d.source} fixes differently and no rule's findings changed to account for it`);
    else for (const rule of d.rules) if (!explain(explained, rule, 'fix', d.source)) failures.push(`fix: ${d.source} fixes differently (${rule}), with no fix entry in explained.json`);
  }
  for (const e of explained) {
    if (!migrated.has(e.rule)) failures.push(`explained.json: ${e.rule} is not a rule the ruleset defines`);
    else if (!e.hits && (e.kind === 'lint' || FIX)) failures.push(`explained.json: the ${e.kind} entry /${e.re.source}/ for ${e.rule} explains no difference (stale)`);
  }
  if (!oldTotal) failures.push('the corpora gave the reference no finding: a diff over nothing proves nothing');

  const notMigrated = rows.filter((r) => !held(r.rule));
  const out = [];
  out.push('# Squadra reference diff', '');
  out.push(`Corpora: ${Object.entries(byCorpus).map(([k, v]) => `${k} ${v}`).join(', ')} sources (${recording.tests} lint test files, exit ${recording.testExit}).`);
  out.push(`Reference findings: ${oldTotal}. Rules the ruleset defines: ${migrated.size}.`, '');
  out.push('## Migrated rules', '');
  if (!heldRows.length) out.push('None yet.', '');
  else {
    out.push('| Rule | lint-core | Squadra | Same | of which unlocated | Only lint-core | Only Squadra |', '|---|---:|---:|---:|---:|---:|---:|');
    for (const r of heldRows) out.push(`| ${r.rule} | ${r.old} | ${r.new} | ${r.same} | ${r.unlocated} | ${r.oldOnly.length} | ${r.newOnly.length} |`);
    out.push('');
    for (const r of heldRows) {
      for (const [label, list] of [['only in lint-core', r.oldOnly], ['only in Squadra', r.newOnly]]) {
        for (const x of list.slice(0, EXAMPLES)) out.push(`- \`${r.rule}\` ${label}: ${x.source}, slide ${x.slide}, line ${x.line}: ${x.message}`);
      }
    }
    out.push('');
  }
  if (explained.length) {
    out.push('## Explained differences', '');
    for (const e of explained) out.push(`- \`${e.rule}\` ${e.kind} /${e.re.source}/ (${e.hits} hit${e.hits === 1 ? '' : 's'}): ${e.why}`);
    out.push('');
  }
  out.push('## Not yet migrated', '', `${notMigrated.length} rules, ${notMigrated.reduce((n, r) => n + r.old, 0)} reference findings.`, '');
  out.push('| Rule | lint-core findings |', '|---|---:|');
  for (const r of notMigrated) out.push(`| ${r.rule} | ${r.old} |`);
  out.push('');
  if (FIX) out.push('## Fix diff', '', `Compared on ${fixStats.compared} sources: ${fixStats.same} identical; ${fixStats.held.length} differ on migrated rules (or on none); ${fixStats.notMigrated} differ on rules not yet migrated.`, '');
  out.push(failures.length ? `## FAIL\n\n${failures.map((f) => `- ${f}`).join('\n')}\n` : '## PASS\n');
  const report = out.join('\n');
  if (OUT) fs.writeFileSync(OUT, report);
  if (JSON_OUT) console.log(JSON.stringify({ oldTotal, migrated: [...migrated], rows: rows.map(({ oldOnly, newOnly, ...r }) => ({ ...r, oldOnly: oldOnly.length, newOnly: newOnly.length })), fix: FIX ? { ...fixStats, held: fixStats.held.length } : null, failures }, null, 2));
  else console.log(report);
  return failures.length ? 1 : 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { oldRecords, newRecords, match, changedRules, loadExplained, explain, ROOT };
