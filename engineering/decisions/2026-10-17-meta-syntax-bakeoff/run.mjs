/**
 * Runs the measured criteria of the pre-registration (§3: 1, 2, 3, 4, 8, 9) and the gates (§7).
 *   BAKEOFF_MODULES=/path/with/commonmark+micromark+marked  node run.mjs
 * Writes results.json next to this file. Criteria 5 (writers), 6 and 7 (rubrics) are in grade-writers.mjs
 * and rubrics.mjs; score.mjs combines everything.
 */

import assert from 'node:assert';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { C0, CANDIDATES, toRecords } from './candidates.mjs';
import { canonical, chooseTwelve, loadAll } from './slides.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(import.meta.url);
const ext = createRequire(path.join(process.env.BAKEOFF_MODULES || HERE, 'package.json'));
const MarkdownIt = req('../../../node_modules/markdown-it');
const { marked } = ext('marked');
const commonmark = ext('commonmark');
const { micromark } = ext('micromark');

const same = (a, b) => { try { assert.deepStrictEqual(a, b); return true; } catch { return false; } };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const slides = chooseTwelve();

// ---------- criterion 1: adversarial suite ----------
const VALUES = ['say "hi"', "it's", 'a `tick` b', 'back\\slash', 'end --> here', '<b>x</b>', 'A & B', '{braces}', '[brackets]', '(parens)', 'a, b', 'k=v', 'time: 10:30', '# hash', 'yes', 'no', 'on', 'off', 'null', '1e3', '0123', 'trailing ', ' leading', 'CJK 日本語', 'emoji \u{1F600}', 'é combining', 'nbsp here', 'x'.repeat(4000), '', 'ends with backslash\\', 'quote at end"', '"starts with quote', '| pipe', '- dash start', 'literal \\n here', '@meta{nested}', '```fence```', '[meta]: # "x"', '<!-- c -->'];
const NOTES = [['one paragraph'], ['a "q" and `tick` and --> and {b}', 'second', 'third'], ['line1\nline2'], ['- starts with dash'], ['# starts with hash'], ['trailing '], ['日本語', 'emoji \u{1F600}'], ['x'.repeat(3000)]];
const cases = [
  ...VALUES.map((v) => ({ name: `footer=${JSON.stringify(v).slice(0, 24)}`, rec: { layout: 'content', footer: v } })),
  ...NOTES.map((n, i) => ({ name: `note#${i}`, rec: { layout: 'content', note: n } })),
];
const G1 = { layout: 'content', note: ['first "quoted" paragraph with `tick` and -->', 'second paragraph', 'third paragraph'] };
const roundTrip = (c, rec, eol = '\n') => {
  try { return same(toRecords(c.scan(c.serialize(rec).replace(/\n/g, eol)).items), [rec]); } catch { return false; }
};
const crlf = [{ layout: 'content', footer: 'Q3' }, { layout: 'content', note: ['a', 'b'] }];

