/**
 * lib/fonts/face-css.js
 *
 * ONE builder for the engine's `@font-face` rules, over the canonical manifest in
 * `text-faces.js`. Everything that has to put Lattice's own type into a document
 * it does not control goes through here.
 *
 * WHY IT EXISTS. The emulator already carried two near-identical copies — the PDF
 * page's embedded block and the standalone-SVG subset — and #1674 needed a third,
 * for the Mermaid render worker's page. A third copy of "walk TEXT_FACES, find the
 * woff2, base64 it, emit a rule" is how the `font-display` value, the directory
 * fallback, or the family-subset semantics drift apart with nothing watching
 * (HARD RULE #15). One function, three callers.
 *
 * The bytes are always INLINE (`data:` URI) rather than a `file://` URL. A worker
 * page, a standalone SVG and an exported HTML sidecar can all end up somewhere the
 * relative path no longer resolves, and a font that silently fails to load is the
 * exact failure #1674 is about: the measure pass sees a fallback face and the paint
 * pass sees the real one.
 */

const fs = require('node:fs');
const path = require('node:path');
const { TEXT_FACES } = require('./text-faces.js');

/**
 * Where the woff2 actually live. `dist/fonts/` is preferred because it ships in the
 * npm tarball AND is committed in-repo; `assets/fonts/` is the pre-build fallback.
 *
 * @param {string} pkgRoot  The package root to resolve against.
 * @returns {string|null} The directory, or null when neither exists.
 */
function fontDir(pkgRoot) {
  return [path.join(pkgRoot, 'dist', 'fonts'), path.join(pkgRoot, 'assets', 'fonts')]
    .find((d) => fs.existsSync(d)) || null;
}

/**
 * Build raw `@font-face{…}` rules — no `<style>` wrapper, so a caller can put them
 * in a stylesheet, an SVG `<defs>`, or `page.addStyleTag`.
 *
 * @param {string} pkgRoot  The package root the woff2 are resolved against.
 * @param {object} [opts]
 * @param {string[]} [opts.families]  Restrict to these families (case-insensitive).
 *   Omit — or pass an empty list — for every face in the manifest.
 * @param {'swap'|'block'} [opts.display]  `font-display`. Defaults to `swap`, which
 *   is what both emulator callers shipped. A caller that AWAITS `document.fonts`
 *   before it measures anything is unaffected either way.
 * @returns {string} Concatenated rules, or `''` when no woff2 could be found.
 */
function fontFaceCss(pkgRoot, { families, display = 'swap' } = {}) {
  const dir = fontDir(pkgRoot);
  if (!dir) return '';
  const want = new Set((families || []).map((f) => String(f).toLowerCase()));
  const rules = [];
  for (const { family, weight, style, file } of TEXT_FACES) {
    if (want.size && !want.has(family.toLowerCase())) continue;
    const fp = path.join(dir, `${file}.woff2`);
    if (!fs.existsSync(fp)) continue;
    const b64 = fs.readFileSync(fp).toString('base64');
    rules.push(
      `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};` +
      `font-display:${display};src:url(data:font/woff2;base64,${b64}) format('woff2');}`,
    );
  }
  return rules.join('');
}

/**
 * The families `fontFaceCss(pkgRoot)` would ACTUALLY emit — the manifest filtered by the
 * same `existsSync` test that function makes, so the two cannot disagree about which
 * faces the document really carries. That distinction matters: a caller that trusts the
 * bare manifest can claim a family the base64 block skipped (its woff2 missing from
 * disk), and `dropCoveredSheetFaces` would then delete the stylesheet's copy of a face
 * NOTHING supplies.
 *
 * Reading the families back out of the emitted CSS is equally authoritative and was the
 * first implementation — but that CSS is ~845 KB of base64, and scanning it to recover
 * five names cost 60-70 ms on every single render. 17 `existsSync` calls cost nothing.
 * (Measured; second HARD RULE #25 checker.)
 *
 * @param {string} pkgRoot  The package root the woff2 are resolved against.
 * @returns {string[]}
 */
