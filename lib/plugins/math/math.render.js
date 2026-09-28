/**
 * lib/plugins/math/math.render.js — the math plugin's RENDERERS: KaTeX.
 *
 * Mirrors marp-core's `math: 'katex'` contract at the surface decks use: inline `$…$` and
 * display `$$…$$`, rendered synchronously to HTML+CSS with katex.renderToString. Synchronous is
 * required: under the headless-Chromium PDF path MathJax's async reflow has raced in the past.
 *
 * The GRAMMAR is in `math.syntax.mjs` (no KaTeX there, so the boundary parser and the docs
 * site's pre-scan can import it). This file owns what a token becomes, and the plugin host
 * (lib/plugins/host.js) attaches `renderers` to the token types `math.manifest.json` declares.
 * Render failures degrade to the raw source text rather than throwing, so a malformed formula
 * never aborts a whole deck render — and the host wraps each renderer as well, so a defect
 * here cannot either.
 */

const { reflowDisplayTex } = require('../../core/tex-linebreak');

let katex = null;
try {
  katex = require('katex');
} catch (_e) {
  /* katex unavailable — math degrades to plain text */
}

/**
 * A BOUNDED MEMO ON THE TYPESET, because the editor re-renders the whole
 * document on every keystroke and almost none of its math has changed.
 *
 * Every cache the preview already has is keyed on the WHOLE DOCUMENT — the deck
 * memo, the slice cache and the sanitize memo in
 * `docs/src/lib/single-slide-render.ts` — so a keystroke misses all of them BY
 * CONSTRUCTION (that file says so itself: "A KEYSTROKE MISSES BY CONSTRUCTION —
 * the markdown changed — and that is correct"). Nothing was keyed on the
 * EXPRESSION, which is the one thing a keystroke usually leaves alone. This is
 * that key.
 *
 * Measured on `math.gallery.md`, whole-deck route: 26.6ms -> 16.7ms per keystroke and
 * 90 -> 0 `katex.renderToString` calls. Both re-derive from the committed bench
 * (`npm run bench`, the edit tier), which is why they are the numbers quoted here.
 *
 * THE REAL STUDIO HAS NOW BEEN DRIVEN, and it corrects the framing above rather
 * than confirming it. `docs/e2e/math-typeset-edit-cost.spec.ts` counts
 * `renderToString` from inside the page, on a production build, by wrapping the
 * module the provider hands `katex-browser-stub.js`. On one math slide:
 *
 *                    cold paint   one keystroke   13-char burst   a new expression
 *   main                 10             10           80..110          131..151
 *   with memo             5              0                 0                 1
 *
 * THE FIRST TWO COLUMNS ARE DETERMINISTIC; THE LAST TWO ARE RANGES, and the
 * distinction is not pedantry. A burst's cost depends on how many keystrokes the
 * debounce coalesces, which moves run to run on a loaded box — two runs of the
 * identical build gave 110 and 80. Quoting either as a point figure would repeat
 * exactly the error this branch already corrects for the bench's wall-clock rows.
 *
 * The headline number also changes shape. The Studio renders ONE SLIDE, not the
 * deck, so "90 typesets per keystroke" was never a number an author paid there —
 * it is the whole-deck route's figure, which is what the bench drives. What an
 * author actually pays is the current slide's count, and that is what goes to 0.
 * The cold row is a second win that was not claimed before: within a single slide
 * the memo also collapses REPEATED expressions, 10 occurrences to 5 distinct.
 *
 * Each run identifies its own bundle behaviorally (the spec's fingerprint line),
 * which is not ceremony: a stale `reuseExistingServer` preview served the
 * memoized build to three consecutive "before" runs and reported the memo's 0 for
 * unmemoized code. The fingerprint is what caught it.
 *
 * A per-SLIDE figure of 2.47ms -> 1.19ms was also taken, but from a throwaway Node
 * harness that RECONSTRUCTS what the Studio's slice route hands the engine. The
 * WALL-CLOCK half of that is still an estimate — the e2e spec counts typesets, not
 * milliseconds — so it stays recorded as one rather than quoted as fact.
 *
 * `renderTex` is a pure function of (src, displayMode, output) — KaTeX bakes no
 * palette, no geometry and no slide context into its output; color arrives from
 * `section.math :is(.katex, mjx-container)` in CSS. So unlike the Mermaid SVG
 * cache (`lib/runtime/index.js`), which needs a per-slide SCOPE KEY because a
 * diagram's ink is baked at render time, this key needs nothing but its three
 * arguments. That is why it is a plain string key and not a composite.
 *
 * ONLY SUCCESSES ARE CACHED, and that is the load-bearing rule rather than a
 * nicety. In the browser `katex` is `lib/engine/katex-browser-stub.js`, which
 * THROWS until the provider bundle registers the real library; the catch below
 * degrades that to escaped source so a deck still renders. Caching that fallback
 * would pin the escaped TeX for the life of the page — the expression would stay
 * unrendered even after KaTeX arrived, turning a transient into a permanent
 * defect. Same reasoning as the Mermaid cache's "errors are never cached so that
 * a fix to a broken diagram is retried on the next edit". A KaTeX *syntax* error
 * under `throwOnError: false` is not an error by this definition — it returns
 * deterministic `.katex-error` markup and is cached like any other success.
 *
 * BOUNDED BY BYTES, NOT BY ENTRY COUNT, because entries differ by two orders of
 * magnitude: an inline `$x$` is ~200 bytes of HTML and one `pmatrix` measured
 * 12.7KB. A count-based bound sized for the common case would hold a few matrix
 * decks' worth of memory; one sized for matrices would be far too loose for
 * inline-heavy prose. Measured over every tracked `.md` that renders at least one
 * formula — 18 of 1474, counted by resetting this memo per file and reading its
 * entry count, which is the only way to count them that does not also count
 * currency prose — the worst is `math.gallery.md` at 94KB across 58 distinct
 * expressions,
 * so the cap below holds the heaviest deck in the repo roughly five times over
 * while staying small beside the ~261KB KaTeX bundle already resident.
 * Eviction is oldest-first; overflow degrades to a re-typeset, never to a wrong
 * answer.
 *
 * TWO WAYS THE BOUND IS LOOSER THAN IT READS, both deliberate, neither able to
 * produce a wrong answer. `memoBytes` counts the VALUE only, so the retained KEY (the
 * TeX source plus its prefix) is uncounted — a few hundred bytes against values in
 * the kilobytes. And a SINGLE entry larger than the whole cap is retained rather than
 * evicted, because the loop stops at `memo.size > 1`: evicting it would empty the
 * memo and re-typeset it on the very next call. Measured, one 900-row `pmatrix` holds
 * ~2.1MB against a 512KB cap until the next miss displaces it. Recorded rather than
 * fixed — counting keys and evicting the last entry buys a tighter number at the cost
 * of a pathological re-typeset loop.
 */