// ---------- criterion 3: placements and the door ----------
const A = { layout: 'content', footer: 'Q3' }; const B = { header: 'H' };
const wrapAll = (text, first, rest = first) => text.split('\n').map((l, i) => (i ? rest : first) + l).join('\n');
const placements = (c) => {
  const a = c.serialize(A); const b = c.serialize(B);
  return [
    { name: 'first line', src: `${a}\n\n# T\n`, expect: 'read', want: [A] },
    { name: 'after paragraph, no blank', src: `Intro\n${a}\n\n# T\n`, expect: 'read', want: [A] },
    { name: 'before paragraph, no blank', src: `${a}\nIntro\n`, expect: 'read', want: [A] },
    { name: 'before ![bg] image', src: `${a}\n![bg](x.png)\n`, expect: 'read', want: [A] },
    { name: 'adjacent twin', src: `${a}\n${b}\n\n# T\n`, expect: 'read', want: [{ ...A, ...B }] },
    { name: 'in list item', src: `- item\n\n${wrapAll(a, '- ', '  ')}\n`, expect: 'diag' },
    { name: 'in blockquote', src: wrapAll(a, '> ', '> '), expect: 'diag' },
    { name: 'indented four', src: wrapAll(a, '    ', '    '), expect: 'ignore' },
    { name: 'in other fence', src: `\`\`\`js\n${a}\n\`\`\`\n`, expect: 'ignore' },
  ];
};
function placementScore(c) {
  const out = [];
  for (const p of placements(c)) {
    let ok = false;
    try {
      const r = c.scan(p.src); const recs = toRecords(r.items);
      if (p.expect === 'read') ok = same(recs, p.want);
      else if (p.expect === 'diag') ok = recs.length === 0 && r.diagnostics.length > 0;
      else ok = recs.length === 0 && r.diagnostics.length === 0;
    } catch { ok = false; }
    out.push({ name: p.name, ok });
  }
  return out;
}
/** The door: replace each scanned range with an internal comment of the SAME line count. */
function door(c, src) {
  const lines = src.split('\n'); const { items } = c.scan(src);
  for (const it of items) {
    const n = it.end - it.start + 1;
    lines[it.start] = n === 1 ? '<!-- lat-meta -->' : '<!-- lat-meta';
    for (let k = 1; k < n; k++) lines[it.start + k] = k === n - 1 ? '-->' : '';
    // a one-line replacement must not leave a stray `-->`
  }
  return lines.join('\n');
}
const doorOk = (c) => slides.every((s) => {
  const text = `${s.records.map((r) => c.serialize(r)).join('\n\n')}\n\n${s.body}`;
  const out = door(c, text);
  return out.split('\n').length === text.split('\n').length && c.scan(out.replace(/<!-- lat-meta[\s\S]*?-->/g, '')).items.length === 0;
});

// ---------- criterion 2: other renderers ----------
const parsers = {
  'markdown-it': (t) => new MarkdownIt({ html: true }).render(t),
  marked: (t) => marked.parse(t),
  commonmark: (t) => new commonmark.HtmlRenderer().render(new commonmark.Parser().parse(t)),
  micromark: (t) => micromark(t, { allowDangerousHtml: true }),
};
const visible = (html) => html.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const tags = (html) => (html.match(/<[a-z][^>]*>/gi) || []).length;
function rendering(c) {
  const per = {};
  for (const [pn, render] of Object.entries(parsers)) {
    const extra = []; const tagDelta = [];
    for (const s of slides) {
      const base = render(s.body);
      const withMeta = render(`${s.records.map((r) => c.serialize(r)).join('\n\n')}\n\n${s.body}`);
      extra.push(Math.max(0, visible(withMeta).length - visible(base).length));
      tagDelta.push(Math.abs(tags(withMeta) - tags(base)));
    }
    per[pn] = { extraVisibleChars: extra.reduce((a, b) => a + b, 0) / extra.length, tagDelta: tagDelta.reduce((a, b) => a + b, 0) / tagDelta.length };
  }
  const vals = Object.values(per);
  return { per, meanExtraVisibleChars: vals.reduce((a, v) => a + v.extraVisibleChars, 0) / vals.length };
}

// ---------- criterion 4: size ----------
function size(c) {
  const lines = []; const chars = [];
  for (const s of slides) { const t = s.records.map((r) => c.serialize(r)).join('\n'); lines.push(t.split('\n').length); chars.push(t.length); }
  return { medianLines: median(lines), medianChars: median(chars), totalChars: chars.reduce((a, b) => a + b, 0) };
}

// ---------- criterion 8: Marp compile-back ----------
function marp(c) {
  let ok = 0;
  for (const s of slides) {
    const text = s.records.map((r) => c.serialize(r)).join('\n\n');
    const recs = toRecords(c.scan(text).items);
    const compiled = recs.map((r) => C0.serialize(r)).join('\n');
    if (same(toRecords(C0.scan(compiled).items), s.records)) ok++;
  }
  return { passed: ok, of: slides.length };
}

