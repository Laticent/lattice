#!/usr/bin/env node
/**
 * Migrate state-chart slides from the v1 grammar to v2 (the flowchart grammar).
 *
 *   node tools/migrate-state-chart-v1.js [--write] deck.md ...
 *
 * Without `--write` it reports what it would rewrite. This is the tool that moved every
 * shipped deck (62 slides, 432 transitions); it is kept for decks outside this repo,
 * which the export and `lint:deck` warn about (`state-chart-v1-transition`).
 *
 * v1: a numbered list of states; nested bullets whose sole content is `event => N`
 * (N an index or `self`) are transitions, with an optional :::tint after the code;
 * trailing code pills on a state are `start` / `end` / a status word (case-folded);
 * any other nested bullet is reveal detail.
 * v2: the flowchart grammar. Each state is a bullet; a transition is a connection
 * row `- -event-> Target`; detail becomes a blockquote under the state.
 *
 * Every rewrite is VERIFIED: the v2 text is parsed by the real grammar
 * (outlineFromMarkdown + parseFlowchart with the state chart's lead words) and must
 * give the same states (names, order, status, start/end tags), the same transitions
 * (from, to, label) and the same detail count as the v1 parse. A mismatch is reported
 * and the slide is left untouched.
 */
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const { outlineFromMarkdown, parseFlowchart } = require(path.join(ROOT, 'lib/core/flowchart-grammar.js'));

const STATUS = new Set(['on-track', 'done', 'live', 'at-risk', 'warn', 'pilot', 'blocked', 'fail', 'decision', 'deferred']);
const TRANSITION = /^`\s*([^`]*?)\s*=>\s*(\d+|self)\s*`(?:\s*:::([^\s:]+))?\s*$/;

function splitTint(s) {
  const m = /^(.*?)\s*:::([a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)?)\s*$/.exec(s);
  return m ? { rest: m[1], tint: m[2] } : { rest: s, tint: null };
}
// Trailing `code` pills, last first, like v1's stripTrailingPills on the rendered lead.
function trailingPills(s) {
  const pills = [];
  let t = s.trimEnd();
  for (;;) {
    const m = /`([^`<]+)`\s*$/.exec(t);
    if (!m) break;
    pills.unshift(m[1].trim());
    t = t.slice(0, m.index).trimEnd();
  }
  return { label: t.trim(), pills };
}

/** Parse the v1 list lines into a model. */
function parseV1(lines) {
  const states = [];
  const notes = [];
  let cur = null;
  let lastNested = null;
  for (const raw of lines) {
    const st = /^ {0,3}(\d+)[.)]\s+(.*)$/.exec(raw);
    if (st) {
      const { rest, tint } = splitTint(st[2]);
      const { label, pills } = trailingPills(rest);
      let isStart = false, isEnd = false, status = null;
      const unknown = [];
      for (const p of pills) {
        if (p === 'start') isStart = true;
        else if (p === 'end') isEnd = true;
        else if (STATUS.has(p.toLowerCase())) status = p.toLowerCase();
        else unknown.push(p);
      }
      cur = { index: states.length + 1, label, unknown, isStart, isEnd, status, tint, transitions: [], detail: [] };
      states.push(cur);
      lastNested = null;
      continue;
    }
    const nb = /^\s+[-*+]\s+(.*)$/.exec(raw);
    if (nb && cur) {
      const body = nb[1].trim();
      const t = TRANSITION.exec(body);
      if (t) {
        const ev = t[1].split(/\\n|<br\s*\/?>/i).map((x) => x.trim()).join(' ').trim();
        cur.transitions.push({ event: ev, to: t[2] === 'self' ? 'self' : +t[2], tint: t[3] || null });
        lastNested = null;
      } else {
        cur.detail.push(body);
        lastNested = cur.detail;
      }
      continue;
    }
    // A continuation line of the last detail bullet.
    if (lastNested && /^\s{4,}\S/.test(raw)) { lastNested[lastNested.length - 1] += ` ${raw.trim()}`; continue; }
    if (raw.trim() && cur && !/^\s/.test(raw)) notes.push(`stray line: ${raw}`);
  }
  return { states, notes };
}

