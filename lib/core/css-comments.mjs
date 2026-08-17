/**
 * lib/core/css-comments.mjs — "what is a comment in this stylesheet?", answered once.
 *
 * ONE state machine (`eachCssRun`) and two projections of it (`stripCssComments`,
 * `maskCssComments`). Every consumer in the repo that needs to read CSS comment-blind
 * takes one of the two from here.
 *
 * WHY IT IS ITS OWN FILE, AND WHY IT IS `.mjs`. The walk was born inside
 * `lib/core/leading-is.js`, which is CommonJS, and that made it unreachable from the
 * one module that most needed it: `lib/theme/chain.mjs` is ESM *and* part of the
 * browser bundle (`docs/src/lib/theme-fetch.ts`, the Studio's deck export), so it can
 * neither `require()` nor `createRequire` its way to a CJS file without breaking the
 * bundle — which is the exact failure its own docblock records. So `chain.mjs` kept a
 * naive `content.replace(/\/\*[\s\S]*?\*\//g, '')`, and kept the defect the walk
 * exists to prevent. Moving the walk to ESM gives both sides the same answer:
 * `leading-is.js` re-exports it for the five CJS callers, `chain.mjs` imports it
 * directly.
 *
 * PURE AND FS-FREE, so both a browser bundle and a Node tool can hold it.
 *
 * THE DEFECT THIS EXISTS TO PREVENT, stated once for all consumers. Comments and
 * strings are not independent layers: `/*` inside a string is not a comment, and a
 * quote inside a comment is not a string. A regex that splits on comments first and
 * tracks quotes second makes the two layers disagree, so
 *
 *     section::after { content: "/*" }
 *
 * pairs that opener with the NEXT real closer and swallows everything between them.
 * Every consumer here has been bitten by it in its own dialect:
 *
 *   - `tools/check-css-values.js` — where the masking projection was born — reported a
 *     stylesheet CLEAN because the invalid value never reached the oracle. A
 *     verification tool that can blind itself this way is worse than no tool.
 *   - `ThemeStore.resolveThemeImports` (lib/engine/themes.js) hit it from the other
 *     side: a theme's own prose mentioning `@import 'onyx';` RESOLVED, splicing a
 *     palette into a theme that declared no parent (#1696).
 *   - `fontAssetsFor` (lib/core/marp-bundle.js) derives the Marp bundle's font supply
 *     from `url(fonts/…)` refs; a ref sitting in a comment is not a ref.
 *   - `flattenCssImports` (lib/theme/chain.mjs) resolves a caller-supplied `--css`
 *     sheet's imports, and a swallowed range silently drops every import inside it.
 *
 * An UNTERMINATED opener runs to end-of-input, which is what CSS itself does with it.
 */

/**
 * Walk a stylesheet as a sequence of typed RUNS — `code`, `comment`, `string` — in
 * source order, and hand each to `onRun(type, text)`. Concatenating every run in order
 * reproduces the input exactly.
 */
export function eachCssRun(css, onRun) {
  const text = String(css || '');
  let i = 0;
  let codeStart = 0;
  const flushCode = (end) => { if (end > codeStart) onRun('code', text.slice(codeStart, end)); };
  while (i < text.length) {
    const ch = text[i];
    if (ch === '/' && text[i + 1] === '*') {
      flushCode(i);
      const close = text.indexOf('*/', i + 2);
      const end = close < 0 ? text.length : close + 2; // unterminated — runs to EOF
      onRun('comment', text.slice(i, end));
      i = end;
      codeStart = i;
      continue;
    }
    if (ch === '"' || ch === "'") {
      flushCode(i);
      let j = i + 1;
      for (; j < text.length; j++) {
        if (text[j] === '\\') { j++; continue; } // an escaped char can't close the string
        if (text[j] === ch) { j++; break; }
      }
      onRun('string', text.slice(i, Math.min(j, text.length)));
      i = Math.min(j, text.length);
      codeStart = i;
      continue;
    }
    i++;
  }
  flushCode(text.length);
}

/** A stylesheet with its `/* … *​/` comments REMOVED. */
export function stripCssComments(css) {
  let out = '';
  eachCssRun(css, (type, text) => { if (type !== 'comment') out += text; });
  return out;
}

/** Longest run of spaces handed out in one slice; anything longer falls back to `repeat`. */
const SPACES = ' '.repeat(1 << 16);
const spaces = (n) => (n <= SPACES.length ? SPACES.slice(0, n) : ' '.repeat(n));

/**
 * Same bytes as `text.replace(/[^\n]/g, ' ')`, ~50x cheaper: whole runs, not a callback
 * per char. The cost is not cosmetic — the naive form is 132 ms on the 1.5 MB base sheet
 * against 2.6 ms here, on a path the Studio pays per keystroke (#1696).
 */
function blankKeepingNewlines(text) {
  let out = '';
  let from = 0;
  for (;;) {
    const nl = text.indexOf('\n', from);
    if (nl === -1) return out + spaces(text.length - from);
    out += `${spaces(nl - from)}\n`;
    from = nl + 1;
  }
}

/**
 * The same stylesheet with its comments BLANKED to spaces rather than deleted — newlines
 * kept, so every index into the result still points at the same byte of the source, and
 * `result.length === css.length`.
 *
 * That offset-preservation is the whole difference from `stripCssComments`, and it is
 * what a caller needs when it wants to SCAN comment-blind but ACT on the original bytes
 * — `ThemeStore.resolveThemeImports` scans the masked copy and splices against the
 * original, which only works because the offsets agree.
 */
export function maskCssComments(css) {
  let out = '';
  eachCssRun(css, (type, text) => { out += type === 'comment' ? blankKeepingNewlines(text) : text; });
  return out;
}
