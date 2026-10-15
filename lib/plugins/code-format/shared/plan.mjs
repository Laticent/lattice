/**
 * lib/plugins/code-format/shared/plan.mjs — which fenced blocks of a deck ask to be formatted, and
 * how a formatted body goes back into the Markdown. Pure: no formatter, no fs. Both surfaces run it,
 * so they rewrite the same source the same way (HARD RULE #1): the CLI through the plugin's bake
 * (code-format.bake.js) and the docs site above its synchronous render (docs/src/lib/ensure-code-format.ts).
 *
 * A block asks when its `@code{…}` record, or the deck's `code:` default, says `format` (a block's
 * `format=off` wins over the default). Top-level fences only: a fence inside a list or a blockquote
 * keeps its author's layout.
 *
 * WHY THE SOURCE IS REWRITTEN rather than the render: the formatted lines are what every reader of
 * the deck then sees — the render, the line model `focus=` and `mark=` count against, the export to
 * Marp — so none of them can disagree about what the block says.
 */

import fenceLanguages from '../../../core/fence-languages.js';
import record from '../../code/shared/record.js';
import { adapterFor } from './adapters.mjs';

const { scanFences } = fenceLanguages;
const RECORD_LINE = /^\s{0,3}`(@code\{[^`\n]*\})`\s*$/;
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** The options a fence's record (and the deck default) give it, by the opener's 0-based line index. */
function optionsAbove(lines, opener, defaults) {
  let i = opener - 1;
  while (i >= 0 && !lines[i].trim()) i -= 1;
  const m = i >= 0 ? RECORD_LINE.exec(lines[i]) : null;
  const own = m ? record.readBody(record.recordBody(m[1])).value || {} : {};
  return record.merge(defaults, own);
}

/**
 * The blocks to format: `{ id, lang, code, opts, from, to, fence }`, where `from`/`to` are the 0-based
 * line indices of the body (inclusive start, exclusive end) and `fence` is the opener's character run.
 * `id` keys a cache: the same block with the same options formats the same way.
 */
export function planFormat(markdown) {
  const src = String(markdown ?? '');
  const fm = FRONT_MATTER.exec(src);
  const defaults = fm ? record.deckDefaults(fm[1]) : {};
  const lines = src.split('\n');
  const jobs = [];
  for (const f of scanFences(src)) {
    const opener = f.line - 1;
    const open = /^( {0,3})(`{3,}|~{3,})/.exec(lines[opener] || '');
    if (!open || open[1].length) continue; // top-level, unindented fences only
    const opts = optionsAbove(lines, opener, defaults);
    if (!opts.format || !f.lang) continue;
    const bodyLines = f.body === '' ? 0 : f.body.split('\n').length;
    const job = {
      lang: f.lang,
      code: `${f.body}\n`,
      opts: { ...(opts.width ? { width: opts.width } : {}), ...(opts.dialect ? { dialect: opts.dialect } : {}) },
      from: opener + 1,
      to: opener + 1 + bodyLines,
      fence: open[2],
      supported: Boolean(adapterFor(f.lang)),
    };
    job.id = JSON.stringify([job.lang, job.opts, job.code]);
    jobs.push(job);
  }
  return jobs;
}

/**
 * Splice the formatted bodies back, last block first so earlier line indices stay valid. A result
 * that failed, or whose text would close its own fence early (a line opening with the fence's run),
 * leaves the block as written. Returns the new Markdown and what was not formatted, and why.
 */
export function applyFormat(markdown, jobs, results) {
  const lines = String(markdown ?? '').split('\n');
  const skipped = [];
  for (let k = jobs.length - 1; k >= 0; k -= 1) {
    const job = jobs[k];
    const r = results.get(job.id);
    if (!r?.ok) {
      skipped.push({ lang: job.lang, line: job.from, error: r?.error || (job.supported ? 'not formatted' : `no formatter here reads ${job.lang}`) });
      continue;
    }
    const body = r.text.replace(/\n+$/, '').split('\n');
    const closes = new RegExp(`^ {0,3}${job.fence[0] === '`' ? '`' : '~'}{${job.fence.length},}`);
    if (body.some((l) => closes.test(l))) {
      skipped.push({ lang: job.lang, line: job.from, error: 'the formatted text would close its own fence' });
      continue;
    }
    lines.splice(job.from, job.to - job.from, ...body);
  }
  return { markdown: lines.join('\n'), skipped: skipped.reverse() };
}

export { wantsFormat } from './detect.mjs';
