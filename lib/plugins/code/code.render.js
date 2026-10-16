/**
 * lib/plugins/code/code.render.js — the code plugin's renderers: every fenced block no other plugin
 * claims, and the `@code{…}` record line above one (engineering/decisions/2026-10-15-code-plugin.md).
 *
 * The host hands `render` a `base(highlight)`: markdown-it's own fence rule, run with the
 * `highlight` callback given (null for plain text). Going through it keeps the markup every
 * downstream reader keys on — `<pre><code class="language-x">`, the token's attributes, the
 * escaping of an unknown language — exactly what it was before highlighting moved into a plugin.
 *
 * WHAT A RECORD ADDS, all inside the `<pre>` so a layout that sizes its `pre` (`code`,
 * `compare-code`) keeps its composition:
 *   title=   a bar above the code, `<span class="lat-code-title">`, before the `<code>`
 *   numbers  line numbers (`start=` sets the first), drawn from `data-n` by CSS so a copy of the
 *            code never includes them
 *   focus=   the block's own spotlight: those lines full strength, the rest receding
 *   mark=    those lines tinted, nothing dimmed
 *   diff     a leading `+`, `-` or space on each line marks it added, removed or context; the rest
 *            of the line is highlighted in the FENCE'S language, so ```ts with `diff` reads as
 *            TypeScript with bands, which a ```diff fence cannot do
 *   wrap     long lines wrap instead of running off the panel
 *   copy     `data-copy` on the `<pre>`: copy-as-code and copy-as-HTML buttons, drawn in a browser
 *            reading surface only (lib/core/code-copy.mjs)
 *   indent=  `data-indent` on the `<pre>`: a tab draws as wide as the indent (`tab` draws four
 *            columns), not the browser's eight. The formatter reads the same field.
 * Line features share one line model (lib/core/collections.js `splitCodeLines`): line N is source
 * line N whatever a token spans, and a `_focus: line` directive on the slide finds the same lines.
 *
 * A fence a zip plugin owns for this render (the code door, lib/packages/code-door-fence.mjs) stays
 * uncolored and unconfigured: the door finds its block by plain text inside `<pre><code>`, so a
 * grammar that happened to know the name (`tex`, `sql`, `r`) would decide, per body and per surface,
 * whether the plugin drew it. The engine names those fences on the render's `env.plainFences`.
 */

const highlighter = require('./shared/highlighter.js');
const record = require('./shared/record.js');
const { splitCodeLines } = require('../../core/collections.js');

/** The class that gives a block the code panel (code.styles.css). */
const PANEL_CLASS = 'lat-code';

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The deck's `code:` default, read once per render and kept on the render's `env` (markdown-it's
 * per-render object), never in a closure: the parser is memoized across renders.
 */
function deckDefaults(env) {
  if (!env) return {};
  if (env.__codeDefaults === undefined) {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(env.markdown || ''));
    env.__codeDefaults = fm ? record.deckDefaults(fm[1]) : {};
  }
  return env.__codeDefaults;
}

/** The fence's options: the deck default, then the `@code{…}` record on the line above, if any. */
function optionsFor(tokens, idx, env) {
  const prev = tokens && idx > 0 ? tokens[idx - 1] : null;
  const own = prev?.type === 'code_record' ? record.readBody(record.recordBody(prev.content)).value || {} : {};
  return record.merge(deckDefaults(env), own);
}

/** Does any option need the block split into lines? */
const needsLines = (o) => Boolean(o.numbers || o.focus || o.mark || o.diff || o.wrap);

const DIFF_KIND = { '+': 'ins', '-': 'del' };

/**
 * The highlighted inner HTML of the `<code>`, line-wrapped when an option needs lines. Returns ''
 * when the block should be plain (markdown-it then escapes it), exactly as a highlighter does.
 */
