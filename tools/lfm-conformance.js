#!/usr/bin/env node
/**
 * Run the LFM shared test cases (spec/conformance/lfm/) against the reference
 * implementation — the Lattice engine for L1, the linter for L2, and a plain
 * CommonMark parser for L0. The cases are the shared part: JSON, written against
 * the spec, so a second implementation can run the same folder with its own
 * adapter. This file is OUR adapter; spec/conformance/lfm/README.md is the format.
 *
 *   node tools/lfm-conformance.js            # run every case, print a table
 *   node tools/lfm-conformance.js <name>…    # run the named cases only
 *
 * Exit 1 when any case fails. The unit tier runs the same cases
 * (test/unit/spec/lfm-conformance.test.js), plus a failing arm.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const MarkdownIt = require('markdown-it');

const ROOT = path.join(__dirname, '..');
const CASES_DIR = path.join(ROOT, 'spec', 'conformance', 'lfm');
const MODES = ['sketch-clean', 'sketch'];

let engine;
let lint;
let notes;
let grammar;
function load() {
  if (engine) return;
  engine = require('../lib/engine');
  lint = require('../lib/authoring/lint.js');
  notes = require('../lib/authoring/notes-core.js');
  grammar = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'docs', 'grammar.json'), 'utf8'));
}

/** Every case in the folder: `<name>.md` beside `<name>.json`. */
function listCases(dir = CASES_DIR) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .filter((name) => fs.existsSync(path.join(dir, `${name}.md`)))
    .sort();
}

function readCase(name, dir = CASES_DIR) {
  return {
    name,
    source: fs.readFileSync(path.join(dir, `${name}.md`), 'utf8'),
    expect: JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8')),
  };
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();

// ── L0: what a Lattice-unaware CommonMark host shows ────────────────────────
// A GFM host special-cases YAML front matter, so the adapter drops it first.
function l0(source) {
  const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const html = new MarkdownIt('commonmark').render(body);
  const doc = new JSDOM(html).window.document;
  return {
    text: text(doc.body),
    rules: doc.querySelectorAll('hr').length,
    codeBlocks: [...doc.querySelectorAll('pre > code')].map((c) => (c.className.match(/language-(\S+)/) || [])[1] || ''),
  };
}

// ── L1: the structure the reference renderer resolves ──────────────────────
function answerOf(li) {
  const markers = grammar.stateMarkers;
  for (const m of Object.values(markers)) if (li.classList.contains(m.semantic) && li.classList.contains('state')) return m.answer;
  return null;
}

function cardsOf(stage) {
  const list = stage.querySelector(':scope > ul, :scope > ol');
  if (!list) return [];
  return [...list.children].map((li) => {
    const nested = li.querySelector(':scope > ul, :scope > ol');
    const own = [...li.childNodes].filter((n) => n !== nested).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim();
    return { title: own, body: nested ? [...nested.children].map(text) : [] };
  });
}

function l1(source) {
  const out = engine.render(source, {});
  const html = typeof out === 'string' ? out : out.html;
  const doc = new JSDOM(html).window.document;
  const sections = [...doc.querySelectorAll('article.lattice > section')];
  const first = sections[0];
  const finish = first ? ([...first.classList].find((c) => c.startsWith('finish-')) || 'finish-none').slice(7) : 'none';
  const logo = first?.querySelector(':scope > img.deck-logo')?.getAttribute('src') ?? null;
  return {
    deck: {
      mode: (first && MODES.find((m) => first.classList.contains(m))) || 'boardroom',
      finish,
      logo,
    },
    slides: sections.map((s) => {
      const tokens = (s.getAttribute('data-class') || '').split(/\s+/).filter(Boolean);
      const stage = s.querySelector('.cell-stage') || s;
      const items = [...stage.querySelectorAll(':scope > ul > li, :scope > ol > li')];
      return {
        component: tokens[0] ?? null,
        modifiers: tokens.slice(1),
        cards: cardsOf(stage),
        states: items.map(answerOf),
        fences: [...s.querySelectorAll('[data-lattice-hydrate]')].map((e) => e.getAttribute('data-lattice-hydrate').replace(/-/g, '')),
        notes: notes.noteBodiesFromHtml(s.outerHTML),
      };
    }),
  };
}

// ── L2: the findings the reference linter emits ─────────────────────────────
function l2(source) {
  return lint.lintText(source).map((f) => ({ rule: f.rule, severity: f.severity, slide: f.slide }));
}

/** Run one case; return the list of failures (empty = pass). */
function runCase(c) {
  load();
  const fails = [];
  const { L0, L1, L2 } = c.expect;
  if (L0) {
    const got = l0(c.source);
    for (const s of L0.visible || []) if (!got.text.includes(s)) fails.push(`L0: "${s}" is not visible`);
    for (const s of L0.hidden || []) if (got.text.includes(s)) fails.push(`L0: "${s}" is visible`);
    if (L0.rules !== undefined && got.rules !== L0.rules) fails.push(`L0: ${got.rules} rules, expected ${L0.rules}`);
    if (L0.codeBlocks && !sameJson(got.codeBlocks, L0.codeBlocks)) fails.push(`L0: code blocks ${JSON.stringify(got.codeBlocks)}, expected ${JSON.stringify(L0.codeBlocks)}`);
  }
  if (L1) {
    const got = l1(c.source);
    if (L1.slideCount !== undefined && got.slides.length !== L1.slideCount) fails.push(`L1: ${got.slides.length} slides, expected ${L1.slideCount}`);
    for (const [k, v] of Object.entries(L1.deck || {})) {
      if (!sameJson(got.deck[k], v)) fails.push(`L1: deck.${k} is ${JSON.stringify(got.deck[k])}, expected ${JSON.stringify(v)}`);
    }
    (L1.slides || []).forEach((want, i) => {
      const slide = got.slides[i];
      if (!slide) { fails.push(`L1: slide ${i + 1} is missing`); return; }
      for (const [k, v] of Object.entries(want)) {
        if (!sameJson(slide[k], v)) fails.push(`L1: slide ${i + 1} ${k} is ${JSON.stringify(slide[k])}, expected ${JSON.stringify(v)}`);
      }
    });
  }
  if (L2) {
    const got = l2(c.source);
    const key = (f) => `${f.rule}|${f.severity}|${f.slide}`;
    const want = (L2.findings || []).map(key).sort();
    const have = got.map(key).sort();
    if (!sameJson(want, have)) fails.push(`L2: findings ${JSON.stringify(have)}, expected ${JSON.stringify(want)}`);
  }
  return fails;
}

module.exports = { CASES_DIR, listCases, readCase, runCase };

if (require.main === module) {
  const names = process.argv.slice(2);
  const cases = (names.length ? names : listCases()).map((n) => readCase(n));
  let failed = 0;
  for (const c of cases) {
    const fails = runCase(c);
    const levels = ['L0', 'L1', 'L2'].filter((l) => c.expect[l]).join(' ');
    console.log(`${fails.length ? 'FAIL' : 'pass'}  §${c.expect.section.padEnd(4)} ${levels.padEnd(9)} ${c.name}`);
    for (const f of fails) console.log(`        ${f}`);
    if (fails.length) failed += 1;
  }
  console.log(`\n${cases.length - failed}/${cases.length} cases pass`);
  process.exit(failed ? 1 : 0);
}
