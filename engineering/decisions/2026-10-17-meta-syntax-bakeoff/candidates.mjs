/**
 * The six candidates (pre-registration §2). Each has:
 *   serialize(record)  one record -> text
 *   scan(source)       raw source -> { items, diagnostics }   (line-shaped, no markdown parse)
 * The scanner state machine is SHARED so the comparison is about the spelling, not about who
 * wrote the better scanner. A record is { key: string, note: string[] }.
 */

import { parse as segnoParse } from '../../../docs/src/lib/segno/dist/index.mjs';
import { readDirectiveComment } from '../../../lib/core/comment-directive.mjs';
import { classWords, typeClass } from './catalog.mjs';


const DIRECTIVES = new Set(['class', 'footer', 'header', 'paginate', 'pane', 'focusSteps', 'focus', 'focusStyle', 'build', 'debug', 'lens', 'track', 'say', 'describe', 'tier', 'backgroundColor', 'color']);
const KEY = /^[a-z][\w-]*$/;
const entries = (rec) => Object.entries(rec).filter(([, v]) => v !== undefined);
const needsFence = (k, v) => k === 'note' ? v.length > 1 || v.some((p) => p.includes('\n')) : typeof v === 'string' && v.includes('\n');

// ---------- shared scanner ----------
function scan(source, spec) {
  const lines = source.split('\n').map((l) => l.replace(/\r$/, ''));
  const items = []; const diagnostics = [];
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fm = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (fm && fm[1][0] === fence.ch && fm[1].length >= fence.len && !fm[2].trim()) fence = null;
      continue;
    }
    if (/^( {4,}|\t)/.test(line)) continue;
    const cm = line.match(/^(?: {0,3}(?:>[ ]?|[-*+] |\d+[.)] ))+(.*)$/);
    if (cm && spec.starts(cm[1])) { diagnostics.push({ line: i, kind: 'in-container' }); continue; }
    const r = spec.read(lines, i);
    if (r) {
      if (r.diag) diagnostics.push({ line: i, kind: r.diag });
      if (r.fields) items.push({ fields: r.fields, start: i, end: r.end });
      i = Math.max(i, r.end);
      continue;
    }
    if (fm) fence = { ch: fm[1][0], len: fm[1].length };
  }
  return { items, diagnostics };
}

// ---------- the line grammar shared by C3 and C4 (`key: value`, "json" when quoted, `|` block) ----------
function parseBody(lines) {
  const fields = {}; const diags = [];
  const put = (k, v) => {
    if (k === 'note') (fields.note ||= []).push(...(Array.isArray(v) ? v : [v]));
    else { if (k in fields) diags.push('duplicate-key'); fields[k] = Array.isArray(v) ? v.join('\n\n') : v; }
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    const m = l.match(/^([a-z][\w-]*):(?:[ \t]+(.*))?$/);
    if (!m) { diags.push('bad-line'); continue; }
    const [, k, raw = ''] = m;
    const val = raw.replace(/\s+$/, '');
    if (val === '|') {
      const block = [];
      while (i + 1 < lines.length && (/^ {2}/.test(lines[i + 1]) || !lines[i + 1].trim())) block.push(lines[++i].replace(/^ {2}/, ''));
      const paras = block.join('\n').trim().split(/\n\s*\n/).map((p) => p.split('\n').map((x) => x.trimEnd()).join('\n').trim());
      put(k, k === 'note' ? paras : paras.join('\n'));
    } else if (val.startsWith('"')) {
      try { put(k, JSON.parse(val)); } catch { diags.push('bad-quoted-value'); }
    } else put(k, val);
  }
  return { fields, diags };
}
const needsQuote = (v) => /^\s|\s$|^"|^\||\n/.test(v);
const q = (v) => (needsQuote(v) ? JSON.stringify(v) : v);
function serializeBody(rec, { block }) {
  const out = [];
  for (const [k, v] of entries(rec)) {
    if (k === 'note') {
      if (block && (v.length > 1 || v[0].includes('\n'))) {
        out.push('note: |');
        for (const [i, p] of v.entries()) {
          if (i) out.push('');
          for (const l of p.split('\n')) out.push(`  ${l}`);
        }
      } else for (const p of v) out.push(`note: ${q(p)}`);
    } else out.push(v === '' ? `${k}:` : `${k}: ${q(v)}`);
  }
  return out;
}