const tidy = (s) => String(s).replace(/\s+/g, ' ').trim();
// A name the grammar reads back as exactly itself when used as a target.
function safeAsTarget(name, all) {
  if (!name || name.length > 120) return false;
  if (/[`*_[\]<>\\|]/.test(name)) return false;          // markup, escapes
  if (/(^|\s)[-=<]/.test(name)) return false;              // could start an arrow
  if (/\s&\s/.test(name)) return false;                    // would fan out
  if (/^#/.test(name)) return false;
  const k = tidy(name).toLowerCase();
  return all.filter((s) => tidy(s.label).toLowerCase() === k).length === 1;
}
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'state';

/** Emit v2 lines for a parsed v1 machine. Returns { lines, report }. */
function emitV2(model, tintMap) {
  const out = [];
  const report = [];
  const ids = new Map();
  const used = new Set();
  const ref = new Map();
  for (const s of model.states) {
    if (s.unknown.length || !safeAsTarget(s.label, model.states)) {
      let id = slug(s.label).slice(0, 30).replace(/-+$/, '');
      if (!/^[a-z0-9]/.test(id)) id = `s${s.index}`;
      while (used.has(id)) id = `${id}-${s.index}`;
      used.add(id);
      ids.set(s.index, id);
      ref.set(s.index, `#${id}`);
    } else ref.set(s.index, s.label);
  }
  for (const s of model.states) {
    const spans = [];
    const lead = [];
    if (ids.has(s.index)) lead.push(`#${ids.get(s.index)}`);
    let status = s.status;
    if (s.tint) {
      const m = tintMap.state(s.tint, s);
      if (m?.status && !status) status = m.status;
      report.push(`state ${s.index} "${s.label}": tint :::${s.tint} -> ${m?.status ? `status ${m.status}` : 'dropped'}${s.status ? ` (kept its own ${s.status})` : ''}`);
    }
    if (s.isStart) lead.push('start');
    if (s.isEnd) lead.push('end');
    if (status) lead.push(status);
    // One span per word keeps the look of v1's pills; an id must lead its own span.
    for (const w of lead) spans.push(`\`${w}\``);
    // An unknown v1 pill stayed in the name as code; it still does (read as literal code).
    const unknown = s.unknown.map((u) => `\`${u}\``).join(' ');
    out.push(`- ${s.label}${unknown ? ` ${unknown}` : ''}${spans.length ? ` ${spans.join(' ')}` : ''}`);
    for (const t of s.transitions) {
      const to = t.to === 'self' ? s.index : t.to;
      if (!(to >= 1 && to <= model.states.length)) {
        report.push(`state ${s.index} "${s.label}": UNRESOLVED transition \`${t.event} => ${t.to}\` kept as a note`);
        out.push(`  > Unresolved in v1: ${t.event || '(no event)'} => ${t.to}`);
        continue;
      }
      let heavy = false;
      let style = '';
      if (t.tint) {
        const m = tintMap.edge(t.tint, t);
        heavy = !!m?.heavy;
        if (m?.style) style = ` \`${m.style}\``;
        report.push(`state ${s.index} -> ${to} "${t.event}": tint :::${t.tint} -> ${m ? (m.heavy ? 'heavy (main path)' : m.style || 'dropped') : 'dropped'}`);
      }
      const shaft = heavy ? '=' : '-';
      const arrow = t.event ? `${shaft}${t.event}${shaft}>` : `${shaft}>`;
      out.push(`  - ${arrow} ${ref.get(to)}${style}`);
    }
    for (const d of s.detail) out.push(`  > ${d}`);
  }
  return { lines: out, report };
}

/** Verify the v2 text parses to the v1 machine. */
function verify(v1, v2lines) {
  const o = outlineFromMarkdown(v2lines.join('\n'));
  const m = parseFlowchart(o.items, { leadWords: ['start', 'end'] });
  const errs = [];
  for (const d of m.diagnostics) if (d.severity === 'error') errs.push(`grammar error: ${d.rule} ${d.message}`);
  if (m.groups.length) errs.push(`unexpected groups: ${m.groups.map((g) => g.name)}`);
  if (m.shapes.length !== v1.states.length) errs.push(`state count ${m.shapes.length} != ${v1.states.length}`);
  const byId = new Map(m.shapes.map((s, i) => [s.id, i + 1]));
  v1.states.forEach((s, i) => {
    const w = m.shapes[i];
    if (!w) return;
    const want = tidy(`${s.label}${s.unknown.length ? ` ${s.unknown.join(' ')}` : ''}`);
    if (tidy(w.name) !== want) errs.push(`state ${i + 1} name "${w.name}" != "${want}"`);
    const lead = w.lead || [];
    if (lead.includes('start') !== s.isStart) errs.push(`state ${i + 1} start tag`);
    if (lead.includes('end') !== s.isEnd) errs.push(`state ${i + 1} end tag`);
    if (s.status && w.status !== s.status) errs.push(`state ${i + 1} status ${w.status} != ${s.status}`);
  });
  const e1 = [];
  for (const s of v1.states) for (const t of s.transitions) {
    const to = t.to === 'self' ? s.index : t.to;
    if (to >= 1 && to <= v1.states.length) e1.push(`${s.index}>${to}:${tidy(t.event)}`);
  }
  const e2 = m.edges.map((e) => `${byId.get(e.from)}>${byId.get(e.to)}:${tidy(e.label)}`);
  if (e1.join('|') !== e2.join('|')) errs.push(`edges differ:\n    v1 ${e1.join(' ')}\n    v2 ${e2.join(' ')}`);
  const d1 = v1.states.reduce((a, s) => a + s.detail.length, 0);
  const d2 = m.notes.length;
  const unresolved = v1.states.reduce((a, s) => a + s.transitions.filter((t) => { const to = t.to === 'self' ? s.index : t.to; return !(to >= 1 && to <= v1.states.length); }).length, 0);
  if (d1 + unresolved !== d2) errs.push(`detail count ${d2} != ${d1}+${unresolved}`);
  return { errs, model: m };
}

