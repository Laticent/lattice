/**
 * The cold-start writer test, part 3: grade what the writers wrote.
 *
 *   node grade.mjs <writers dir>        reads <model>.raw.md for every model found; writes grade.json beside this file
 *
 * For each slide that NEEDED settings, the grader finds which carrier the writer used for them:
 *
 *   old       the Marp-style comment the tree reads today: `<!-- _footer: x -->`, `<!-- class: x -->`,
 *             `<!-- _pane: x -->` (a registered directive key, or a pane marker)
 *   record    a typed record in a comment: `<!-- {…} -->` or `<!-- @meta{…} -->` (the design's form)
 *   other     any other structured carrier: a ```meta fence, bare `@meta{…}`, YAML inside the slide,
 *             a comment with an invented key (`<!-- layout: x -->`), or an HTML attribute
 *   none      no carrier at all (the settings were dropped or written as prose)
 *
 * A slide is labeled by its strongest carrier in the order old > record > other > none, because "old"
 * is the quantity the hard cut (design note D3) puts at risk. For the old-form slides it also asks the
 * question the cut turns on: how many of the settings does TODAY's reader recover, field by field,
 * against the settings the bake-off's own corpus slide carries? That is the cost of a hard cut to a
 * deck a model wrote cold: every field the reader recovers today is a field the cut silently drops.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHANNEL_KEYS, KNOWN_KEYS, STRUCTURE_KEYS } from '../../../../lib/core/meta-keys.mjs';
import { comments, isRecordBody, readMarker, readMeta, scanMetaSource } from '../../../../lib/core/meta-record.mjs';
import { splitSlides } from '../slides.mjs';
import { briefs } from './briefs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.argv[2];
if (!DIR) throw new Error('usage: node grade.mjs <writers dir>');

const list = briefs();

/** The writer's reply as twelve slide texts (front matter and an outer fence removed). */
function slidesOf(raw) {
  let text = raw.trim();
  const outer = /^```(?:markdown|md)?\n([\s\S]*)\n```$/.exec(text);
  if (outer) text = outer[1];
  const fm = /^---\n[\s\S]*?\n---\n/.exec(text);
  const frontMatter = Boolean(fm);
  // `splitSlides` drops a leading front-matter block; keep the first slide when there is none.
  const slides = splitSlides(fm ? text : `---\nmarp: true\n---\n${text}`);
  return { slides, frontMatter };
}

/** Every carrier in one slide's text, as a list of labels. */
function carriersOf(slide) {
  const found = [];
  for (const c of comments(slide)) {
    const raw = `<!--${c.body}-->`;
    const dir = readMeta(raw);
    if (dir) { found.push('old'); continue; }
    if (readMarker(raw)) { found.push('other'); continue; }
    if (isRecordBody(c.body)) { found.push('record'); continue; }
    const m = /^_?([A-Za-z][\w-]*)\s*:/.exec(c.body.trim());
    if (m) {
      const key = m[1];
      if (STRUCTURE_KEYS.has(key)) found.push('old'); // `_pane:` / `panes:`, the pane marker syntax
      else if (CHANNEL_KEYS.has(key)) found.push('note'); // say / describe: not a setting
      else if (!KNOWN_KEYS.has(key) && key.length < 24 && !/\s/.test(key) && !/^(note|notes|speaker|todo|tip|remember)$/i.test(key)) found.push('other'); // an invented key
      else found.push('note');
      continue;
    }
    found.push('note');
  }
  for (const re of [/^[ ]{0,3}```+\s*meta\b/m, /@meta\{/, /<(?:section|div|span)\b[^>]*\b(?:class|data-[\w-]+)=/]) {
    const hit = re.exec(slide);
    if (!hit) continue;
    // `@meta{` inside a comment was already counted as a record.
    if (re.source === '@meta\\{' && comments(slide).some((c) => c.body.includes('@meta{'))) continue;
    found.push('other');
  }
  return found;
}

const norm = (key, value) => (key === 'class' ? String(value).split(/\s+/).filter(Boolean).sort().join(' ') : String(value).trim());
/** Directive key -> value of the LAST slide of `text` under today's reader. */
function fieldsOf(text) {
  const { slides } = scanMetaSource(text);
  const resolved = slides[slides.length - 1].resolved;
  return Object.fromEntries([...resolved].map(([k, e]) => [k, norm(k, e.value)]));
}

const writers = readdirSync(DIR).filter((f) => f.endsWith('.raw.md')).map((f) => f.replace(/\.raw\.md$/, '')).sort();
const out = { writers: {}, slideCount: list.length };
for (const w of writers) {
  const meta = existsSync(path.join(DIR, `${w}.meta.json`)) ? JSON.parse(readFileSync(path.join(DIR, `${w}.meta.json`), 'utf8')) : {};
  const { slides, frontMatter } = slidesOf(readFileSync(path.join(DIR, `${w}.raw.md`), 'utf8'));
  const tally = { old: 0, record: 0, other: 0, none: 0, needed: 0, missingSlides: Math.max(0, list.length - slides.length) };
  const fields = { expected: 0, recovered: 0 };
  const perSlide = [];
  list.forEach((b, i) => {
    const text = slides[i] ?? '';
    const carriers = carriersOf(text);
    const needs = b.settings.length > 0;
    const label = carriers.includes('old') ? 'old' : carriers.includes('record') ? 'record' : carriers.includes('other') ? 'other' : 'none';
    if (needs) { tally.needed++; tally[label]++; }
    // The corpus slide's own directives are the expected set; the writer's, read by today's reader, the recovered set.
    const want = fieldsOf(b.source);
    const got = fieldsOf(text);
    if (needs && label === 'old') {
      for (const [k, v] of Object.entries(want)) {
        fields.expected++;
        if (got[k] === v) fields.recovered++;
      }
    }
    perSlide.push({ n: b.n, category: b.category, needsSettings: needs, label, carriers, want, got });
  });
  out.writers[w] = {
    servedBy: Object.keys(meta.modelUsage || {}),
    outputTokens: meta.usage?.output_tokens ?? null,
    costUsd: meta.total_cost_usd ?? null,
    frontMatter,
    slidesReturned: slides.length,
    tally,
    fields,
    perSlide,
  };
}
writeFileSync(path.join(HERE, 'grade.json'), `${JSON.stringify(out, null, 2)}\n`);

const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : 'n/a');
console.log('| writer (served by) | slides needing settings | old form | record | other | none | fields today\'s reader recovers (old-form slides) |');
console.log('|---|---|---|---|---|---|---|');
for (const [w, r] of Object.entries(out.writers)) {
  const t = r.tally;
  console.log(`| ${w} (${r.servedBy.join(', ') || '?'}) | ${t.needed} | ${t.old} (${pct(t.old, t.needed)}) | ${t.record} | ${t.other} | ${t.none} | ${r.fields.recovered} of ${r.fields.expected} |`);
}
