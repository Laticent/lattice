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
import { C0, CANDIDATES, duplicateKeys, toRecords } from './candidates.mjs';
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
const NOTES = [['one paragraph'], ['a "q" and `tick` and --> and {b}', 'second', 'third'], ['line1\nline2'], ['- starts with dash'], ['# starts with hash'], ['trailing '], ['日本語', 'emoji \u{1F600}'], ['x'.repeat(3000)], ['before', '```', 'after'], ['~~~ tilde fence line'], ['a ``` b']];
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
    { name: 'in other fence (a later record must still read)', src: `\`\`\`js\n${a}\n\`\`\`\n\n${b}\n`, expect: 'read', want: [B] },
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
/** Visible text of rendered HTML: drop every tag by scanning (no regex filter), decode the four entities we emit. */
const visible = (html) => {
  let out = ''; let inTag = false;
  for (const ch of html) {
    if (ch === '<') { inTag = true; out += ' '; } else if (ch === '>' && inTag) inTag = false; else if (!inTag) out += ch;
  }
  return out.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
};
const STRUCT = /<(h[1-6]|ul|ol|li|table|img|blockquote|hr)[\s>/]/gi;
const signature = (html) => {
  const o = {};
  for (const m of html.matchAll(STRUCT)) o[m[1].toLowerCase()] = (o[m[1].toLowerCase()] || 0) + 1;
  return JSON.stringify(Object.entries(o).sort());
};
/** Each slide is rendered four ways: record + blank line + body; record directly above the body; directly above an image; directly after the body's first paragraph. */
function rendering(c) {
  const per = {}; let extraAll = 0; let nAll = 0; let intactAll = 0;
  for (const [pn, render] of Object.entries(parsers)) {
    let extra = 0; let n = 0; let intact = 0;
    for (const s of slides) {
      const meta = s.records.map((r) => c.serialize(r)).join('\n\n');
      const layouts = [
        [`${meta}\n\n${s.body}`, s.body],
        [`${meta}\n${s.body}`, s.body],
        [`${meta}\n![bg](x.png)\n\n${s.body}`, `![bg](x.png)\n\n${s.body}`],
        [s.body.replace(/\n\n/, `\n${meta}\n\n`), s.body],
      ];
      for (const [withMeta, bare] of layouts) {
        const a = render(bare); const b = render(withMeta);
        extra += Math.max(0, visible(b).length - visible(a).length); n++;
        if (signature(a) === signature(b)) intact++;
      }
    }
    per[pn] = { extraVisibleChars: extra / n, structureIntact: intact / n };
    extraAll += extra; nAll += n; intactAll += intact;
  }
  return { per, meanExtraVisibleChars: extraAll / nAll, structureIntactRate: intactAll / nAll };
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

/** Side measurement, NOT scored: how many of the 39 single-line values appear verbatim in the serialized record (no escaping needed). */
const verbatim = (c) => VALUES.filter((v) => v !== '' && !v.includes('\n')).filter((v) => c.serialize({ layout: 'content', footer: v }).includes(v)).length;

// ---------- gate G3: no silent loss ----------
const recA = { footer: 'Q3' }; const recB = { header: 'H' };
const bad = {
  C0: { malformed: '<!-- _footer Q3 -->', dup: '<!-- _footer: a -->\n<!-- _footer: b -->', trailing: '<!-- _footer: a --> trailing' },
  C1: { malformed: '`@meta{layout=content, footer}`', dup: '`@meta{footer=a, footer=b}`', trailing: '`@meta{footer=a}` trailing' },
  C2: { malformed: '@meta{layout=content, footer}', dup: '@meta{footer=a, footer=b}', trailing: '@meta{footer=a} trailing' },
  C3: { malformed: '```meta\nfooter Q3\n```', dup: '```meta\nfooter: a\nfooter: b\n```', trailing: null },
  C4: { malformed: '[meta]: # "\nfooter Q3\n"', dup: '[meta]: # "\nfooter: a\nfooter: b\n"', trailing: null },
  C5: { malformed: '<meta footer=a>', dup: '<meta footer="a" footer="b">', trailing: '<meta footer="a"> trailing' },
};
function gate3(c) {
  const probes = [];
  const exactOrDiag = (name, src, want) => {
    const r = c.scan(src); const recs = toRecords(r.items);
    probes.push({ name, ok: (want && same(recs, want)) || r.diagnostics.length > 0 || duplicateKeys(r.items).length > 0 });
  };
  exactOrDiag('unterminated record', `${c.serialize(recA).slice(0, -1)}\n\nBody\n`);
  const a1 = c.serialize(recA); const b1 = c.serialize(recB);
  if (!a1.includes('\n') && !b1.includes('\n')) exactOrDiag('two records on one line', `${a1} ${b1}\n`, [{ ...recA, ...recB }]);
  exactOrDiag('malformed field', `${bad[c.id].malformed}\n`);
  exactOrDiag('duplicate key', `${bad[c.id].dup}\n`);
  if (bad[c.id].trailing) exactOrDiag('text after the record on the same line', `${bad[c.id].trailing}\n`);
  return { passed: probes.filter((p) => p.ok).length, of: probes.length, failed: probes.filter((p) => !p.ok).map((p) => p.name) };
}

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
    sideVerbatimValues: verbatim(c),
    gate3_no_silent_loss: gate3(c),
    gate1_lossless_notes: roundTrip(c, G1),
    gate2_line_preserving: doorOk(c),
  };
}
writeFileSync(path.join(HERE, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
for (const [id, r] of Object.entries(results.candidates)) {
  console.log(id, r.name.padEnd(30), 'c1', `${r.c1_parser.passed}/${r.c1_parser.of}`, '12rt', `${r.twelveRoundTrip.passed}/12`, 'c2 vis', r.c2_rendering.meanExtraVisibleChars.toFixed(1), 'intact', r.c2_rendering.structureIntactRate.toFixed(2), 'G3', `${r.gate3_no_silent_loss.passed}/${r.gate3_no_silent_loss.of}`, 'c3', `${r.c3_jank.passed}/${r.c3_jank.of}`, 'lines', r.c4_size.medianLines, 'chars', r.c4_size.medianChars, 'marp', `${r.c8_marp.passed}/12`, 'ms', r.c9_speed.medianMs.toFixed(2), 'G1', r.gate1_lossless_notes, 'G2', r.gate2_line_preserving);
}