// Default tint mapping: palette tokens onto the v2 vocabulary. A pass tint on a
// transition marks the main path (heavy); a fail tint on a state is the `fail` status.
const TINTS = {
  state: (tint) => {
    const [t] = tint.split('/');
    if (/pass/.test(t)) return { status: 'done' };
    if (/fail/.test(t)) return { status: 'fail' };
    if (/warn/.test(t)) return { status: 'at-risk' };
    if (/info/.test(t)) return { status: 'live' };
    return null;
  },
  edge: (tint) => {
    const [t] = tint.split('/');
    if (/pass/.test(t)) return { heavy: true };
    if (/fail/.test(t)) return { style: ':dashed' };
    return null;
  },
};

/** Rewrite every state-chart slide in one Markdown file. */
function rewriteFile(file, write) {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const out = [];
  const reports = [];
  let i = 0;
  let inStateSlide = false;
  let fence = null;
  let slideNo = 0;
  let migrated = 0;
  // Slides: a line that is exactly `---` outside a fence (the first pair is front matter).
  while (i < lines.length) {
    const line = lines[i];
    const f = /^\s*(```+|~~~+)/.exec(line);
    if (f) { fence = fence ? (line.trim().startsWith(fence) ? null : fence) : f[1]; out.push(line); i++; continue; }
    if (!fence && /^---\s*$/.test(line)) { inStateSlide = false; slideNo++; out.push(line); i++; continue; }
    if (!fence && /<!--\s*_?class:\s*[^>]*\bstate-chart\b/.test(line)) inStateSlide = true;
    if (!fence && inStateSlide && /^ {0,3}\d+[.)]\s+/.test(line)) {
      // Collect the machine: state lines, nested/indented lines and blank lines between them.
      const block = [];
      let j = i;
      while (j < lines.length) {
        const l = lines[j];
        if (/^ {0,3}\d+[.)]\s+/.test(l) || /^\s+\S/.test(l)) { block.push(l); j++; continue; }
        if (l.trim() === '' && j + 1 < lines.length && (/^ {0,3}\d+[.)]\s+/.test(lines[j + 1]) || /^\s+[-*+]\s/.test(lines[j + 1]))) { block.push(l); j++; continue; }
        break;
      }
      const v1 = parseV1(block.filter((l) => l.trim() !== ''));
      const { lines: v2, report } = emitV2(v1, TINTS);
      const { errs } = verify(v1, v2);
      const where = `${path.relative(ROOT, file)}:${i + 1} (slide ${slideNo})`;
      if (errs.length) {
        reports.push(`FAIL ${where}\n  ${errs.join('\n  ')}\n  --- v2 ---\n  ${v2.join('\n  ')}`);
        out.push(...block);
      } else {
        out.push(...v2);
        migrated++;
        for (const r of report) reports.push(`note ${where}: ${r}`);
        for (const n of v1.notes) reports.push(`WARN ${where}: ${n}`);
      }
      i = j;
      inStateSlide = false; // one machine per slide
      continue;
    }
    out.push(line);
    i++;
  }
  if (write && migrated) fs.writeFileSync(file, out.join('\n'));
  return { migrated, reports };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  let total = 0;
  for (const f of args.filter((a) => a !== '--write')) {
    const { migrated, reports } = rewriteFile(path.resolve(f), write);
    total += migrated;
    console.log(`${f}: ${migrated} slide(s)`);
    for (const r of reports) console.log(`  ${r}`);
  }
  console.log(`total: ${total} slide(s) ${write ? 'rewritten' : 'would be rewritten'}`);
}

module.exports = { parseV1, emitV2, verify, rewriteFile };
