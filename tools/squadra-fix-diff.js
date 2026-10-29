#!/usr/bin/env node
/**
 * The whole-deck fix diff (decision 2026-10-26-squadra-lint-library, design.md §15.3): what "Fix all"
 * does through Squadra's fix driver (lint-core `applyAllFixes`, via lib/authoring/squadra/bridge.js)
 * against what it did before (the one-fix-per-pass loop, frozen below as the reference), on three
 * corpora:
 *
 *   1. every source the lint unit tests hand the linter (recorded by running those tests with
 *      tools/squadra/record-lint-inputs.cjs preloaded): the cases someone already thought mattered;
 *   2. a mutated corpus: each corpus-1 source that has a fixable finding, spliced into a spread of
 *      tracked decks after their first slide and at their end. The tracked decks are lint-clean by
 *      construction, so on their own they give a fix diff nothing to compare;
 *   3. the tracked decks as they are (`lint:deck --all`'s set), to catch a fix where there was none;
 *   4. every fixable line in corpus 1 with a fenced copy of itself just above it on the same slide:
 *      the case where a fix used to land on the fenced example. Here a STALL fails the run: a fixable
 *      finding still left on a live line after the driver ran.
 *
 * Every difference is classified and printed with its diff. Each must be either fixed or recorded
 * as an intended improvement (design §15.3). The diff must also RUN: it fails unless the driver
 * applied at least one fix, because a diff over decks with nothing to fix proves nothing.
 *
 * Usage:
 *   node tools/squadra-fix-diff.js [--out <file.md>] [--json] [--hosts N] [--examples N] [--corpus <inputs.jsonl>]
 * `--corpus` reuses a recording (one JSON string per line, as the preload writes it) instead of
 * re-running the lint tests.
 * Exits 1 when no fix was applied, when a fixable finding is left on a live line, or when a
 * difference falls in no known class.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const core = require('../lib/authoring/lint-core');
const { buildVocab } = require('../lib/authoring/lint');
const { splitTopLevel } = require('../lib/authoring/slide-split');
const { discoverDecks } = require('./lint-deck');
const { separatorLines } = require('../lib/authoring/slide-split');
const { deckLanguage } = require('../lib/authoring/squadra/bridge');

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : dflt;
};
const OUT = flag('--out', null);
const HOSTS = Number(flag('--hosts', 8));
const EXAMPLES = Number(flag('--examples', 3));

/** The loop `applyAllFixes` ran before the bridge, kept verbatim as the reference. */
function legacyApplyAllFixes(source, vocab) {
  let cur = source || '';
  for (let pass = 0; pass < 500; pass++) {
    const fixable = core.lintTextWith(cur, vocab).find((f) => f.autofixable);
    if (!fixable) break;
    const next = core.applyFix(cur, fixable);
    if (next == null || next === cur) break;
    cur = next;
  }
  return cur;
}

// ── Corpus 1: the lint unit tests' own inputs ───────────────────────────────

function lintTestFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.test.js') && /lintTextWith|lintText\(|applyAllFixes|applyFix\(/.test(fs.readFileSync(p, 'utf8'))) out.push(p);
    }
  };
  walk(path.join(ROOT, 'test', 'unit'));
  return out.sort();
}

function recordCorpus1() {
  const reuse = flag('--corpus', null);
  if (reuse) {
    const seen = new Set();
    for (const line of fs.readFileSync(reuse, 'utf8').split('\n')) if (line) seen.add(JSON.parse(line).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'));
    return { inputs: [...seen], tests: lintTestFiles().length, testExit: 'reused recording' };
  }
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'squadra-fix-diff-')), 'inputs.jsonl');
  const tests = lintTestFiles();
  const res = spawnSync(process.execPath, ['--require', path.join(__dirname, 'squadra', 'record-lint-inputs.cjs'), '--test', '--test-reporter=dot', ...tests], {
    cwd: ROOT,
    env: { ...process.env, SQUADRA_RECORD: file },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!fs.existsSync(file)) throw new Error(`recording the lint tests' inputs wrote nothing (exit ${res.status}): ${String(res.stderr).slice(-2000)}`);
  const seen = new Set();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) if (line) seen.add(JSON.parse(line).replace(/^﻿/, '').replace(/\r\n?/g, '\n'));
  return { inputs: [...seen], tests: tests.length, testExit: res.status };
}

