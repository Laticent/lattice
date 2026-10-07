/**
 * live-author-html — how much of a deck's own executable HTML a plain `.html` export keeps live.
 *
 * THE DECISION THIS REPORTS ON. The CLI's plain `.html` (and the `.html` sidecar written beside
 * every PDF, PPTX and PNG) is the page the export renders from, and it keeps the deck's raw HTML
 * as written: markdown-it runs with `html: true` (lib/engine/index.js), so an author's `<script>`
 * and `on*` handlers run in whoever opens the file. That is by design — design/skill.md §Raw HTML
 * documents author script as a feature that paints into the PDF — and the artifact meant for a
 * recipient is `--player`, which sanitizes the slide DOM under a strict CSP
 * (engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md § 10).
 *
 * What was wrong was the SILENCE: the CLI never said the file it wrote runs code. This module
 * counts it so the CLI can say so, once, in the warning `formatLiveAuthorHtmlWarning` builds. It
 * DOES NOT strip anything; the exported bytes are unchanged.
 *
 * WHAT IT COUNTS. Every executable `<script>` that does not carry the engine's marker
 * (`data-lattice-script`, author-deferral-probe.js), every `on…=` attribute on an element, and
 * every `srcdoc` frame or `javascript:` URL (`href`, `src`, `action`, `formaction`, `data`).
 * A `<script type="application/json">` (or any non-JavaScript type) holds data and is skipped.
 * Script and style element BODIES are blanked before the attribute scan (their opening tags stay,
 * so a `<script onload=…>` still counts), so engine JavaScript or
 * CSS that mentions `onerror=` in a string is not counted. It is text matching, not a parse: an
 * attribute VALUE that itself contains ` onclick=` would count once too many. That errs toward
 * warning, which is the safe side for a warning.
 */
const { ENGINE_SCRIPT_ATTR } = require('./author-deferral-probe');

const SCRIPT_OPEN = /<script\b([^>]*)>/gi;
const TYPE_ATTR = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
// The types a browser runs (HTML § "JavaScript MIME type essence match", plus `module`).
const JS_TYPE = /^(?:module|(?:application|text)\/(?:x-)?(?:java|ecma)script|text\/jscript|text\/livescript|text\/javascript1\.[0-5])$/i;
const RAW_TEXT = /(<(script|style)\b[^>]*>)[\s\S]*?<\/\2\s*>/gi;
const TAG = /<[a-z][^\s/>]*([\s/][^>]*)?>/gi;
const HANDLER = /(?:^|[\s"'/])on[a-z]+\s*=/gi;
// A frame's `srcdoc`, and a `javascript:` URL in an attribute a browser navigates or loads.
const URL_RUNS = /(?:^|[\s"'/])(?:srcdoc\s*=|(?:href|xlink:href|src|action|formaction|data)\s*=\s*["']?\s*javascript:)/gi;

/** Does this `<script>`'s attribute text describe a script the browser would run? */
function runs(attrs) {
  const m = attrs.match(TYPE_ATTR);
  if (!m) return true;
  const type = (m[1] ?? m[2] ?? m[3] ?? '').trim();
  return type === '' || JS_TYPE.test(type);
}

/**
 * @param {string} html  the exported document (or any HTML fragment)
 * @returns {{ scripts: number, handlers: number, urls: number }}
 */
function countLiveAuthorHtml(html) {
  const s = String(html || '');
  let scripts = 0;
  for (const m of s.matchAll(SCRIPT_OPEN)) {
    const attrs = m[1] || '';
    if (new RegExp(`(?:^|\\s)${ENGINE_SCRIPT_ATTR}(?:[\\s=]|$)`, 'i').test(attrs)) continue;
    if (runs(attrs)) scripts++;
  }
  const tags = s.replace(RAW_TEXT, '$1');
  let handlers = 0;
  let urls = 0;
  for (const m of tags.matchAll(TAG)) {
    handlers += (m[1] || '').match(HANDLER)?.length || 0;
    urls += (m[1] || '').match(URL_RUNS)?.length || 0;
  }
  return { scripts, handlers, urls };
}

/**
 * The CLI's warning lines, or `[]` when the file runs nothing of the deck's.
 * @param {{ scripts: number, handlers: number, urls?: number }} counts
 * @param {string} file  the path as the CLI prints it
 * @param {{ sidecar?: boolean }} [opts]  true when the `.html` is the sidecar beside another output
 */
function formatLiveAuthorHtmlWarning(counts, file, opts = {}) {
  const { scripts = 0, handlers = 0, urls = 0 } = counts || {};
  if (!scripts && !handlers && !urls) return [];
  const parts = [];
  if (scripts) parts.push(`${scripts} <script>${scripts === 1 ? '' : 's'}`);
  if (handlers) parts.push(`${handlers} on… handler${handlers === 1 ? '' : 's'}`);
  if (urls) parts.push(`${urls} javascript: URL${urls === 1 ? '' : 's'} or srcdoc frame${urls === 1 ? '' : 's'}`);
  const what = opts.sidecar ? `${file} (the HTML sidecar)` : file;
  return [
    `  ⚠ ${what} keeps the deck's own HTML live: ${parts.join(', ').replace(/, ([^,]*)$/, ' and $1')}. Whoever opens the file runs ${scripts + handlers + urls === 1 ? 'it' : 'them'}.`,
    '      To hand the deck to someone, export with --player: it sanitizes the slides and runs under a strict CSP.',
  ];
}

module.exports = { countLiveAuthorHtml, formatLiveAuthorHtmlWarning };
