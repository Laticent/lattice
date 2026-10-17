/**
 * The 12-slide set (pre-registration §4) and the canonical record of each slide.
 * A slide's canonical record is a list of records: the slide-wide record first, then one
 * `{ pane }` record per `_pane` marker, in source order.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { typeClass } from './catalog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIRECTIVE_KEYS = new Set(['class', 'footer', 'header', 'paginate', 'pane', 'focusSteps', 'focus', 'focusStyle', 'build', 'debug', 'lens', 'track', 'say', 'describe', 'tier', 'backgroundColor', 'color']);

export function splitSlides(text) {
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, '');
  const out = []; let cur = []; let fence = null;
  for (const line of body.split('\n')) {
    const f = line.match(/^ {0,3}(```+|~~~+)/);
    if (f) fence = fence ? (line.trim().startsWith(fence) ? null : fence) : f[1];
    if (!fence && /^---\s*$/.test(line)) { out.push(cur.join('\n')); cur = []; continue; }
    cur.push(line);
  }
  out.push(cur.join('\n'));
  return out;
}

/** comments of a slide -> { records, comments, bodyWithoutComments } */
export function canonical(slide) {
  const slideRec = {}; const records = [slideRec]; const notes = [];
  const body = slide.replace(/<!--([\s\S]*?)-->/g, (_, inner) => {
    const t = inner.trim();
    const m = t.match(/^(_?)([A-Za-z][\w-]*)\s*:\s*([\s\S]*)$/);
    if (m && DIRECTIVE_KEYS.has(m[2])) {
      const [, , key, rawVal] = m; const val = rawVal.trim().replace(/^(["'])([\s\S]*)\1$/, '$2');
      if (key === 'class') Object.assign(slideRec, typeClass(val));
      else if (key === 'pane') records.push({ pane: val });
      else slideRec[key] = val;
    } else if (t === 'stress-slide') slideRec['stress-slide'] = 'yes';
    else if (t) notes.push(...t.split(/\n\s*\n/).map((p) => p.split('\n').map((l) => l.trim()).join('\n').trim()).filter(Boolean));
    return '';
  });
  if (notes.length) slideRec.note = notes;
  return { records: records.filter((r) => Object.keys(r).length), body: body.replace(/\n{3,}/g, '\n\n').trim() };
}

const CATEGORIES = [
  ['layout-only', (r, raw) => only(raw, ['class']) && wordCount(raw) === 1],
  ['layout+variant', (r, raw) => only(raw, ['class']) && r.variant && wordCount(raw) === 2],
  ['register-heavy', (r, raw) => wordCount(raw) >= 6 && !r.unplaced],
  ['class+footer', (r, raw) => only(raw, ['class', 'footer']) && r.footer && !r.unplaced],
  ['class+header+footer', (r, raw) => only(raw, ['class', 'header', 'footer']) && r.header && r.footer],
  ['paginate', (r) => r.paginate],
  ['two-panes', (r, raw, recs) => recs.filter((x) => x.pane).length === 2],
  ['note-with-quote', (r) => r.note?.some((p) => p.includes('"'))],
  ['note-multi-paragraph', (r) => r.note?.length >= 2],
  ['focusSteps', (r) => r.focusSteps],
  ['image-bg', (r, raw) => /\bimage\b/.test(raw.class || '') && /!\[bg/.test('')],
  ['stress-slide', (r) => r['stress-slide']],
];
const raws = (slide) => { const o = {}; for (const m of slide.matchAll(/<!--\s*_?([A-Za-z][\w-]*)\s*:\s*([^>]*?)\s*-->/g)) o[m[1]] = m[2]; return o; };
const only = (raw, keys) => Object.keys(raw).every((k) => keys.includes(k)) && keys.some((k) => k in raw);
const wordCount = (raw) => (raw.class || '').split(/\s+/).filter(Boolean).length;

export function loadAll() {
  const dir = path.join(ROOT, 'examples');
  const all = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
    for (const [i, source] of splitSlides(readFileSync(path.join(dir, f), 'utf8')).entries()) all.push({ file: `examples/${f}`, index: i, source });
  }
  return all;
}

export function chooseTwelve(all = loadAll()) {
  const picked = [];
  for (const [name, test] of CATEGORIES) {
    for (const s of all) {
      const raw = raws(s.source); const { records } = canonical(s.source); const r = records[0] || {};
      let ok = test(r, raw, records);
      if (name === 'image-bg') ok = /\bimage\b/.test(raw.class || '') && /!\[bg/.test(s.source);
      if (ok && !picked.some((p) => p.file === s.file && p.index === s.index)) { picked.push({ ...s, category: name }); break; }
    }
  }
  return picked.map((p) => ({ ...p, ...canonical(p.source) }));
}