// ── Corpus 2: fixable sources spliced into tracked decks ────────────────────

const FRONT_MATTER = /^---\n[\s\S]*?\n---[ \t]*(?:\n|$)/;
function split(deck) {
  const fm = FRONT_MATTER.exec(deck);
  return { fm: fm ? fm[0] : '', body: fm ? deck.slice(fm[0].length) : deck };
}
/** `guest`'s slides after `host`'s first slide, and at its end. A guest's front-matter keys join
 *  the host's front matter (keys the host already sets are dropped), so a front-matter finding
 *  is spliced too. */
function splices(host, guest) {
  const h = split(host);
  const g = split(guest);
  const hostKeys = new Set([...h.fm.matchAll(/^([A-Za-z_-]+)\s*:/gm)].map((m) => m[1]));
  const guestKeys = g.fm
    .replace(/^---\n/, '')
    .replace(/\n---[ \t]*\n?$/, '')
    .split('\n')
    .filter((l) => {
      const k = /^([A-Za-z_-]+)\s*:/.exec(l);
      return l.trim() && (!k || !hostKeys.has(k[1]));
    });
  const fm = h.fm ? h.fm.replace(/\n---[ \t]*\n?$/, `${guestKeys.length ? `\n${guestKeys.join('\n')}` : ''}\n---\n`) : guestKeys.length ? `---\n${guestKeys.join('\n')}\n---\n` : '';
  const gb = g.body.trim();
  if (!gb && !guestKeys.length) return [];
  const sep = /\n---[ \t]*\n/.exec(h.body);
  const first = sep ? h.body.slice(0, sep.index) : h.body;
  const rest = sep ? h.body.slice(sep.index) : '';
  const out = [`${fm}${first}${gb ? `\n\n---\n\n${gb}\n` : '\n'}${rest}`];
  if (gb) out.push(`${fm}${h.body.replace(/\n*$/, '')}\n\n---\n\n${gb}\n`);
  return out;
}

// ── Compare ─────────────────────────────────────────────────────────────────

function slides(text) {
  return splitTopLevel(text).length - core.fmChunks(text);
}

/** The text of every code fence, as the driver's deck language reads it. */
function fences(text) {
  const { tree } = deckLanguage.parse({ path: 'd.md', text, language: deckLanguage.id });
  return deckLanguage.shape(tree, { text }).inert.join('\u0000');
}

/** Fixable findings still on a LIVE line: ones `applyFix` can locate (a fenced match is not one). */
function liveFixable(text, vocab) {
  const lines = text.split('\n');
  const seps = separatorLines(lines);
  const fm = core.fmChunks(text);
  return core.lintTextWith(text, vocab).filter((f) => f.autofixable && f.line != null && core.fixLineIndex(lines, seps, fm, f) >= 0);
}

/** Corpus 4: each fixable line of a source with a fenced copy of itself just above it. */
function fencedCopies(sources, vocab) {
  const out = [];
  for (const src of sources) {
    const lines = src.split('\n');
    const seps = separatorLines(lines);
    const fm = core.fmChunks(src);
    for (const f of core.lintTextWith(src, vocab).filter((x) => x.autofixable && x.line != null && x.slide > 0).slice(0, 3)) {
      const i = core.fixLineIndex(lines, seps, fm, f);
      if (i >= 0) out.push([...lines.slice(0, i), '```md', lines[i], '```', '', ...lines.slice(i)].join('\n'));
    }
  }
  return out;
}