function emittedFamilies(pkgRoot) {
  const dir = fontDir(pkgRoot);
  if (!dir) return [];
  const out = [];
  for (const { family, file } of TEXT_FACES) {
    if (!fs.existsSync(path.join(dir, `${file}.woff2`))) continue;
    if (!out.includes(family)) out.push(family);
  }
  return out;
}

/**
 * Every distinct family the manifest carries, in manifest order, deduped. The
 * Mermaid worker uses it to drive `document.fonts.load()` per family — a face that
 * is merely DECLARED is not loaded, and an unloaded face measures as its fallback.
 *
 * @returns {string[]}
 */
function fontFamilies() {
  return [...new Set(TEXT_FACES.map((f) => f.family))];
}

/**
 * Drop the `@font-face` rules an INLINED stylesheet no longer needs.
 *
 * THE DEFECT. A stylesheet's relative `url()` resolves against THE STYLESHEET.
 * `dist/lattice.css` is authored for that — its 37 self-hosted faces are
 * `url('fonts/<file>.woff2')`, correct for a consumer who `<link>`s it out of `dist/`
 * beside the `dist/fonts/` the build writes. The export never links it: it INLINES the
 * bytes into the deck document, which silently rebases every relative `url()` onto the
 * OUTPUT directory. Measured on a real sidecar: 74 declared faces, 37 `loaded` + 37
 * `error`, every error an `ERR_FILE_NOT_FOUND`, on every navigation of every export.
 *
 * It never SHOWED because each doomed face has a working twin in the same document — the
 * engine's own faces are base64-inlined by `fontFaceCss` above, KaTeX's arrive through a
 * `<link>` to `katex.min.css` (which DOES resolve relatively, because it is linked). The
 * doomed copies are declared last and would win the match, but they fail, and Chromium
 * falls back within the family group. So the export was correct by accident, resting on
 * fallback behavior nothing documented and nothing gated.
 *
 * WHAT THIS DOES, AND THE ONE THING IT DELIBERATELY DOES NOT.
 *
 * It drops a `@font-face` whose src is relative AND whose family the caller lists in
 * `covered` — a face that can only cost a doomed fetch. It leaves everything else BYTE
 * FOR BYTE, including an uncovered face whose relative url is equally doomed.
 *
 * An earlier cut also REBASED those uncovered faces onto the stylesheet's own directory,
 * on the theory that it made the "no `assets/` in the tarball" fallback work. Withdrawn,
 * for two reasons found by the HARD RULE #25 checker:
 *   1. **It could not help the case it named.** `fontDir()` returns null — the condition
 *      that empties the base64 block — only when NEITHER `dist/fonts/` nor `assets/fonts/`
 *      exists, and `dist/fonts/` is exactly where a default-sheet rebase would have
 *      pointed. The fallback it claimed to fix is unreachable by construction.
 *   2. **It opened a file-disclosure primitive.** `lib/export/html-player.js`'s
 *      `inlineFileUrls` rewrites `url(file://…)` inside a `<style>` to a base64 `data:`
 *      URI — so rebasing turned any relative url in a caller's `--css` sheet into an
 *      arbitrary local-file read baked into the shipped `--player` HTML. Reproduced end
 *      to end with a canary file. That function's own docblock already warns a hosted
 *      bake path must gate `file://` inlining; widening the vector from deck markup to
 *      the stylesheet, silently, was the opposite of that.
 * Leaving an uncovered face alone is the status quo — it was already broken and is no
 * more broken now. Making it work is a separate change with a trust boundary to settle.
 *
 * DROPPING, NOT MAKING THEM RESOLVE, IS ALSO THE FAST ANSWER, and that was measured
 * before it was chosen: rebasing all 37 so they load really fetches 37 woff2 the document
 * already carries inline — 405 ms per navigation, against 229 ms for the broken status
 * quo and 204 ms for dropping them.
 *
 * @param {string} cssText  The stylesheet's text, as it will be inlined.
 * @param {object} [opts]
 * @param {string[]} [opts.covered]  Families the document already supplies another way.
 * @param {boolean|((span: string) => boolean)} [opts.validate]  Second-opinion every span
 *   before removing it (default true → `spanValidator`). `false` skips it; a FUNCTION
 *   replaces it, which is how the refusal path is tested — see the note at its use.
 * @returns {{css: string, dropped: number, refused: number}}
 */
