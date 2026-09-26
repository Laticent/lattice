/**
 * Keep markdown-it's `html_inline` rule linear on an unclosed `<!--`.
 *
 * Upstream (markdown-it 14.1.1) matches its whole-tag regex against `state.src.slice(pos)`
 * at every `<` in a paragraph, and the regex's comment arm,
 * `<!--(?:[^-]|-[^-]|--[^>])*-->`, scans to the end of the paragraph before it fails on an
 * opener that never closes. A paragraph of N such openers is N scans of the rest of it:
 * 280 KB of `a <!--` lines took 17 s to render (followups.d/2328-p4 found the lint half;
 * this is the render half), on the browser main thread in the Studio (HARD RULE #22).
 *
 * The guard answers ONE case without the regex, and gives the regex's own answer there:
 * the text at `pos` opens `<!--` and there is no `-->` at or after `pos + 2` in the whole
 * inline source. Every comment the regex accepts contains `-->` at or after `pos + 2`
 * (`<!-->` has it at +2, `<!--->` at +3, a full comment at its end), and no other arm of the
 * regex can match text that opens `<!-` (a declaration needs a letter after `<!`). So the
 * rule would return false, and the guard returns false without asking it. Everything else
 * goes to the original rule untouched.
 *
 * The last `-->` of a source is found once per source string, not once per opener.
 *
 * ESM, so `boundary-parser.mjs` can import it under the docs site's Rollup build; the
 * CommonJS engine `require`s it, as lint-core does its other `.mjs` kernels.
 */
export function guardHtmlInline(md) {
  const original = md.inline.ruler.__rules__.find((r) => r.name === 'html_inline');
  if (!original) return;
  const upstream = original.fn;
  let memoSrc = null;
  let memoLastClose = -1;
  md.inline.ruler.at('html_inline', (state, silent) => {
    const { src, pos } = state;
    if (src.charCodeAt(pos) === 0x3c && src.startsWith('<!--', pos)) {
      if (src !== memoSrc) { memoSrc = src; memoLastClose = src.lastIndexOf('-->'); }
      if (memoLastClose < pos + 2) return false;
    }
    return upstream(state, silent);
  });
}

