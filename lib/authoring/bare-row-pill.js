/**
 * `bare-row-pill` — Node-side lint, deliberately NOT in lint-core.js.
 *
 * It is a migration aid with an end date (2026-10 clean break: see
 * engineering/decisions/2026-10-17-pills-plugin.md), so it lives here, reached by `lintText`
 * (lib/authoring/lint.js, the CLI and `lint:deck`) and kept out of the Studio's lint bundle,
 * whose size ceiling it would have broken. It borrows lint-core's own readers (front-matter
 * chunks, hidden comments, inline-markdown-free lines) rather than re-deriving them.
 */
const { splitTopLevel } = require('./slide-split');
const { slideClassDirectives } = require('../core/class-directive-scan.mjs');
const { normalizeSource } = require('../core/boundary-parser');
const { fmChunks, blankHiddenComments, linesWithoutInlineMarkdown, inlineCodeSpans } = require('./lint-core');
const { resolve: resolveInlinePill } = require('../plugins/pills/pills.inline.js');
const INLINE_CODE_LITERAL_CLASS = 'inline-code-literal';

/**
 * A bare code span where a component used to draw a pill (`bare-row-pill`). Until 2026-10 these
 * components painted a trailing code span as a pill by position; each now takes the pills plugin's
 * notation (`{…}`) and leaves a bare span as plain inline code, so an old deck keeps rendering and
 * its pills quietly turn into code. The table is WHERE each component looked, so the warning
 * fires only where a pill used to be drawn and never on prose code. A warning, never an error:
 * the span may be meant as code, and a deck that has nothing to migrate has nothing to read.
 * engineering/decisions/2026-10-17-pills-plugin.md.
 */
const ROW_PILL_SITES = {
  // the universal rule's reach, measured by rendering one `- Alpha item `TAG`` row under every component
  // class on the old tree (the chart classes read that span as data, so they are not here)
  'cards-stack': 'top', 'cards-grid': 'top', actors: 'top', checklist: 'top', 'list-tabular': 'top',
  inventory: 'top', topic: 'top', cycle: 'top', 'citation-card': 'top', scene: 'top', 'obligation-matrix': 'top',
  'logo-wall': 'nested', kpi: 'any', 'policy-recommendation': 'any',
  'statute-stack': 'statute', 'regulatory-update': 'last', roadmap: 'table',
};
function findBareRowPills(source) {
  const out = [];
  // The deck-level `inline-code: literal` register (or a deck `class:` carrying the literal token) turns
  // the grammar off for the whole deck: a `{…}` renders as braces there, so there is nothing to advise.
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  if (front && (/^\s*inline-code\s*:\s*['"]?literal/im.test(front[1]) || new RegExp(`^\\s*class\\s*:.*${INLINE_CODE_LITERAL_CLASS}`, 'im').test(front[1]))) return [];
  const slides = splitTopLevel(source);
  const directives = slideClassDirectives(source);
  const fm = fmChunks(source);
  const bullet = /^(\s*)((?:[-*+]|\d+[.)])\s+)(.*)$/;
  slides.forEach((slide, idx) => {
    if (idx < fm) return;
    const tokens = (directives[idx]?.payload || '').split(/\s+/).filter(Boolean);
    if (tokens.includes(INLINE_CODE_LITERAL_CLASS)) return;
    const site = Object.keys(ROW_PILL_SITES).find((c) => tokens.includes(c));
    if (!site || (site === 'list-tabular' && !tokens.includes('register'))) return;
    const mode = ROW_PILL_SITES[site];
    const text = blankHiddenComments(normalizeSource(slide));
    const inert = linesWithoutInlineMarkdown(text);
    const lines = text.split('\n');
    // A bare span is a single-backtick span that is not already a notation (`{…}`, `[x]`, `~{…}`, `@…`).
    const bare = (line) => inlineCodeSpans(line).filter((sp) => !sp.raw.startsWith('``') && !/^[{[~@!^]/.test(sp.text));
    // A line that is nothing but one bare span.
    const only = (i) => { const sp = bare(lines[i]); return sp.length === 1 && lines[i].replace(bullet, '$3').trim() === sp[0].raw ? sp[0] : null; };
    const report = (i, span) => {
      const label = span.text.trim();
      const fixed = [`{${label}}`, `{"${label.replace(/[\\"]/g, '\\$&')}"}`].find((f) => resolveInlinePill(f));
      if (inert.has(i) || !fixed) return;
      out.push({
        slide: Math.max(1, idx - fm + 1), rule: 'bare-row-pill', severity: 'warning', classToken: site,
        line: lines[i].trim(), span: span.raw, col: span.start,
        message: `\`${span.text}\` is plain inline code here; \`${site}\` drew a pill from a bare span until 2026-10.`,
        fix: `Write \`${fixed}\` for the pill, or leave it if you meant code.`,
      });
    };
    if (mode === 'table') {
      lines.forEach((l, i) => { if (/^\s*\|/.test(l) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) for (const sp of bare(l)) report(i, sp); });
      return;
    }
    // Rows: a top-level bullet and the nested bullets under it.
    const rows = [];
    let base = -1; // the first bullet's indent: a list may sit up to three spaces in, and its rows share that indent
    lines.forEach((l, i) => {
      const m = bullet.exec(l);
      if (m && base < 0) base = m[1].length;
      if (m && m[1].length <= base && base < 4) rows.push({ top: i, nested: [] });
      else if (m && rows.length) rows[rows.length - 1].nested.push(i);
    });
    for (const { top, nested } of rows) {
      const spans = bare(lines[top]);
      const last = spans[spans.length - 1];
      const lastNested = nested.length > 1 ? only(nested[nested.length - 1]) : null;
      if (mode === 'top' && last && lines[top].slice(last.start + last.raw.length).trim() === '' && lines[top].slice(0, last.start).replace(bullet, '$3').trim()) report(top, last);
      if (mode === 'any') for (const i of [top, ...nested]) for (const sp of bare(lines[i])) report(i, sp);
      if (mode === 'statute') for (const sp of spans) report(top, sp);
      if ((mode === 'statute' || mode === 'last') && lastNested) report(nested[nested.length - 1], lastNested);
      if (mode === 'nested') for (const i of nested) { const sp = only(i); if (sp) report(i, sp); }
    }
  });
  return out;
}

module.exports = { findBareRowPills, ROW_PILL_SITES };