function dropCoveredSheetFaces(cssText, { covered = [], validate = true } = {}) {
  const coveredSet = new Set(covered.map((f) => String(f).toLowerCase()));
  if (!coveredSet.size) return { css: cssText, dropped: 0, refused: 0 };

  const rules = scanFontFaceRules(cssText);
  // `validate` is true (use css-tree), false (skip), or A PREDICATE. The third form is a
  // deliberate test seam, and it earns its place: no natural input reaches the refusal path
  // — the differential fuzz found 0 mis-spans — so without it, DELETING THIS GUARD
  // ENTIRELY leaves every test green. That is the "no test kills it" hazard
  // `test/unit/export/style-guard-census.test.js` documents for the #22 guards, and it is
  // worth one parameter to avoid shipping an unkillable line.
  const isWholeRule = typeof validate === 'function' ? validate : (validate ? spanValidator() : () => true);
  let dropped = 0;
  let refused = 0;
  const parts = [];
  let cursor = 0;
  for (const rule of rules) {
    if (!rule.hasRelativeUrl) continue;
    if (!rule.family || !coveredSet.has(rule.family.toLowerCase())) continue;
    const span = cssText.slice(rule.start, rule.end);
    // THE SECOND OPINION, taken before anything is deleted. See `spanValidator`.
    if (!isWholeRule(span)) { refused++; continue; }
    parts.push(cssText.slice(cursor, rule.start));
    cursor = rule.end;
    dropped++;
  }
  if (!dropped) return { css: cssText, dropped: 0, refused };
  parts.push(cssText.slice(cursor));
  return { css: parts.join(''), dropped, refused };
}

/**
 * A SECOND OPINION ON EVERY SPAN, FROM A PARSER THAT IS NOT THIS ONE.
 *
 * The scanner below is hand-rolled, and its failure mode is the worst one available here:
 * a wrong rule boundary makes the drop arm splice out a span that ends mid-rule, which
 * silently deletes real CSS and reports success. Two independent reviews each found a live
 * instance — a `}` inside a comment, inside a string, behind a backslash escape, inside an
 * unquoted `url-token` — and each was fixed by naming that input. Naming inputs does not
 * close a class; the second review found its two in the commit that declared the class
 * closed.
 *
 * NO INPUT IS KNOWN TO PRODUCE A BAD SPAN TODAY, and that is stated rather than implied.
 * Differentially fuzzing the scanner against css-tree's own `@font-face` offsets over 80
 * adversarial inputs — escapes, unicode escapes, CDO/CDC, unterminated strings, comments,
 * urls and parens, braces inside each of them — found 0 mis-spans and 10 MISSES, every one
 * in the safe direction (`scanFontFaceRules` returns nothing and the rule is kept). So this
 * guard is a net for the class, not a patch for a live bug. Its own live risk is the
 * opposite one — a FALSE refusal, which silently costs the win rather than the CSS — and
 * that is what the tests pin.
 *
 * So the boundary is no longer taken on trust. Before a span is removed, `css-tree` is
 * asked whether that span, parsed ALONE, is exactly one complete `@font-face` at-rule and
 * nothing else. A mis-scanned span is not — it is a truncated rule, or a rule plus the head
 * of the next one — so it fails here and the rule is KEPT. An input class nobody has thought
 * of therefore degrades to the pre-existing behavior (one doomed fetch) instead of corrupting
 * the stylesheet.
 *
 * WHAT IT COSTS, COLD, WHICH IS THE ONLY NUMBER THAT MATTERS HERE. The parses really are
 * cheap — the unit is the SPAN, not the sheet: 37 spans of ~150 bytes cost 5.1 ms, where
 * parsing the whole 1.6 MB sheet costs 130-219 ms (which is why this file scans by hand at
 * all). But `require('css-tree')` itself costs 64 ms the first time, and a CLI render loads
 * it exactly once — so the honest total is ~70 ms, not 5. Measured in situ after a warm
 * micro-benchmark said 5.75; this file has now been wrong about a warm number twice, and the
 * second time is what put this sentence here.
 *
 * ~70 ms against the ~21 ms per navigation the drop saves is a bad trade to make
 * unconditionally, so `validate` is a parameter. The caller skips it for a sheet whose drop
 * behavior is already pinned at BUILD time — the bundled `dist/lattice.css` is fixed bytes,
 * and `test/unit/export/inlined-sheet-faces.test.js` runs this same css-tree oracle over it
 * on every CI run, asserting all 3,215 style-rule selectors survive. A runtime second opinion
 * on bytes that cannot vary buys nothing the test does not already buy. A caller-SUPPLIED
 * `--css` sheet is the opposite: arbitrary, unseen, and the only place the exotic-input risk
 * actually lives. That is where the 70 ms is worth paying, and it is a rare deliberate flag.
 *
 * `css-tree` is an OPTIONAL dependency (`package.json` `optionalDependencies`), exactly as
 * `lib/export/html-player.js`'s prune treats it. Absent, this returns a predicate that accepts
 * everything and behavior is unchanged — the guard is a net, never a requirement.
 *
 * @returns {(span: string) => boolean}
 */
