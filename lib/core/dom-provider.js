/**
 * dom-provider — parse a rendered-HTML string into a DOM, and serialize it back,
 * using whatever real parser the current environment already has.
 *
 * WHY THIS EXISTS. Every registry transformer has an `applyToDom`; fifteen of them
 * ALSO carry a hand-written `applyToHtml` that re-derives the same restructure with
 * regexes, because the engine path only had a string. Two implementations of one
 * transform is how the compare-code trailing-blockquote defect ended up in both.
 * With a parser available on every path, `applyToHtml` becomes one generic adapter
 * — parse, run the DOM implementation, serialize — and the duplicates can go.
 *
 * WHY THE PARSER IS INJECTED BY ENVIRONMENT RATHER THAN BUNDLED. This runs inside
 * the Studio's per-keystroke render, whose whole edit→paint budget is 11.4ms
 * (measured, 4x CPU throttle — `docs/scripts/frame-baseline.json`). Measured at the
 * per-keystroke unit, which is ONE SLIDE and not a deck:
 *
 *     native DOMParser (Chromium, 4x throttle)   0.100 ms   0.9% of the budget
 *     linkedom (Node)                            0.40  ms
 *     jsdom (Node)                               6.83  ms   11.7x the 0.58ms render
 *
 * Read naively that says "use linkedom". IT IS THE WRONG READING TWICE OVER, and
 * both corrections matter.
 *
 * FIRST: linkedom is unusable here at any speed. It LOWERCASES SVG element names —
 * `<radialGradient>` → `<radialgradient>`, `<clipPath>` → `<clippath>`,
 * `<foreignObject>` → `<foreignobject>` — and SVG element names are case-sensitive,
 * so those are dead elements. Measured 0/5 preserved against jsdom's 5/5 and
 * Chromium's 5/5. Every chart gradient, every clip path and every Mermaid node
 * label (which is a `<foreignObject>`) would have stopped rendering, silently,
 * with the whole test suite green. The speed number was real and it was leading
 * straight off a cliff.
 *
 * SECOND: jsdom's 11.7x is a disqualification for the TYPING LOOP, which is a
 * browser and therefore never reaches this branch at all. On the Node side — the
 * CLI export, one shot — a whole-deck parse costs ~133ms against a PDF render that
 * already spends seconds in Chromium. That is noise.
 *
 * So the split is by environment and it is not a compromise: the browser gets the
 * parser it already has (fast AND correct), Node gets the one that is correct.
 *
 * See engineering/decisions/2026-08-25-studio-edit-paint-budget.md §4.
 */

/**
 * Always parse a WHOLE DOCUMENT, never a fragment, and always read back `body`.
 *
 * The engine emits a fragment (`<article class="lattice">…`) with no `<html>` or
 * `<body>`, and fragment parsing is where the three parsers quietly disagree.
 * Measured on linkedom 0.18: `parseHTML('<article>…</article>')` leaves `body`
 * EMPTY and puts a mangled copy on `documentElement` — with the outermost element
 * dropped. A first cut of this module trusted "whichever root has children" and
 * silently deleted the `<article>` wrapper from every document it touched; the
 * smoke test passed because it asserted the edit had landed and never checked what
 * had gone missing.
 *
 * Wrapping first removes the disagreement: with an explicit skeleton, every parser
 * puts the content in `body` and `body.innerHTML` round-trips the input byte for
 * byte (asserted in the unit test, over attribute quoting, entities, void
 * elements and `style` values).
 */
const DOC_OPEN = '<!DOCTYPE html><html><head></head><body>';
const DOC_CLOSE = '</body></html>';

const wrap = (html) => DOC_OPEN + html + DOC_CLOSE;

/** The browser's own parser. Present in the preview iframe and the emulator's page. */
function browserProvider() {
  if (typeof DOMParser === 'undefined') return null;
  return {
    name: 'DOMParser',
    parse(html) {
      const doc = new DOMParser().parseFromString(wrap(html), 'text/html');
      return { doc, root: doc.body };
    },
  };
}

/**
 * jsdom, for Node — the CLI export and the tests.
 *
 * Required lazily and behind try/catch so this module stays safe to bundle for the
 * browser: esbuild would otherwise pull jsdom into the preview bundle, where it is
 * both enormous and slower than the native parser sitting right there. The browser
 * branch is checked first for exactly that reason.
 */
function nodeProvider() {
  try {
    // eslint-disable-next-line global-require
    const { JSDOM } = require('jsdom');
    return {
      name: 'jsdom',
      parse(html) {
        const doc = new JSDOM(wrap(html)).window.document;
        return { doc, root: doc.body };
      },
    };
  } catch {
    return null;
  }
}

let cached;

/**
 * The best parser available here, or null if there is none.
 *
 * Cached: resolution is a `typeof` check plus at most one `require`, and this is
 * called once per render on the Studio's hot path.
 */
function domProvider() {
  if (cached !== undefined) return cached;
  cached = browserProvider() || nodeProvider() || null;
  return cached;
}

/** Test seam — drop the memo so a spec can force the other branch. */
function __resetDomProvider() {
  cached = undefined;
}

/**
 * Parse `html`, hand the content root to `fn`, and serialize what `fn` leaves behind.
 *
 * Returns the ORIGINAL string unchanged when there is no parser, when parsing
 * yields nothing, or when `fn` throws. That fail-closed contract is deliberate: the
 * caller is a render, and un-transformed HTML still renders (the CSS fallbacks in
 * the component stylesheets exist for exactly this shape) whereas a thrown error
 * loses the whole slide.
 *
 * @param {string} html
 * @param {(root: any, doc: any) => void} fn
 * @returns {string}
 */
function withDom(html, fn) {
  if (typeof html !== 'string' || !html) return html;
  const provider = domProvider();
  if (!provider) return html;
  try {
    const { doc, root } = provider.parse(html);
    if (!root) return html;
    fn(root, doc);
    return root.innerHTML;
  } catch {
    return html;
  }
}

module.exports = { domProvider, withDom, __resetDomProvider };
