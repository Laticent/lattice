#!/usr/bin/env node
// Teaching harness for the agentic-engineering course deck.
//
// It measures each chapter against the teaching bar in README.md and prints PASS or FAIL per
// check. It reads only the deck's Markdown, so it runs in a second, with no browser.
//
// The deck's conventions it relies on:
// - A chapter starts at a `divider` slide whose eyebrow begins `Primer`, `Chapter N` or
//   `Reference`. Slides before the first divider (the title) belong to no chapter.
// - The frame slides are found by the end of their eyebrow: `· You'll learn`, `· You need`,
//   `· Common mistakes`, `· Check` and `· Try it`.
// - A slide that introduces a term says so on the last line of its speaker notes:
//   `Teaches: index` (comma-separated for more than one).
// - Terms and their spellings live in terms.json beside this file.
//
// Usage: node harness.mjs [deck.md] [--json]
// Exit code: 0 when every chapter meets the bar, 1 otherwise.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const deckPath = args.find((a) => !a.startsWith('--')) ?? join(here, 'agentic-engineering-course.md');
const terms = JSON.parse(readFileSync(join(here, 'terms.json'), 'utf8')).terms;

// The bar. README.md explains each number; change them there and here together.
export const BAR = {
  slidesMin: 8,
  slidesMax: 16,
  primerMax: 18,
  wordsPerSlide: 45,
  gradeMax: 9,
  storySlidesMin: 2,
  newTermsPerSlide: 1,
};
const STORY = /\b(shop|cart|checkout|Sam)\b/i;
const WORD_EXEMPT = new Set(['code', 'compare-code', 'glossary', 'table']);

/** Split a Marp deck into slides, ignoring `---` inside fenced code. */
export function splitSlides(text) {
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, '');
  const slides = [];
  let cur = [];
  let fence = false;
  for (const line of body.split('\n')) {
    if (line.startsWith('```')) fence = !fence;
    if (line === '---' && !fence) {
      slides.push(cur.join('\n'));
      cur = [];
      continue;
    }
    cur.push(line);
  }
  slides.push(cur.join('\n'));
  return slides.filter((s) => s.trim()).map(parseSlide);
}

/** Drop HTML comments, repeating until none are left so a nested one can't survive. */
function stripComments(text) {
  let prev;
  let out = text;
  do {
    prev = out;
    out = out.replace(/<!--[\s\S]*?-->/g, '');
  } while (out !== prev);
  return out.replace(/<!--/g, '');
}

/** Pull out what the checks need from one slide's Markdown. */
export function parseSlide(md) {
  const cls = (md.match(/<!--\s*_class:\s*([^>]*?)\s*-->/) || [])[1] ?? '';
  const notes = [...md.matchAll(/<!--(?!\s*_)([\s\S]*?)-->/g)].map((m) => m[1].trim()).join('\n');
  let visible = stripComments(md);
  const code = /```[\s\S]*?```/g;
  const hasCode = code.test(visible);
  visible = visible.replace(/```[\s\S]*?```/g, '');
  const lines = visible.split('\n').map((l) => l.trim()).filter(Boolean);
  const eyebrowLine = lines.find((l) => /^`[^`]+`$/.test(l));
  const eyebrow = eyebrowLine ? eyebrowLine.slice(1, -1) : '';
  const prose = lines
    .filter((l) => l !== eyebrowLine)
    .map((l) => l.replace(/^#+\s*|^[-*>]\s+|^\d+\.\s+|^\|/g, '').replace(/[`*_|]/g, ' '))
    .filter((l) => !/^[-:\s]+$/.test(l));
  const teachesLine = notes.split('\n').reverse().find((l) => /^Teaches:/i.test(l.trim()));
  const teaches = teachesLine
    ? teachesLine.replace(/^\s*Teaches:\s*/i, '').replace(/\.$/, '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
    : [];
  return {
    cls: cls.split(/\s+/)[0],
    classes: cls,
    eyebrow,
    prose,
    hasCode,
    notes,
    teaches,
    listLeads: [...stripComments(md).matchAll(/^[-*]\s+(.+)$/gm)].map((m) => m[1].trim()),
  };
}

const termIndex = terms.map((t) => ({
  name: t.name.toLowerCase(),
  re: new RegExp(`\\b(${[t.name, ...(t.forms ?? [])].map(escapeRe).join('|')})\\b`, 'i'),
}));
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/** Registry terms a piece of text uses. */
export function termsIn(text) {
  return termIndex.filter((t) => t.re.test(text)).map((t) => t.name);
}
/** The registry term a "You need" item names, by its lead words. */
function termNamed(item) {
  const lead = item.split(/[—:]/)[0];
  const hit = termIndex.find((t) => t.re.test(lead));
  return hit?.name;
}