function spanValidator() {
  let csstree;
  try { csstree = require('css-tree'); } catch { return () => true; }
  return (span) => {
    // THE CLOSING BRACE IS CHECKED SEPARATELY, AND IT IS NOT REDUNDANT. A CSS parser
    // auto-closes an unterminated block at EOF, so css-tree happily reports
    // `@font-face{font-family:X` as one complete at-rule — which is precisely the shape a
    // TRUNCATED mis-scan produces, i.e. the single most important thing this guard exists
    // to reject. Asking the parser alone would have certified it. (Caught by this
    // function's own test, which is what the test was for.)
    if (!span.trimEnd().endsWith('}')) return false;
    try {
      // `parseValue`/`parseRulePrelude` off: this asks about STRUCTURE — one at-rule, whole,
      // nothing trailing — and the cheaper parse answers that just as well. `children.length
      // === 1` is what rejects the other mis-scan shape, a whole rule plus the next one.
      const ast = csstree.parse(span, { parseValue: false, parseRulePrelude: false });
      const kids = ast.children.toArray();
      return kids.length === 1 && kids[0].type === 'Atrule' && kids[0].name === 'font-face';
    } catch {
      return false; // unparseable → not provably a whole rule → keep it
    }
  };
}

// ── The scanner ──────────────────────────────────────────────────────────────
//
// WHY A STATE MACHINE AND NOT `indexOf`, and why not `css-tree` either.
//
// The first cut of this file located rules with `indexOf('@font-face')` +
// `indexOf('{')` + `indexOf('}')`, skipping `/* */` only at the top level. The HARD
// RULE #25 checker broke it four ways, all reproduced, all SILENT — the covered arm
// deletes text, so a wrong boundary loses real CSS and reports success:
//   • `src:url("fonts/a.woff2")/* TODO {see #123} */;…}` — a `}` inside a COMMENT ended
//     the rule early, and the splice left ` */;font-display:swap}KEEP{color:red}`.
//   • `font-family:"Outfit}"` — a `}` inside a STRING did the same; on a MINIFIED
//     single-line sheet the dangling `"` opens an unterminated string that swallows the
//     rest of the caller's stylesheet, exit 0, no warning.
//   • `/* mirrors font-family: Outfit; above */font-family:'MyFont'` — the family regex
//     read the COMMENT, so a face nothing supplies was judged covered and deleted.
//   • `font-family:'Outfit';/* was url('fonts/o.woff2') */src:url(data:…)` — same blind
//     read made a WORKING base64 face look relative, and deleted it.
// A `}` is only a terminator outside strings and comments; that is the whole
// specification, and it is small enough to write exactly rather than approximate.
//
// `css-tree` (already an OPTIONAL dependency, used by the player prune) would also be
// exact, and was measured rather than assumed: parsing the real 1.6 MB engine sheet
// costs 130-219 ms, 58 ms even with `parseValue: false`. This function exists to save
// ~21 ms per navigation. It is also optional, so every caller would need this path
// anyway when it is absent.
//
// THE COST HERE IS ~17 ms, COLD, AND THAT NUMBER IS THE HONEST ONE. An earlier draft of
// this note said "~4 ms", which was the SEVENTH call in a warm loop — the CLI only ever
// makes the first. Measured cold and end to end, the change as first written added 113 ms
// per process against a ~21 ms per-navigation saving, i.e. a net LOSS on any deck that
// navigates once. Two fixes closed it: `emittedFamilies` replaced a 60-70 ms walk over
// 845 KB of base64 (see its docblock), and the top-level scan below HOPS between
// interesting bytes with a regex instead of stepping character by character, which is
// 33 ms -> ~5 ms on the 1.6 MB sheet. Cold-measure any claim about this function; warm
// numbers here are off by an order of magnitude. (Second HARD RULE #25 checker.)
//
// EVERY AMBIGUITY RESOLVES TOWARD KEEPING THE RULE. Keeping a doomed face costs one
// failed fetch — the pre-existing behavior. Dropping the wrong one loses type, or CSS.

