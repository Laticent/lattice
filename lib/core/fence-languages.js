/**
 * fence-languages — what languages does this deck's fenced code actually ask for?
 *
 * Pure and fs-free, so every surface can run it: the engine, the CLI, the
 * browser preview bundle, and the authoring lint. Two jobs:
 *
 *   1. `scanFences(markdown)` — walk the fences and report each one's info-string
 *      tag plus its body. This is what lets the preview load only the highlight.js
 *      grammars a deck genuinely uses instead of shipping all 192 up front.
 *   2. `shellFenceFindings(markdown)` — flag a fence tagged with a SESSION grammar
 *      (`shell` / `console` / `shellsession`) whose body is plainly a script.
 *
 * WHY (2) EXISTS, because it looks like pedantry and is not. In highlight.js,
 * `bash` (aliases `sh`, `zsh`) is a shell-SCRIPT grammar, while `shell` (aliases
 * `console`, `shellsession`) is a terminal-SESSION grammar whose entire job is to
 * mark the `$` prompt in pasted output. Tag a script ```shell and highlight.js
 * does exactly what it was asked and colors almost nothing. Measured on one
 * eleven-line POSIX script, identical text, on every render path:
 *
 *     ```sh     → 15 highlight spans
 *     ```shell  →  2 highlight spans
 *
 * No amount of extra language coverage repairs that — the language IS loaded and
 * IS being applied. It reads as "syntax highlighting is broken", which is why the
 * finding names the two tags and the fix rather than the symptom.
 *
 * The fence walk mirrors lib/core/split-slides.js: the opening run length and
 * character are captured so a fence closes only on a run of the SAME character
 * that is at least as long — a ```` ```` ```` block holding ``` inside it stays
 * one fence. Up to three leading spaces are allowed, per CommonMark.
 */

/** Tags whose grammar is a shell SCRIPT (bash and its aliases). */
const SCRIPT_TAGS = Object.freeze(['bash', 'sh', 'zsh']);
/** Tags whose grammar is a terminal SESSION — prompt-marking, not script-parsing. */
const SESSION_TAGS = Object.freeze(['shell', 'console', 'shellsession']);

/**
 * Lines that only ever appear in a script, never in a captured session. A
 * session's command lines are prefixed with a prompt (`$ `, `# `, `> `), so an
 * unprefixed shebang, keyword, or assignment means the author pasted a script.
 */
