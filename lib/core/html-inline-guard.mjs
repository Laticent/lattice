/**
 * Keep markdown-it's `html_inline` rule linear on an unclosed `<!--`.
 *
 * Upstream (markdown-it 14.1.1) matches its whole-tag regex against `state.src.slice(pos)`
 * at every `<` in a paragraph, and the regex's comment arm,
 * `<!--(?:[^-]|-[^-]|--[^>])*-->`, scans to the end of the paragraph before it fails on an
 * opener it cannot close. A paragraph of N such openers is N scans of the rest of it:
 * 280 KB of `a <!--` lines took 17 s to render (followups.d/2328-p4 found the lint half;
 * this is the render half), on the browser main thread in the Studio (HARD RULE #22).
 *
 * THE GUARD ANSWERS EXACTLY WHEN THE COMMENT ARM CAN MATCH, not merely whether a `-->`
 * exists. The arm's body is a sequence of three tokens — a non-dash; a dash and a
 * non-dash; two dashes and a non-`>` — so a `-->` the tokens cannot land on does not close
 * it: `---->` holds a `-->` and still fails. An earlier cut checked only for a `-->` past
 * the cursor, and five trailing characters (`---->`) put the render back to 17 s. Found by
 * the independent check on this change.
 *
 * `closable[i]` is 1 when the arm, started with its body at `i`, can reach its `-->`. The
 * tokens are deterministic given the next three characters, so one right-to-left pass
 * fills it for the whole source. At a `<!--` whose body cannot reach a closer, and that is
 * not the empty `<!-->` / `<!--->` form, no arm of the regex can match (a declaration needs
 * a letter after `<!`), so the rule would return false: the guard returns that without
 * asking it. Everything else goes to the original rule untouched.
 *
 * ESM, so `boundary-parser.mjs` can import it under the docs site's Rollup build; the
 * CommonJS engine `require`s it, as lint-core does its other `.mjs` kernels.
 */

const DASH = 0x2d;
const GT = 0x3e;

/** `closable` for one source: which body starts can reach the comment arm's `-->`. */
function closableFrom(src) {
  const n = src.length;
  const closable = new Uint8Array(n + 3);
  for (let i = n - 1; i >= 0; i--) {
    const c = src.charCodeAt(i);
    if (c === DASH && src.charCodeAt(i + 1) === DASH && src.charCodeAt(i + 2) === GT) { closable[i] = 1; continue; }
    if (c !== DASH) { closable[i] = closable[i + 1]; continue; }
    // `-` then a non-dash: the two-character token. (`charCodeAt` past the end is NaN,
    // which is neither a dash nor a character, so the checks below read it as "absent".)
    const c1 = src.charCodeAt(i + 1);
    if (i + 1 < n && c1 !== DASH) { closable[i] = closable[i + 2]; continue; }
    // `--` then a non-`>`: the three-character token.
    if (i + 2 < n && c1 === DASH && src.charCodeAt(i + 2) !== GT) closable[i] = closable[i + 3];
  }
  return closable;
}

export function guardHtmlInline(md) {
  const original = md.inline.ruler.__rules__.find((r) => r.name === 'html_inline');
  if (!original) return;
  const upstream = original.fn;
  let memoSrc = null;
  let memoClosable = null;
  md.inline.ruler.at('html_inline', (state, silent) => {
    const { src, pos } = state;
    if (src.charCodeAt(pos) === 0x3c && src.startsWith('<!--', pos)
      && !src.startsWith('<!-->', pos) && !src.startsWith('<!--->', pos)) {
      if (src !== memoSrc) { memoSrc = src; memoClosable = closableFrom(src); }
      if (!memoClosable[pos + 4]) return false;
    }
    return upstream(state, silent);
  });
}