const AT_KEYWORD = '@font-face';

/** Advance past a quoted string; `i` points at the opening quote. */
function skipString(css, i) {
  const quote = css[i];
  for (let j = i + 1; j < css.length; j++) {
    if (css[j] === '\\') { j++; continue; }
    if (css[j] === quote) return j + 1;
  }
  return css.length; // unterminated — consume the rest, as a CSS parser does
}

/** Advance past a `/* … *\/` comment; `i` points at the `/`. */
function skipComment(css, i) {
  const end = css.indexOf('*/', i + 2);
  return end === -1 ? css.length : end + 2;
}

/**
 * Every real `@font-face` rule in `cssText`, as
 * `{start, end, bodyStart, bodyEnd, family, hasRelativeUrl}` — `family` unquoted and read
 * from a comment-blanked body, `hasRelativeUrl` true when any `url()` names a target with
 * no scheme and no leading `/`. At-keywords inside strings and comments are not rules;
 * neither is one with no `{`, or one whose `{` is never closed.
 */
function scanFontFaceRules(cssText) {
  const out = [];
  const n = cssText.length;
  // HOP, don't step. Only four things at top level can change what we are looking at — a
  // comment open, either quote, a backslash escape, and the at-keyword itself — and the
  // engine sheet is 1.6 MB of which almost none is any of them. Stepping one character at
  // a time cost 33 ms per render against the ~21 ms per navigation this whole change
  // saves, which made a single-navigation export a net LOSS. Letting the regex engine
  // find the next interesting byte is the same scan, two orders of magnitude cheaper.
  const HOP = /[@"'\\]|\/\*/g;
  let i = 0;
  while (i < n) {
    HOP.lastIndex = i;
    const m = HOP.exec(cssText);
    if (!m) break;
    i = m.index;
    const c = cssText[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '/') { i = skipComment(cssText, i); continue; }
    if (c === '"' || c === "'") { i = skipString(cssText, i); continue; }
    if (!cssText.startsWith(AT_KEYWORD, i)) { i++; continue; }
    const rule = readRule(cssText, i);
    if (!rule) { i += AT_KEYWORD.length; continue; }
    out.push(rule);
    i = rule.end;
  }
  return out;
}

/**
 * Read one rule starting at the at-keyword. Only whitespace and comments may separate the
 * keyword from its `{`. That test guards an UNQUOTED look-alike — `@font-face-legacy{…}`
 * pairs the keyword with a block that is not its own without it. It is NOT what stops
 * `content: "@font-face"` from being read as a rule, as this comment used to claim: the
 * top-level string skip handles that case and the gap test never runs. (Second checker,
 * by deleting the test and observing that the quoted case still yields zero rules.)
 */
function readRule(cssText, at) {
  let i = at + AT_KEYWORD.length;
  while (i < cssText.length) {
    if (/\s/.test(cssText[i])) { i++; continue; }
    if (cssText[i] === '/' && cssText[i + 1] === '*') { i = skipComment(cssText, i); continue; }
    break;
  }
  if (cssText[i] !== '{') return null;
  const bodyStart = i + 1;
  let depth = 1;
  let paren = 0;
  let j = bodyStart;
  while (j < cssText.length) {
    const c = cssText[j];
    // A BACKSLASH ESCAPE, and a `}` INSIDE PARENTHESES, are both legal CSS and neither
    // closes a block: `font-feature-settings:x\}` escapes the brace into an identifier,
    // and `}` is a valid code point in an UNQUOTED `url-token` (`url(a}b)`). The first
    // cut of this scanner honored strings and comments but not these two, so both still
    // ended the rule early and the drop arm spliced out the tail of the sheet — the same
    // silent-corruption class the scanner was rewritten to close, two inputs narrower.
    // Found by the second HARD RULE #25 checker, on the commit that claimed the class
    // was closed.
    if (c === '\\') { j += 2; continue; }
    if (c === '/' && cssText[j + 1] === '*') { j = skipComment(cssText, j); continue; }
    if (c === '"' || c === "'") { j = skipString(cssText, j); continue; }
    if (c === '(') { paren++; j++; continue; }
    if (c === ')') { if (paren) paren--; j++; continue; }
    if (paren) { j++; continue; }
    if (c === '{') { depth++; j++; continue; }
    if (c === '}') {
      depth--;
      if (!depth) {
        // The body with comments blanked out — every value read below happens on THIS,
        // never on the raw text, so a comment can neither supply a family nor hide one.
        const body = stripComments(cssText.slice(bodyStart, j));
        return {
          start: at, end: j + 1, bodyStart, bodyEnd: j,
          family: declaredFamily(body),
          hasRelativeUrl: srcHasRelativeUrl(body),
        };
      }
      j++;
      continue;
    }
    j++;
  }
  return null; // unterminated — leave the tail of the sheet alone
}

/** Blank out comments so a value regex cannot read one. */
function stripComments(body) {
  let out = '';
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === '\\') { out += body.slice(i, i + 2); i += 2; continue; }
    if (c === '/' && body[i + 1] === '*') { const e = skipComment(body, i); out += ' '; i = e; continue; }
    if (c === '"' || c === "'") { const e = skipString(body, i); out += body.slice(i, e); i = e; continue; }
    out += c;
    i++;
  }
  return out;
}