// ---------- criterion 9: speed ----------
const all = loadAll().map((s) => canonical(s.source));
function speed(c) {
  const doc = all.map((a) => `${a.records.map((r) => c.serialize(r)).join('\n\n')}\n\nbody\n\n---\n`).join('\n');
  for (let i = 0; i < 2; i++) c.scan(doc);
  const t = [];
  for (let i = 0; i < 9; i++) { const a = performance.now(); c.scan(doc); t.push(performance.now() - a); }
  return { medianMs: median(t), chars: doc.length };
}

/** Side measurement, NOT scored: Segno folds names to lowercase, so camelCase keys need a kebab alias. */
const kebab = (k) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const camel = (k) => k.replace(/-([a-z])/g, (_, m) => m.toUpperCase());
const KEBAB_KEYS = new Set(['focusSteps', 'focusStyle', 'backgroundColor']);
const mapKeys = (rec, f) => Object.fromEntries(Object.entries(rec).map(([k, v]) => [f(k), v]));
const aliased = (c) => slides.filter((s) => {
  const text = s.records.map((r) => c.serialize(mapKeys(r, (k) => (KEBAB_KEYS.has(k) ? kebab(k) : k)))).join('\n\n');
  const back = toRecords(c.scan(text).items).map((r) => mapKeys(r, (k) => (KEBAB_KEYS.has(camel(k)) ? camel(k) : k)));
  return same(back, s.records);
}).length;

/** Side measurement, NOT scored: how many of the 39 single-line values appear verbatim in the serialized record (no escaping needed). */
const verbatim = (c) => VALUES.filter((v) => v !== '' && !v.includes('\n')).filter((v) => c.serialize({ layout: 'content', footer: v }).includes(v)).length;

const results = { slides: slides.map((s) => ({ category: s.category, at: `${s.file}#${s.index}` })), candidates: {} };
for (const c of CANDIDATES) {
  const trips = cases.map((k) => ({ name: k.name, ok: roundTrip(c, k.rec) }));
  const crlfOk = crlf.every((r) => roundTrip(c, r, '\r\n'));
  trips.push({ name: 'CRLF endings', ok: crlfOk });
  const twelve = slides.filter((s) => same(toRecords(c.scan(s.records.map((r) => c.serialize(r)).join('\n\n')).items), s.records));
  const pl = placementScore(c);
  results.candidates[c.id] = {
    name: c.name,
    c1_parser: { passed: trips.filter((t) => t.ok).length, of: trips.length, failed: trips.filter((t) => !t.ok).map((t) => t.name) },
    twelveRoundTrip: { passed: twelve.length, of: slides.length, failed: slides.filter((s) => !twelve.includes(s)).map((s) => s.category) },
    c2_rendering: rendering(c),
    c3_jank: { placements: pl, passed: pl.filter((p) => p.ok).length, of: pl.length, doorLinePreserving: doorOk(c) },
    c4_size: size(c),
    c8_marp: marp(c),
    c9_speed: speed(c),
    sideAliasedTwelve: aliased(c),
    sideVerbatimValues: verbatim(c),
    gate1_lossless_notes: roundTrip(c, G1),
    gate2_line_preserving: doorOk(c),
  };
}
writeFileSync(path.join(HERE, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
for (const [id, r] of Object.entries(results.candidates)) {
  console.log(id, r.name.padEnd(30), 'c1', `${r.c1_parser.passed}/${r.c1_parser.of}`, '12rt', `${r.twelveRoundTrip.passed}/12`, 'c2 vis', r.c2_rendering.meanExtraVisibleChars.toFixed(1), 'c3', `${r.c3_jank.passed}/${r.c3_jank.of}`, 'lines', r.c4_size.medianLines, 'chars', r.c4_size.medianChars, 'marp', `${r.c8_marp.passed}/12`, 'ms', r.c9_speed.medianMs.toFixed(2), 'G1', r.gate1_lossless_notes, 'G2', r.gate2_line_preserving);
}