function codeHtml(code, lang, o) {
  if (!needsLines(o)) return highlighter.highlight(code, lang);
  // A diff block: peel each line's marker, highlight what is left as one block in the fence's
  // language (so a string or comment spanning lines still reads right), then put the markers back.
  let source = code;
  let markers = null;
  if (o.diff) {
    const rows = code.replace(/\n$/, '').split('\n');
    markers = rows.map((r) => r.charAt(0));
    source = `${rows.map((r) => (r.charAt(0) === '+' || r.charAt(0) === '-' || r.charAt(0) === ' ' ? r.slice(1) : r)).join('\n')}\n`;
  }
  const html = highlighter.highlight(source, lang) || escapeHtml(source);
  const lines = splitCodeLines(html);
  const start = o.start ?? 1;
  return lines.map((line, i) => {
    const n = i + 1;
    const classes = ['ln'];
    if (o.focus) classes.push(o.focus.has(n) ? 'lat-focus' : 'lat-recede');
    if (o.mark?.has(n)) classes.push('lat-mark');
    const attrs = [`class="${classes.join(' ')}"`];
    if (o.numbers) attrs.push(`data-n="${start + i}"`);
    let mark = '';
    if (markers) {
      const m = markers[i];
      const kind = DIFF_KIND[m];
      if (kind) attrs.push(`data-diff="${kind}"`);
      // A line the author left unmarked gets a space so it aligns with the marked ones. That space is
      // the renderer's, not the author's: `data-pad` lets the copy buttons (lib/core/code-copy.mjs)
      // leave it out, so a copied block is the source as written.
      mark = m === '+' || m === '-' || m === ' ' ? `<span class="lat-diff-mark">${m}</span>` : '<span class="lat-diff-mark" data-pad=""> </span>';
    }
    return `<span ${attrs.join(' ')}>${mark}${line}</span>`;
  }).join('\n');
}

/**
 * The `<pre>` open tag markdown-it wrote, with the panel class and the block's own attributes.
 * Its `<pre>` carries no attribute of its own (a fence's attributes go on the `<code>`), so the
 * open tag is exactly `<pre>`; anything else is returned untouched rather than guessed at.
 */
function decorate(html, o, panel) {
  if (!html.startsWith('<pre>')) return html;
  const classes = panel ? [PANEL_CLASS] : [];
  const attrs = [];
  if (o.numbers) {
    classes.push('lat-code-numbers');
    // The widest number decides the number column (code.styles.css), so 98 → 102 does not shift it.
    const last = (o.start ?? 1) + Math.max(0, (o.lineCount || 1) - 1);
    if (String(last).length > 2) attrs.push(`data-digits="${Math.min(String(last).length, 6)}"`);
  }
  if (o.wrap) classes.push('lat-code-wrap');
  // How wide a tab draws (code.styles.css); the formatter indents with the same width.
  if (o.indent) attrs.push(`data-indent="${o.indent}"`);
  if (o.focus) attrs.push('data-focus-style="spotlight"', 'data-focus-axis="line"');
  // Copy buttons: a marker only. The buttons are drawn by lib/core/code-copy.mjs, and only on a
  // surface a person reads in a browser, so no export carries them.
  if (o.copy) attrs.push('data-copy');
  const open = `<pre${classes.length ? ` class="${classes.join(' ')}"` : ''}${attrs.length ? ` ${attrs.join(' ')}` : ''}>`;
  const title = o.title ? `<span class="lat-code-title">${escapeHtml(o.title)}</span>` : '';
  return `${open}${title}${html.slice(5)}`;
}

function render(_token, _ctx, env, base, info = {}) {
  const plain = env?.plainFences;
  // A zip plugin's fence: UNCOLORED and unconfigured, so the code door finds plain text in it, but
  // on the panel like any other block. The door accepts any `<pre>` but an off-marked one
  // (fenceBlocks), and a render that attaches a door must match one that does not, byte for byte,
  // until the door draws.
  if (info.name && plain?.has(info.name)) return decorate(base(null), {}, true);
  // A fence a loaded plugin draws later (Mermaid) keeps its own source styling and takes NO options:
  // a deck's `code: numbers, diff` must not wrap a diagram's source in line spans, which its drawer
  // reads as text (a `diff` gutter put a space before every line of the diagram).
  if (info.drawn) return base((code, lang) => highlighter.highlight(code, lang));
  const o = optionsFor(info.tokens, info.idx, env);
  const html = base((code, lang) => {
    o.lineCount = code.replace(/\n$/, '').split('\n').length;
    return plain?.has(lang) ? '' : codeHtml(code, lang, o);
  });
  return decorate(html, o, true);
}

const codeRenderer = Object.freeze({ highlighter, render });

/** The record line renders nothing: it is the next fence's configuration. */
const renderers = Object.freeze({ code_record: () => '' });

module.exports = { codeRenderer, renderers, PANEL_CLASS };