function compare(name, sources, vocab) {
  const rows = { same: 0, changed: 0, differs: 0, applied: 0, legacyApplied: 0, legacyMs: 0, driverMs: 0, stalls: 0 };
  const classes = new Map();
  const note = (cls, src, legacy, next, detail) => {
    if (!classes.has(cls)) classes.set(cls, []);
    classes.get(cls).push({ src, legacy, next, detail });
  };
  for (const src of sources) {
    let t = process.hrtime.bigint();
    const legacy = legacyApplyAllFixes(src, vocab);
    rows.legacyMs += Number(process.hrtime.bigint() - t) / 1e6;
    t = process.hrtime.bigint();
    const res = core.fixAllDetailed(src, vocab);
    rows.driverMs += Number(process.hrtime.bigint() - t) / 1e6;
    rows.applied += res.applied.length;
    // A stall: the driver ran and a fixable finding is still on a live line.
    if (res.applied.length || res.skipped.length) {
      if (liveFixable(res.text, vocab).length) {
        rows.stalls++;
        note('STALL: a fixable finding left on a live line', src, legacy, res.text, { skipped: res.skipped, left: { legacy: liveFixable(legacy, vocab).length, driver: liveFixable(res.text, vocab).length }, slides: { source: slides(src), legacy: slides(legacy), driver: slides(res.text) } });
      }
    }
    if (legacy !== src) rows.legacyApplied++;
    if (res.text !== src || legacy !== src) rows.changed++;
    if (legacy === res.text) {
      rows.same++;
      continue;
    }
    rows.differs++;
    const fixableLeft = (t) => core.lintTextWith(t, vocab).filter((f) => f.autofixable).length;
    const lLeft = fixableLeft(legacy);
    const nLeft = fixableLeft(res.text);
    const lSlides = slides(legacy);
    const nSlides = slides(res.text);
    const srcSlides = slides(src);
    const reasons = [...new Set(res.skipped.map((s) => s.reason))].sort();
    let cls;
    const fenceSrc = fences(src);
    if (fences(legacy) !== fenceSrc && fences(res.text) === fenceSrc) cls = 'the old loop rewrote a fenced example; the driver left it';
    else if (lSlides !== srcSlides && nSlides === srcSlides) cls = 'the old loop changed the slide count; the driver kept it';
    else if (reasons.includes('inert')) cls = 'the driver refused an edit inside a code fence (inert)';
    else if (reasons.includes('broke-structure')) cls = 'the driver refused a fix that changed the deck shape (broke-structure)';
    else if (nLeft < lLeft) cls = 'the driver fixed more (the old loop stopped early)';
    else if (reasons.includes('did-not-resolve')) cls = 'the driver reverted a fix that did not resolve its finding';
    else if (nLeft === lLeft) cls = 'same fixes, applied in a different order or batch';
    else cls = 'UNCLASSIFIED';
    note(cls, src, legacy, res.text, { skipped: res.skipped, left: { legacy: lLeft, driver: nLeft }, slides: { source: srcSlides, legacy: lSlides, driver: nSlides } });
  }
  return { name, total: sources.length, ...rows, classes };
}