const MEMO_MAX_BYTES = 512 * 1024;
/** @type {Map<string, string>} insertion-ordered LRU: key -> rendered HTML */
const memo = new Map();
let memoBytes = 0;
/** Memo MISSES — i.e. real `katex.renderToString` calls. Read by the counting test. */
let typesets = 0;

/** Test seam: drop the memo so a counting test starts from a known state. */
function _resetMathMemo() {
  memo.clear();
  memoBytes = 0;
  typesets = 0;
}

/** Test seam: `{ entries, bytes, typesets }` — the memo's observable state. */
function _mathMemoStats() {
  return { entries: memo.size, bytes: memoBytes, typesets };
}

/**
 * THE ERROR INK IS A TOKEN. KaTeX writes a failed formula with an INLINE `color:` — its default
 * `errorColor` is `#cc0000`, a hex color on a slide, outside the token system (HARD RULE #3) and
 * blind to the palette and to dark mode. An inline style beats any stylesheet rule without
 * `!important`, so the fix is the option, not a rule. KaTeX writes the option verbatim into
 * `style="color:…"`, and a `var()` there resolves like any other declaration — measured: both
 * failure renderings (a ParseError's `.katex-error` and an undefined control sequence's
 * `mord text` span) carry `color:var(--warn)`. `--warn` is the error ink every plugin error
 * surface uses (`math.styles.css`, `function-plot.styles.css`).
 */