// A quoted value may itself contain `;` or `}`, so the quoted forms come first. GLOBAL,
// because a repeated descriptor is LAST-wins in CSS and `declaredFamily` must agree with
// the browser: `font-family:'Outfit';font-family:'MyFont'` declares MyFont. Reading the
// FIRST match deleted a face whose real family nothing supplied — no exotic syntax needed,
// duplicated declarations are ordinary in concatenated sheets. (Second checker.)
const FAMILY_RE = /font-family\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^;}]+)/gi;
const URL_RE = /url\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^)]*?)\s*\)/gi;

/** The rule's declared family, unquoted, or `''` when it declares none. */
function declaredFamily(body) {
  FAMILY_RE.lastIndex = 0;
  let last = '';
  for (const m of body.matchAll(FAMILY_RE)) last = m[1];
  return last ? last.trim().replace(/^['"]|['"]$/g, '').trim() : '';
}

/**
 * Does any `url()` in the rule name a RELATIVE target — no scheme, not root-absolute?
 * Those are the only ones inlining changes the meaning of.
 */
function srcHasRelativeUrl(body) {
  URL_RE.lastIndex = 0;
  for (const m of body.matchAll(URL_RE)) {
    const u = m[1].trim().replace(/^['"]|['"]$/g, '').trim();
    if (!u) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('/')) continue;
    return true;
  }
  return false;
}

module.exports = { fontFaceCss, fontFamilies, fontDir, emittedFamilies, dropCoveredSheetFaces, scanFontFaceRules, spanValidator };