const SCRIPT_ONLY_LINE = [
  /^#!/, // shebang
  /^\s*(?:set|export|local|readonly|declare|typeset|source|shift|trap)\s+\S/,
  /^\s*(?:if|for|while|until|case|function)\b/,
  /^\s*(?:fi|done|esac)\s*$/,
  /^\s*[A-Za-z_][A-Za-z0-9_]*=[^\s=]/, // NAME=value assignment
  /^\s*[A-Za-z_][A-Za-z0-9_-]*\s*\(\)\s*\{/, // name() {
];

/** A prompt-prefixed line — the thing a session grammar exists to mark. */
const PROMPT_LINE = /^\s*[$#>]\s+\S/;

/**
 * Normalize a fence info string to its language tag. markdown-it takes the first
 * whitespace-delimited word; attribute syntax (```js {highlight=1}) and casing
 * both have to collapse to the same key the highlighter is asked for.
 */
function normalizeInfo(info) {
  if (typeof info !== 'string') return '';
  const first = info.trim().split(/[\s{,]/)[0] || '';
  return first.toLowerCase();
}

/**
 * Walk every fenced block in a markdown source.
 *
 * @param {string} markdown
 * @returns {Array<{ lang: string, info: string, body: string, line: number }>}
 *   `lang` is the normalized tag ('' for an untagged fence); `line` is the
 *   1-based line number of the opening fence, so a finding can point at it.
 */
/*
 * INDENTATION IS NOT CAPPED AT 3, and that is deliberate rather than sloppy.
 *
 * CommonMark caps a TOP-LEVEL fence at 3 spaces — 4 makes it an indented code
 * block. But inside a list item the content is measured from the list marker, so
 *
 *     - item
 *
 *           ```powershell
 *
 * is a real fence with a real info string, and the engine renders it
 * `class="language-powershell"`. With the cap, `fenceLanguages` returned nothing
 * for it: the Playground never fetched the grammar and the fence stayed
 * monochrome there while the CLI colored it — the exact cross-surface gap this
 * kernel exists to close, reopened for one authoring shape.
 *
 * Tracking list depth properly would mean reimplementing block parsing. Being
 * GENEROUS is the right trade here because of what the two callers do with the
 * answer: `missingLanguages` decides which grammars to FETCH, where a false
 * positive costs one unused ~2 KB file, and `shellFenceFindings` raises an `info`
 * lint. The only way to be wrong is a line inside a top-level indented code block
 * that happens to open with three backticks and a language word — literal text
 * that would be quoting a fence — which costs one speculative fetch.
 */
function scanFences(markdown) {
  if (typeof markdown !== 'string' || markdown.indexOf('```') === -1) {
    if (typeof markdown !== 'string' || markdown.indexOf('~~~') === -1) return [];
  }
  const out = [];
  const lines = markdown.split('\n');
  let open = null; // { char, len, info, line, body[] }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!open) {
      const m = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
      // A ``` fence's info string may not itself contain a backtick (CommonMark);
      // a ~~~ fence's may. Rejecting it here keeps inline code on a lone line from
      // opening a phantom fence.
      if (!m) continue;
      if (m[2][0] === '`' && m[3].indexOf('`') !== -1) continue;
      open = { char: m[2][0], len: m[2].length, indent: m[1].length, info: m[3], line: i + 1, body: [] };
      continue;
    }
    const close = line.match(/^\s*(`{3,}|~{3,})\s*$/);
    if (close && close[1][0] === open.char && close[1].length >= open.len) {
      out.push({ lang: normalizeInfo(open.info), info: open.info.trim(), body: open.body.join('\n'), line: open.line });
      open = null;
      continue;
    }
    open.body.push(line);
  }
  // An unclosed fence still asked for its language — markdown-it renders it to the
  // end of the document, so report it rather than dropping it.
  if (open) out.push({ lang: normalizeInfo(open.info), info: open.info.trim(), body: open.body.join('\n'), line: open.line });
  return out;
}

/**
 * The distinct language tags a deck's fences ask for, in first-appearance order.
 * Untagged fences contribute nothing — markdown-it escapes them as plain text.
 *
 * @param {string} markdown
 * @returns {string[]}
 */
function fenceLanguages(markdown) {
  const seen = new Set();
  const out = [];
  for (const f of scanFences(markdown)) {
    if (!f.lang || seen.has(f.lang)) continue;
    seen.add(f.lang);
    out.push(f.lang);
  }
  return out;
}

/**
 * Which of a deck's fence languages a highlighter does not yet know.
 *
 * Takes the highlight.js instance rather than importing one: the engine, the CLI
 * and the preview bundle each hold their own, registered to different depths, and
 * the whole point is to ask the one that will actually run.
 *
 * @param {string} markdown
 * @param {{ getLanguage: (name: string) => unknown }} hljs
 * @returns {string[]} tags to load, in first-appearance order
 */
function missingLanguages(markdown, hljs) {
  if (!hljs || typeof hljs.getLanguage !== 'function') return [];
  return fenceLanguages(markdown).filter((lang) => !hljs.getLanguage(lang));
}

/**
 * Does this fence body read as a script rather than a captured session?
 *
 * Deliberately conservative in the direction of silence: a body with ANY
 * prompt-prefixed line is a session (mixed prose-and-prompt transcripts are
 * exactly what the session grammar is for), and a script-only line must be
 * present for the answer to be yes. So `$ ./deploy.sh` never trips it, and a
 * bare `echo hello` — legal in both readings — does not either.
 *
 * @param {string} body
 * @returns {boolean}
 */
function looksLikeShellScript(body) {
  if (typeof body !== 'string' || !body.trim()) return false;
  const lines = body.split('\n').filter((l) => l.trim());
  if (lines.some((l) => PROMPT_LINE.test(l))) return false;
  return lines.some((l) => SCRIPT_ONLY_LINE.some((re) => re.test(l)));
}

/**
 * Fences tagged with a session grammar that hold a script. One finding per fence.
 *
 * @param {string} markdown
 * @returns {Array<{ lang: string, line: number }>}
 */
function shellFenceFindings(markdown) {
  const out = [];
  for (const f of scanFences(markdown)) {
    if (SESSION_TAGS.indexOf(f.lang) === -1) continue;
    if (!looksLikeShellScript(f.body)) continue;
    out.push({ lang: f.lang, line: f.line });
  }
  return out;
}

module.exports = {
  SCRIPT_TAGS,
  SESSION_TAGS,
  scanFences,
  fenceLanguages,
  missingLanguages,
  looksLikeShellScript,
  shellFenceFindings,
  normalizeInfo,
};