function main() {
  const t0 = Date.now();
  const vocab = buildVocab();
  const c1 = recordCorpus1();
  const fixable = c1.inputs.filter((s) => core.lintTextWith(s, vocab).some((f) => f.autofixable));
  const tracked = discoverDecks()
    .sort()
    .map((f) => fs.readFileSync(f, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n'));
  const step = Math.max(1, Math.floor(tracked.length / HOSTS));
  const hosts = tracked.filter((_, i) => i % step === 0).slice(0, HOSTS);
  const mutated = [];
  for (const g of fixable) for (const h of hosts) mutated.push(...splices(h, g));

  const results = [
    compare('1 · lint unit-test inputs', c1.inputs, vocab),
    compare('2 · fixable inputs spliced into tracked decks', mutated, vocab),
    compare('3 · tracked decks as they are', tracked, vocab),
    compare('4 · a fenced copy above each fixable line', fencedCopies(fixable, vocab), vocab),
  ];
  const { diff } = require('@laticent/squadra');
  const lines = [];
  lines.push('# Whole-deck fix diff: Squadra driver vs the one-fix-per-pass loop', '');
  lines.push(`Generated by \`node tools/squadra-fix-diff.js\` on ${new Date().toISOString().slice(0, 10)} (${Math.round((Date.now() - t0) / 1000)} s). Corpus 1 was recorded from ${c1.tests} lint test files (test exit ${c1.testExit}); ${fixable.length} of its ${c1.inputs.length} sources have a fixable finding. Corpus 2 splices those into ${hosts.length} tracked decks, two places each.`, '');
  lines.push('| Corpus | Sources | Fixed by either | Same result | Different | Fixes the driver applied | Stalls | Old loop, s | Driver, s |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of results) lines.push(`| ${r.name} | ${r.total} | ${r.changed} | ${r.same} | ${r.differs} | ${r.applied} | ${r.stalls} | ${(r.legacyMs / 1000).toFixed(1)} | ${(r.driverMs / 1000).toFixed(1)} |`);
  lines.push('', 'The two time columns are one run each on the machine that generated this file, the whole loop per source, linting included: an order of magnitude, not a benchmark.');
  lines.push('', 'The "old loop" is the one-fix-per-pass loop, frozen, over TODAY\'s `applyFix`. So it compares the loops, not the fence handling: `applyFix` itself stopped editing fenced lines in the same change (`fixLineIndex`), and test/unit/authoring/squadra-bridge.test.js pins that. A fixable finding counted as "left" includes one that only a fence matches, which no fix touches.');
  lines.push('');
  let unclassified = 0;
  for (const r of results) {
    if (!r.classes.size) continue;
    lines.push(`## ${r.name}: the differences`, '');
    for (const [cls, list] of r.classes) {
      if (cls === 'UNCLASSIFIED' || cls.startsWith('STALL')) unclassified += list.length;
      lines.push(`### ${cls}: ${list.length}`, '');
      for (const ex of list.slice(0, EXAMPLES)) {
        const skipped = ex.detail.skipped.map((s) => `${s.rule} (slide ${s.slide}): ${s.reason}`).join('; ') || 'none';
        lines.push(`Fixable findings left: old loop ${ex.detail.left.legacy}, driver ${ex.detail.left.driver}. Slides: source ${ex.detail.slides.source}, old loop ${ex.detail.slides.legacy}, driver ${ex.detail.slides.driver}. Driver skipped: ${skipped}.`, '');
        lines.push('```diff', diff(ex.legacy, ex.next, { from: 'old loop', to: 'driver', context: 2 }).trimEnd(), '```', '');
      }
    }
  }
  const applied = results.reduce((n, r) => n + r.applied, 0);
  const report = `${lines.join('\n')}\n`;
  if (OUT) fs.writeFileSync(OUT, report);
  else process.stdout.write(report);
  if (argv.includes('--json')) process.stdout.write(`${JSON.stringify(results.map((r) => ({ name: r.name, total: r.total, changed: r.changed, same: r.same, differs: r.differs, applied: r.applied, stalls: r.stalls, legacyMs: Math.round(r.legacyMs), driverMs: Math.round(r.driverMs), classes: Object.fromEntries([...r.classes].map(([k, v]) => [k, v.length])) })))}\n`);
  if (!applied) {
    process.stderr.write('squadra-fix-diff: the driver applied no fix on any corpus, so the diff proved nothing.\n');
    process.exit(1);
  }
  if (unclassified) {
    process.stderr.write(`squadra-fix-diff: ${unclassified} difference(s) are stalls or fall in no known class; read them in the report.\n`);
    process.exit(1);
  }
}

main();