/** Flesch–Kincaid grade level. Each line counts as at least one sentence. */
export function fkGrade(lines) {
  let words = 0;
  let sentences = 0;
  let syllables = 0;
  for (const line of lines) {
    const parts = line.split(/[.!?]+/).filter((p) => /[a-z]/i.test(p));
    sentences += Math.max(1, parts.length);
    for (const w of line.match(/[A-Za-z']+/g) ?? []) {
      words += 1;
      syllables += countSyllables(w);
    }
  }
  if (!words) return 0;
  return 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
}
function countSyllables(word) {
  const w = word.toLowerCase().replace(/'/g, '');
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Group slides into chapters at their dividers. */
export function chapters(slides) {
  const out = [];
  let cur = null;
  slides.forEach((s, i) => {
    if (s.cls === 'divider' && /^(Primer|Chapter \d+|Reference)/.test(s.eyebrow)) {
      cur = { name: s.eyebrow.split('·')[0].trim(), title: s.eyebrow, start: i + 1, slides: [] };
      out.push(cur);
    }
    if (cur) cur.slides.push({ ...s, page: i + 1 });
  });
  return out;
}

/** Run every check on one chapter. Returns [{ check, ok, detail }]. */
export function judgeChapter(ch) {
  const results = [];
  const add = (check, ok, detail = '') => results.push({ check, ok, detail });
  const isPrimer = ch.name === 'Primer';
  const isReference = ch.name === 'Reference';
  const find = (suffix) => ch.slides.find((s) => s.eyebrow.endsWith(suffix));

  if (isReference) {
    // A glossary teaches many terms at once, on purpose; only notes are checked here.
    const silent = ch.slides.filter((s) => !s.notes.trim()).map((s) => `p${s.page}`);
    add('Notes', silent.length === 0, silent.length ? `no notes: ${silent.join(', ')}` : '');
    return results;
  }
  const parts = ["· You'll learn", '· Common mistakes', '· Check', '· Try it'];
  if (!isPrimer) parts.push('· You need');
  const missing = parts.filter((p) => !find(p));
  if (!ch.slides.some((s) => s.cls === 'topic')) missing.push('a topic slide');
  add('Chapter frame', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : '');

  const need = find('· You need');
  const known = new Set(need ? need.listLeads.map(termNamed).filter(Boolean) : []);
  const early = [];
  const unused = [];
  const crowded = [];
  for (const s of ch.slides) {
    if (s === need) continue;
    const text = s.prose.join(' ');
    for (const t of termsIn(text)) if (!known.has(t) && !s.teaches.includes(t)) early.push(`${t} (p${s.page})`);
    for (const t of s.teaches) {
      if (!termIndex.some((x) => x.name === t)) unused.push(`${t} is not in terms.json (p${s.page})`);
      else if (!termsIn(text).includes(t)) unused.push(`${t} is taught on p${s.page} but not on the slide`);
      known.add(t);
    }
    if (s.teaches.length > BAR.newTermsPerSlide) crowded.push(`p${s.page}: ${s.teaches.join(', ')}`);
  }
  add('Define before use', early.length === 0 && unused.length === 0, [...new Set(early)].concat(unused).join('; '));
  add('One new idea per slide', crowded.length === 0, crowded.join('; '));

  const heavy = ch.slides
    .filter((s) => !WORD_EXEMPT.has(s.cls) && !s.hasCode)
    .map((s) => ({ page: s.page, words: s.prose.join(' ').split(/\s+/).filter(Boolean).length }))
    .filter((x) => x.words > BAR.wordsPerSlide);
  const count = ch.slides.length;
  const max = isPrimer ? BAR.primerMax : BAR.slidesMax;
  const sizeOk = count >= BAR.slidesMin && count <= max;
  add(
    'Density',
    heavy.length === 0 && sizeOk,
    [sizeOk ? '' : `${count} slides (want ${BAR.slidesMin}–${max})`, ...heavy.map((h) => `p${h.page}: ${h.words} words`)]
      .filter(Boolean)
      .join('; '),
  );

  const grade = fkGrade(ch.slides.filter((s) => !WORD_EXEMPT.has(s.cls)).flatMap((s) => s.prose));
  add('Reading level', grade <= BAR.gradeMax, `grade ${grade.toFixed(1)} (max ${BAR.gradeMax})`);

  const story = ch.slides.filter((s) => STORY.test(s.prose.join(' '))).length;
  add('Running example', story >= BAR.storySlidesMin, `${story} slides use the shop story`);

  const silent = ch.slides.filter((s) => !s.notes.replace(/^Teaches:.*$/im, '').trim()).map((s) => `p${s.page}`);
  add('Notes', silent.length === 0, silent.length ? `no notes: ${silent.join(', ')}` : '');
  return results;
}

function main() {
  const slides = splitSlides(readFileSync(deckPath, 'utf8'));
  const report = chapters(slides).map((ch) => ({ chapter: ch.title, slides: ch.slides.length, results: judgeChapter(ch) }));
  const ok = report.every((c) => c.results.every((r) => r.ok));
  if (asJson) {
    console.log(JSON.stringify({ ok, report }, null, 2));
  } else {
    for (const c of report) {
      const pass = c.results.every((r) => r.ok);
      console.log(`${pass ? 'PASS' : 'FAIL'}  ${c.chapter} (${c.slides} slides)`);
      for (const r of c.results) console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.check}${r.detail ? ` — ${r.detail}` : ''}`);
    }
    console.log(ok ? '\nEvery chapter meets the machine bar.' : '\nSome chapters miss the bar.');
  }
  process.exitCode = ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