// ---------- C3: ```meta fence ----------
const metaFence = {
  starts: (t) => /^```meta\b/.test(t),
  read(lines, i) {
    const m = lines[i].match(/^ {0,3}(`{3,})meta\s*(.*)$/);
    if (!m) return null;
    let j = i + 1;
    while (j < lines.length && !(lines[j].trim().startsWith(m[1]) && /^`+\s*$/.test(lines[j].trim()))) j++;
    if (j >= lines.length) return { end: i, diag: 'unterminated-fence' };
    const { fields, diags } = parseBody(lines.slice(i + 1, j));
    if (m[2]) { const w = m[2].split(/\s+/).filter(Boolean); /* info-string shorthand: layout then variants */ fields.layout ||= w[0]; if (w.length > 1) fields.variant ||= w.slice(1).join(' '); }
    return { fields, end: j, diag: diags[0] };
  },
};
export const C3 = {
  id: 'C3', name: '```meta fence',
  serialize: (rec) => ['```meta', ...serializeBody(rec, { block: true }), '```'].join('\n'),
  scan: (s) => scan(s, metaFence),
};

// ---------- C4: [meta]: # "…" ----------
const refDef = {
  starts: (t) => /^\[meta\]:/.test(t),
  read(lines, i) {
    const m = lines[i].match(/^ {0,3}\[meta\]:[ \t]*(?:#|<>)[ \t]*"(.*)$/);
    if (!m) return null;
    const parts = [m[1]]; let j = i;
    const closes = (s) => /(^|[^\\])(\\\\)*"[ \t]*$/.test(s);
    while (!closes(parts[parts.length - 1])) { if (++j >= lines.length) return { end: i, diag: 'unterminated-title' }; parts.push(lines[j]); }
    const last = parts.length - 1; parts[last] = parts[last].replace(/"[ \t]*$/, '');
    const body = parts.join('\n').replace(/\\(["\\])/g, '$1').split('\n');
    const { fields, diags } = parseBody(body);
    return { fields, end: j, diag: diags[0] };
  },
};
export const C4 = {
  id: 'C4', name: '[meta]: # "…"',
  serialize: (rec) => {
    const body = serializeBody(rec, { block: false }).join('\n').replace(/[\\"]/g, '\\$&');
    return `[meta]: # "\n${body}\n"`;
  },
  scan: (s) => scan(s, refDef),
};

// ---------- C1 / C2: @meta{…} record, with the fence as the long-note escape ----------
const segQuote = (v) => (v === '' || /[,={}[\]"|]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/[\\"]/g, '\\$&')}"` : v);
function recordText(rec) {
  const items = [];
  for (const [k, v] of entries(rec)) {
    if (needsFence(k, v)) continue;
    items.push(`${k}=${segQuote(k === 'note' ? v[0] : v)}`);
  }
  return items.length ? `@meta{${items.join(', ')}}` : null;
}
function readRecord(text) {
  const r = segnoParse(text.replace(/^@meta/, ''));
  if (!r.ok || r.item.value.kind !== 'record') return { diag: 'bad-record' };
  const fields = {}; let diag;
  for (const it of r.item.value.items) {
    if (!it.name || it.value.kind !== 'scalar' || !KEY.test(it.name)) { diag = 'bad-item'; continue; }
    if (it.name === 'note') (fields.note ||= []).push(it.value.text); else fields[it.name] = it.value.text;
  }
  return { fields, diag };
}
function hybrid(id, name, wrap, startsRe, lineRe) {
  const spec = {
    starts: (t) => startsRe.test(t) || metaFence.starts(t),
    read(lines, i) {
      const m = lines[i].match(lineRe);
      if (m) { const r = readRecord(m[m.length - 1]); return { fields: r.fields, end: i, diag: r.diag }; }
      return metaFence.read(lines, i);
    },
  };
  return {
    id, name,
    serialize(rec) {
      const line = recordText(rec); const long = {};
      for (const [k, v] of entries(rec)) if (needsFence(k, v)) long[k] = v;
      const parts = [];
      if (line) parts.push(wrap(line));
      if (Object.keys(long).length) parts.push(C3.serialize(long));
      return parts.join('\n');
    },
    scan: (s) => scan(s, spec),
  };
}
const backtickWrap = (t) => {
  const run = '`'.repeat((Math.max(0, ...(t.match(/`+/g) || []).map((x) => x.length)) || 0) + 1);
  return /^`|`$/.test(t) ? `${run} ${t} ${run}` : `${run}${t}${run}`;
};
export const C1 = hybrid('C1', '`@meta{…}`', backtickWrap, /^`+ ?@meta\{/, /^ {0,3}(`+) ?(@meta\{.*\}) ?\1\s*$/);
export const C2 = hybrid('C2', '@meta{…}', (t) => t, /^@meta\{/, /^ {0,3}(@meta\{.*\})\s*$/);

// ---------- C5: <meta …> ----------
const htmlEsc = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const htmlUnesc = (v) => v.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
export const C5 = {
  id: 'C5', name: '<meta …>',
  serialize: (rec) => `<meta ${entries(rec).map(([k, v]) => `${k}="${htmlEsc(k === 'note' ? v.join('\n\n') : v)}"`).join(' ')}>`,
  scan: (s) => scan(s, {
    starts: (t) => /^<meta\b/.test(t),
    read(lines, i) {
      if (!/^ {0,3}<meta\b/.test(lines[i])) return null;
      let text = lines[i].replace(/^ {0,3}/, ''); let j = i;
      const closed = (t) => { let inq = false; for (const ch of t) { if (ch === '"') inq = !inq; else if (ch === '>' && !inq) return true; } return false; };
      while (!closed(text)) { if (++j >= lines.length) return { end: i, diag: 'unterminated-tag' }; text += `\n${lines[j]}`; }
      const fields = {}; let diag;
      for (const m of text.slice(5).matchAll(/([a-zA-Z][\w-]*)\s*=\s*"([^"]*)"/g)) {
        const v = htmlUnesc(m[2]);
        if (m[1] === 'note') fields.note = v.split('\n\n'); else fields[m[1]] = v;
      }
      if (!Object.keys(fields).length) diag = 'empty-meta';
      return { fields, end: j, diag };
    },
  }),
};

// ---------- C0: comments, reader consolidated ----------
export const C0 = {
  id: 'C0', name: '<!-- _key: value --> (control)',
  serialize(rec) {
    const out = []; const cls = classWords(rec);
    if (cls) out.push(`<!-- _class: ${cls} -->`);
    for (const [k, v] of entries(rec)) {
      if (k === 'note') out.push(v.length === 1 && !v[0].includes('\n') ? `<!-- ${v[0]} -->` : `<!--\n${v.join('\n\n')}\n-->`);
      else if (k === 'stress-slide') out.push('<!-- stress-slide -->');
      else if (k === 'pane') out.push(`<!-- _pane: ${v} -->`);
      else if (DIRECTIVES.has(k) && k !== 'class') out.push(`<!-- _${k}: ${v === '' ? '""' : v} -->`);
    }
    return out.join('\n');
  },
  scan: (s) => scan(s, {
    starts: (t) => t.startsWith('<!--'),
    read(lines, i) {
      if (!/^ {0,3}<!--/.test(lines[i])) return null;
      let text = lines[i].trim(); let j = i;
      while (!text.endsWith('-->') && !/-->/.test(text)) { if (++j >= lines.length) return { end: i, diag: 'unterminated-comment' }; text += `\n${lines[j]}`; }
      const end = text.indexOf('-->') + 3; text = text.slice(0, end);
      const d = readDirectiveComment(text, { known: DIRECTIVES, flags: new Set() });
      const fields = {};
      if (d) {
        if (d.key === 'class') Object.assign(fields, typeClass(d.value)); else fields[d.key] = d.value;
      } else {
        const inner = text.slice(4, -3).trim();
        if (inner === 'stress-slide') fields['stress-slide'] = 'yes';
        else if (inner) fields.note = inner.split(/\n\s*\n/).map((p) => p.split('\n').map((x) => x.trim()).join('\n').trim());
      }
      return { fields, end: j };
    },
  }),
};

export const CANDIDATES = [C0, C1, C2, C3, C4, C5];

/** Merge a scan's items into the slide's canonical shape: [slideRecord?, ...paneRecords]. */
export function toRecords(items) {
  const slide = {}; const panes = [];
  for (const { fields } of items) {
    if (fields.pane !== undefined) { panes.push({ pane: fields.pane }); const { pane, ...rest } = fields; void pane; Object.assign(slide, rest); continue; }
    for (const [k, v] of Object.entries(fields)) { if (k === 'note') slide.note = [...(slide.note || []), ...v]; else slide[k] = v; }
  }
  return [...(Object.keys(slide).length ? [slide] : []), ...panes];
}
