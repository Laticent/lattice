/**
 * lib/authoring/code-format/plan.mjs — which fenced blocks of a deck to format, and how a formatted
 * body goes back into the Markdown. Pure: no formatter, no fs. Both authoring surfaces run it, so
 * they rewrite the same source the same way (HARD RULE #1): `lattice fmt` (./fmt-cli.mjs) and the
 * Studio's "Format code" command and format-on-blur (docs/src/lib/ensure-code-format.ts).
 *
 * FORMATTING IS AN AUTHORING STEP, NOT A RENDER STEP (engineering/decisions/2026-10-15-code-plugin.md
 * §9, the owner's call after review). The source is rewritten once, where the author sees it, so the
 * editor, the render, `focus=`/`mark=` and the line-range lint all count the same lines, and a
 * formatter upgrade never re-lays a deck nobody re-formatted.
 *
 * WHICH BLOCKS. Two modes:
 *   - `all` (an explicit action: `lattice fmt`, the Studio command) — every top-level fence a
 *     formatter reads, except one whose record says `format=off`;
 *   - otherwise (the Studio's format-on-blur) — the blocks that ASK: their `@code{…}` record, or
 *     the deck's `code:` default, says `format`.
 * Either way a block is left alone when it is nested (a list or a blockquote keeps its author's
 * layout), when another plugin draws its fence (Mermaid, a chart: not code to pretty-print), or when
 * it is a `diff` block (its `+`/`-` markers are not code a formatter can read). A block whose OWN
 * record asked is reported when it is skipped; a deck-wide default passes the rest silently.
 *
 * FOUND BY THE ENGINE'S OWN PARSER, through the code plugin's reader
 * (lib/plugins/code/shared/read-fences.js), so a fence inside an HTML comment or an HTML block is not a
 * fence, a record that continues a sentence is not a record, and a closing fence indented four spaces
 * does not close — exactly as the render reads them.
 */

import fences from '../../plugins/code/shared/read-fences.js';
import record from '../../plugins/code/shared/record.js';
import { PLUGIN_GRAMMAR } from '../../plugins/grammar.generated.mjs';
import table from './languages.js';

const { adapterFor } = table;
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** Fence names a plugin draws or renders itself (and their aliases), lower-case. */
const CLAIMED = new Set(PLUGIN_GRAMMAR.flatMap((g) => Object.entries(g.fences || {})
  .flatMap(([name, f]) => [name, ...(f.aliases || []).map((a) => (typeof a === 'string' ? a : a.name))]))
  .map((n) => n.toLowerCase()));

/** The fence's language: the info string's first word, lower-case. */
const langOf = (info) => String(info || '').trim().split(/\s+/)[0].toLowerCase();

/**
 * The blocks to format: `{ id, lang, code, opts, from, to, fence, asked }`. `from`/`to` are the
 * 0-based line indices of the body (inclusive start, exclusive end), `fence` the opener's run, and
 * `asked` whether the block's own record said `format`. Also `skipped`: blocks left alone that
 * their own record asked to format, with why. `id` keys a cache: the same block formats the same way.
 * @param {string} markdown
 * @param {{ all?: boolean, claimed?: Iterable<string> }} [options]
 *   `claimed` adds fence names another host renders itself (an installed code package's fences)
 */