const ERROR_COLOR = 'var(--warn)';

function renderTex(src, displayMode, output = 'htmlAndMathml') {
  if (!katex) return escapeHtml(src);
  const key = `${output}\u0000${displayMode ? 'D' : 'I'}\u0000${src}`;
  const hit = memo.get(key);
  if (hit !== undefined) {
    memo.delete(key); // re-insert so recency is the eviction order
    memo.set(key, hit);
    return hit;
  }
  let out;
  try {
    typesets += 1;
    out = katex.renderToString(src, { displayMode, throwOnError: false, output, errorColor: ERROR_COLOR });
  } catch (_e) {
    // NOT cached — see the header. The browser stub throws until KaTeX lands.
    return escapeHtml(src);
  }
  // A NON-STRING RETURN IS A FAILURE, and it has to be caught HERE rather than left
  // to `out.length` below, for two reasons that are not the same bug.
  //
  // First, this module's contract (see the file header) is that a render failure
  // degrades to the source text and never aborts the deck. `out.length` on a
  // non-string throws a TypeError straight out of `renderTex`, breaking that promise
  // for every caller on every render path.
  //
  // Second, and worse, `memo.set` would already have run: the map would hold an entry
  // whose value is not a string and whose size was never added to `memoBytes`. It can
  // never be served (`hit !== undefined` does not match `undefined`) and never
  // refreshed — and when it reaches the front of the eviction queue,
  // `memo.get(oldest).length` throws inside the eviction loop of a COMPLETELY
  // UNRELATED later expression. One bad provider return would poison the memo for the
  // life of the process.
  //
  // Reachable through `lib/engine/katex-browser-stub.js`, which forwards to a `real`
  // supplied at runtime by whatever called `window.__latticeRegisterKatex` — a
  // partially-loaded UMD or a test double, not necessarily real KaTeX. Found by an
  // independent checker, not by a gate.
  if (typeof out !== 'string') return escapeHtml(src);
  memo.set(key, out);
  memoBytes += out.length;
  while (memoBytes > MEMO_MAX_BYTES && memo.size > 1) {
    const oldest = memo.keys().next().value;
    memoBytes -= memo.get(oldest).length;
    memo.delete(oldest);
  }
  return out;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * ONE display equation → its `<p>`, reflowed onto `aligned` lines when it is too long for
 * anything but a 16:9 slide (`lib/core/tex-linebreak.js`, HARD RULE #1 — the rule lives in
 * one kernel, this is the render seam).
 *
 * THE FALLBACK IS THE CONTRACT. `reflowDisplayTex` rewrites TeX, and a rewrite KaTeX cannot
 * parse would replace an equation with an error box — strictly worse than the overflow it was
 * fixing. So the reflowed source is typeset FIRST and adopted only if it came back clean;
 * anything else falls through to the original, which is the exact bytes the author wrote.
 * `throwOnError: false` means a bad rewrite does not throw, it renders an error, so the check is
 * on the markup rather than on an exception.
 *
 * KATEX HAS TWO FAILURE RENDERINGS AND ONLY ONE OF THEM CARRIES A CLASS. A ParseError becomes
 * `<span class="katex-error">`; an UNDEFINED CONTROL SEQUENCE becomes
 * `<span class="mord text" style="color:var(--warn)">` (KaTeX's `errorColor`, `ERROR_COLOR` above)
 * with the command's literal source as its text and no error class anywhere. Testing `katex-error` alone therefore certified as clean a render
 * carrying a red literal `\Bigra` in the middle of the equation with the group's closing bracket
 * gone — the exact case the delimiter bug in `closerOf` produced. Both signals are tested now.
 * The color is `ERROR_COLOR`, which this file passes as KaTeX's `errorColor`; a false positive
 * (an author writing that exact inline color) costs only the reflow — the author's own source
 * renders instead. Found by the HARD
 * RULE #25 red team, against a real render — the shipped unit test asserted the wrong signal and
 * passed.
 *
 * The second typeset costs nothing in the common case: a reflow only runs on an expression
 * past `REFLOW_BUDGET`, and a FAILED reflow is the only path that typesets twice.
 *
 * `data-math-reflow="N"` is the marker `math.styles.css` keys the multi-line display scale
 * off. It is written ONLY when this pass broke the equation — never for an author's own
 * `aligned` or `pmatrix` — so the scale change reaches exactly the equations that needed it
 * and no slide that fits today moves.
 */
function displayBlock(src, output, reflow) {
  if (reflow) {
    const flow = reflowDisplayTex(src);
    if (flow.lines > 1) {
      const out = renderTex(flow.tex, true, output);
      if (!out.includes('katex-error') && !out.includes(`color:${ERROR_COLOR}`)) {
        return `<p data-math-reflow="${flow.lines}">${out}</p>\n`;
      }
    }
  }
  return `<p>${renderTex(src, true, output)}</p>\n`;
}

// `ctx.options.output` — KaTeX render mode (`createEngine({ mathOutput })`). Default
// 'htmlAndMathml' (matches marp-core's historical default), and NO shipping path asks for anything
// else: `lattice-emulator.js` sets 'htmlAndMathml' explicitly for accessibility, after re-testing
// and refuting the old claim that the hidden MathML inflates `scrollWidth` into a stale overflow
// ring. The only callers of 'html' are TWO unit tests — `test/unit/core/relationship.test.js` and
// `test/unit/core/chart-narration-export-parity.test.js`.
//
// It still matters what 'html' would do, because `lib/core/relationship.js` reads the MathML to
// label a split page's forward pointer: with no `<math>` there is no annotation either — the
// annotation lives INSIDE it — so that reader degrades to KaTeX's per-glyph visual half.
//
// REFLOW — may a display equation be BROKEN across lines? At every family except `wide`, which is
// the autosplit gate (`AUTOSPLIT_APPLIES` in lattice-emulator.js), deliberately: a deck is
// AUTHORED at 16:9, so an equation that fits the box the author had in front of them is one they
// composed, and re-flowing it there would be the engine re-setting a slide to solve a problem
// nobody has. The sizes that need it are the ones the deck was never authored for. It also means
// every 16:9 render is byte-identical with or without the reflow pass.
const outputOf = (ctx) => ctx.options.output || 'htmlAndMathml';

/** The renderers, keyed by the token type each draws — the keys `math.manifest.json` declares. */
const renderers = Object.freeze({
  math_inline: (token, ctx) => renderTex(token.content, false, outputOf(ctx)),
  math_block: (token, ctx) => displayBlock(token.content, outputOf(ctx), ctx.family !== 'wide'),
});

/**
 * The ```math fence — display math spelled the way GitHub, GitLab and most Markdown editors spell
 * it, so a deck written elsewhere typesets here unchanged. Exactly a `$$…$$` block: same typeset,
 * same reflow, same `<p>`. The fence body ends at its closing fence, so its one trailing newline is
 * markdown-it's, not the author's.
 */
const fences = Object.freeze({
  math: (token, ctx) => displayBlock(token.content.replace(/\n$/, ''), outputOf(ctx), ctx.family !== 'wide'),
});

module.exports = { renderers, fences, renderTex, _resetMathMemo, _mathMemoStats };