export function planFormat(markdown, { all = false, claimed = [] } = {}) {
  const src = String(markdown ?? '');
  const fm = FRONT_MATTER.exec(src);
  const defaults = fm ? record.deckDefaults(fm[1]) : {};
  // The front matter's lines are blanked, not removed, so markdown-it's line maps stay the deck's.
  const body = fm ? fm[0].replace(/[^\n]/g, '') + src.slice(fm[0].length) : src;
  const lines = src.split('\n');
  const skip = new Set([...CLAIMED, ...[...claimed].map((n) => String(n).toLowerCase())]);
  const jobs = [];
  const skipped = [];
  for (const t of fences.readFences(body).fences) {
    if (t.nested) continue;
    const lang = langOf(t.info);
    const own = t.record ? record.readBody(record.recordBody(t.record)).value || {} : {};
    const opts = record.merge(defaults, own);
    const asked = own.format === true;
    if (opts.format === false && own.format === false) continue; // `format=off` wins over everything
    if (!all && !opts.format) continue;
    const say = (error) => { if (asked) skipped.push({ lang, line: t.start + 2, error }); };
    if (!lang) { say('the fence names no language'); continue; }
    if (skip.has(lang)) { say(`a plugin draws \`${lang}\` fences; they are not formatted`); continue; }
    if (opts.diff) { say('a diff block keeps its +/- markers; format the code before marking it'); continue; }
    if (!adapterFor(lang)) { say(`no formatter here reads ${lang}`); continue; }
    // markdown-it's map covers the opener through the closer; an unclosed fence runs to the end.
    const closer = lines[t.end - 1] ?? '';
    const closed = t.end - t.start >= 2 && new RegExp(`^ {0,3}${t.markup[0] === '`' ? '`' : '~'}{${t.markup.length},}\\s*$`).test(closer);
    const from = t.start + 1;
    const to = closed ? t.end - 1 : t.end;
    const job = {
      lang,
      code: t.content.endsWith('\n') ? t.content : `${t.content}\n`,
      opts: { ...(opts.width ? { width: opts.width } : {}), ...(opts.dialect ? { dialect: opts.dialect } : {}) },
      from,
      to,
      fence: t.markup,
      asked,
    };
    job.id = JSON.stringify([job.lang, job.opts, job.code]);
    jobs.push(job);
  }
  return { jobs, skipped };
}

/**
 * Splice the formatted bodies back, last block first so earlier line indices stay valid. A result
 * that failed, or whose text would close its own fence early (a line opening with the fence's run),
 * leaves the block as written. Returns the new Markdown, the CHANGES as character ranges of the
 * original (so an editor can apply them as one undoable edit and keep the caret), and what was not
 * formatted, and why — reported for a block that asked, or for any block in `all` mode.
 */
export function applyFormat(markdown, plan, results, { all = false } = {}) {
  const src = String(markdown ?? '');
  const lines = src.split('\n');
  const starts = [0];
  for (const l of lines) starts.push(starts[starts.length - 1] + l.length + 1);
  const skipped = [...plan.skipped];
  const changes = [];
  for (let k = plan.jobs.length - 1; k >= 0; k -= 1) {
    const job = plan.jobs[k];
    const r = results.get(job.id);
    const report = (error) => { if (job.asked || all) skipped.push({ lang: job.lang, line: job.from + 1, error }); };
    if (!r?.ok) { report(r?.error || 'not formatted'); continue; }
    const out = r.text.replace(/\n+$/, '').split('\n');
    const closes = new RegExp(`^ {0,3}${job.fence[0] === '`' ? '`' : '~'}{${job.fence.length},}`);
    if (out.some((l) => closes.test(l))) { report('the formatted text would close its own fence'); continue; }
    const before = lines.slice(job.from, job.to).join('\n');
    const after = out.join('\n');
    if (before === after) continue;
    // A body's character range: its first line's start to its last line's end (no newline).
    const from = starts[job.from];
    const to = job.to > job.from ? starts[job.to] - 1 : from;
    changes.push({ from, to, insert: job.to > job.from ? after : `${after}\n` });
    lines.splice(job.from, job.to - job.from, ...out);
  }
  skipped.sort((a, b) => a.line - b.line);
  return { markdown: lines.join('\n'), changes: changes.reverse(), skipped };
}

/** Cheap: does a deck ask any block to stay formatted? Errs toward yes; the planner decides. */
export function wantsFormat(markdown) {
  const src = String(markdown ?? '');
  return /`@code\{[^`\n]*\bformat\b/.test(src) || /^code:[^\n]*\bformat\b/m.test(src);
}
