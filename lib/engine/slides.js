/**
 * lattice-engine — slide pipeline (markdown-it core rulers).
 *
 * Reproduces, on a plain markdown-it instance, the exact token contract the
 * Lattice plugins bind to (lib/integrations/markdown-it/plugins.js):
 *
 *   - a `lattice_slide_containers` core ruler (so `.after('lattice_slide_containers')`
 *     resolves), and
 *   - `lattice_slide_open` / `lattice_slide_close` tokens carrying the section's
 *     `class` attribute and `latticeSlide` / `latticeSlideTotal` meta.
 *
 * Because the contract matches, every Lattice markdown-it plugin (verdict-grid
 * badges, checklist states, slot-label lift, glossary tables, heading periods,
 * deck-class propagation, …) composes onto this engine UNCHANGED — they are the
 * Lattice-specific, hard-won part and we do not rewrite them.
 *
 * Upstream provenance (algorithm ported, not vendored): @marp-team/marpit
 *   lib/markdown/slide.js              → split on hr, wrap in section
 *   lib/markdown/directives/apply.js   → class / data-<kebab> / --<kebab> / pagination / bg
 *   lib/markdown/slide_container.js    → the deck-container wrapper
 *
 * Naming: every ruler, token, attribute and marker this module owns is
 * Lattice's own — the `lattice_` prefix, the `article.lattice` wrapper class
 * (below), the `lattice_comment` token, the `lattice*` token meta. The owned
 * engine renders every first-party path, so nothing here carries Marp's strings.
 * The Export-to-Marp bundle does NOT depend on our wrapper name: Marp renders it
 * and emits its OWN `div.marpit` wrapper, scoping our (name-free) lattice.css
 * onto it with Marp's prefixer — so the only place Marp's strings live is the
 * export boundary itself (lib/core/marp-bundle.js).
 */



const { KNOWN_DIRECTIVES, APPLIED_DIRECTIVES, FLAG_DIRECTIVES, kebab } = require('./directives');
const { readDirectiveComment: readComment } = require('../core/comment-directive');
const { groupOnSlideRule } = require('../core/slide-rule');

// The engine's directive VOCABULARY, bound once. The grammar itself lives in
// lib/core/comment-directive.js so a source-side reader (which cannot run this
// pipeline but must agree with it about what `<!-- class: … -->` means) shares
// the parse instead of re-spelling it.
const DIRECTIVE_VOCAB = { known: KNOWN_DIRECTIVES, flags: FLAG_DIRECTIVES };

// Pull a single `<!-- (_)key: value -->` directive out of a token's raw content.
// Returns { spot, key, value } or null.
const readDirectiveComment = (raw) => readComment(raw, DIRECTIVE_VOCAB);

/**
 * Install the slide pipeline. `globalBase` seeds the running global directive
 * map from front matter (parsed before markdown-it sees the body).
 */
function installSlidePipeline(md, globalBase = {}, opts = {}) {
  // Predicate: is a theme name registered? marp-core only applies the `theme`
  // directive (data-theme / --theme) when the palette is in its themeSet; an
  // unknown theme is dropped. Default true keeps the engine usable standalone.
  const isThemeKnown = opts.isThemeKnown || (() => true);
  // Deck-wide orientation ('portrait'|'square'|'landscape'), resolved from @size
  // by the caller. Stamped per <section> (below) only when non-landscape so the
  // landscape DOM stays byte-identical; portrait/square layouts key reflow rules
  // off `section[data-orientation="…"]`.
  const orientation = opts.orientation && opts.orientation !== 'landscape' ? opts.orientation : null;
  // Deck-wide FAMILY ('wide'|'square'|'tall'|'strip'), resolved from the same
  // classifier as `orientation` by the caller. Stamped per <section> only when
  // non-`wide` so the landscape DOM stays byte-identical — the same convention
  // the runtime uses (lib/runtime/index.js stampOrientation).
  //
  // WHY components need this and not just `data-orientation`: orientation is
  // 3-valued (landscape|square|portrait) and collapses `tall` and `strip` into
  // one, but the component reflow tier distinguishes all four. Frames already key
  // off `[data-family]`; this is what lets components use the SAME stamp rather
  // than re-deriving the box with a container query — which measured the padded
  // CONTENT box and disagreed with this classifier on square decks (#1218).
  const family = opts.family && opts.family !== 'wide' ? opts.family : null;
  // ── 0. Drop empty-content text tokens left around emphasis markers ─────────
  // Standalone markdown-it leaves `text("")` tokens at the edges of inline
  // content (the consumed `**`/`_` markers). Marpit's pipeline emits a clean
  // stream — `[strong_open, text, strong_close]` — and the Lattice plugins'
  // `children[0].type === 'strong_open'` guards depend on it (without this,
  // slot-label-lift double-wraps an already-bold label). Filtering zero-length
  // text children reproduces marp-core's shape.
  md.core.ruler.after('inline', 'lattice_clean_inline', (state) => {
    for (const token of state.tokens) {
      if (token.type === 'inline' && token.children) {
        token.children = token.children.filter(
          (c) => !(c.type === 'text' && c.content === ''),
        );
      }
    }
  });

  // ── 1. Split on top-level `hr` into <section> slides ──────────────────────
  md.core.ruler.push('lattice_slide', (state) => {
    if (state.inlineMode) return;
    const groups = splitOnHr(state.tokens);
    const total = groups.length;
    const out = [];
    groups.forEach((slideTokens, idx) => {
      const open = new state.Token('lattice_slide_open', 'section', 1);
      open.block = true;
      open.attrSet('id', String(idx + 1));
      open.meta = { latticeSlide: idx, latticeSlideTotal: total };
      const close = new state.Token('lattice_slide_close', 'section', -1);
      close.block = true;
      close.meta = { latticeSlide: idx, latticeSlideTotal: total };
      out.push(open, ...slideTokens, close);
    });
    state.tokens = out;
  });

  // ── 2. Parse directive comments → per-slide directive meta ────────────────
  md.core.ruler.after('lattice_slide', 'lattice_directives', (state) => {
    if (state.inlineMode) return;
    const runningGlobal = { ...globalBase };
    let current = null; // the open token of the slide we're inside
    let slideLocal = {};
    for (const token of state.tokens) {
      if (token.type === 'lattice_slide_open') {
        current = token;
        slideLocal = {};
        continue;
      }
      if (token.type === 'lattice_slide_close') {
        // Effective = running globals overlaid with this slide's spot directives.
        current.meta.latticeDirectives = { ...runningGlobal, ...slideLocal };
        current = null;
        continue;
      }
      if (!current) continue;
      if (token.type !== 'html_block' && token.type !== 'html_inline') continue;
      const dir = readDirectiveComment(token.content);
      if (!dir) continue;
      if (dir.spot) {
        slideLocal[dir.key] = dir.value;
      } else {
        // Global comment directive — applies to this slide and all following.
        runningGlobal[dir.key] = dir.value;
      }
      token.content = ''; // consume the directive comment
      token.type = 'text';
    }
  });

  // ── 3. Apply directive meta to the section token ──────────────────────────
  md.core.ruler.after('lattice_directives', 'lattice_directives_apply', (state) => {
    if (state.inlineMode) return;
    // DECK POSITION, SUPPLIED. Pagination is `slide k of N` — positional metadata the caller
    // already holds. The engine's default is to DERIVE it by counting this document's sections,
    // which is right for a whole deck and wrong for a document holding part of one: a
    // single-slide render numbers itself "1 of 1" wherever it really sits. Deriving it is also
    // what forced a preview showing ONE slide to re-parse the WHOLE deck, just to recompute a
    // number nobody had lost.
    //
    // Read off the per-render ENV, never the pipeline's install options: the markdown-it instance
    // is memoized across renders, so a value baked into this closure would be served stale.
    //
    // Each field is validated on its OWN — the deck's size is known regardless of where this
    // slide sits in it. Anything not a positive integer means "count it off this document", so an
    // omitted or malformed `page` reproduces the previous behavior byte-for-byte, which is why no
    // export path (none of which supplies it) can move.
    const supplied = state.env?.page;
    const pageOffset = Number.isInteger(supplied?.offset) && supplied.offset > 0 ? supplied.offset : 0;
    const pageTotal = Number.isInteger(supplied?.total) && supplied.total > 0 ? supplied.total : 0;
    let pageNumber = pageOffset;
    const paginated = [];
    for (const token of state.tokens) {
      if (token.type !== 'lattice_slide_open') continue;
      const dirs = token.meta.latticeDirectives || {};
      // Count EVERY slide — the pagination number is the slide's absolute 1-based
      // position, and the total is the whole deck's slide count, exactly as
      // marp-core does. A `_paginate: false` slide is still counted (its number is
      // hidden), so the next paginated slide reads its true position, not one less.
      // Incrementing only on paginated slides renumbered after a hidden slide and
      // undercounted the total (the parity sweep caught "2" rendering as "1").
      pageNumber += 1;
      const style = styleFor(token);
      for (const key of Object.keys(dirs)) {
        if (!APPLIED_DIRECTIVES.has(key)) continue;
        const value = dirs[key];
        // `build` and `debug` are flag directives: a bare `_build`/`_debug` (empty
        // value) still emits `data-build=""` / `data-debug=""` — an empty `debug`
        // means "the default profile". Every other directive skips an empty value.
        if (!value && key !== 'build' && key !== 'debug') continue;
        // paginate only lands when truthy ('false'/'skip'/'hold' emit nothing).
        if (key === 'paginate' && !truthy(value)) continue;
        // theme only lands when the palette is registered, matching marp-core.
        if (key === 'theme' && !isThemeKnown(value)) continue;
        const kb = kebab(key);
        token.attrSet(`data-${kb}`, value);
        // No CSS custom property for `build` (a behavioral flag the build resolver
        // reads) or `debug` (a preview-only flag the overlay agent reads off the
        // data-attr) — a `--debug` prop would just be dead bytes for export to strip.
        if (value && key !== 'build' && key !== 'debug') style.set(`--${kb}`, value);
      }
      if (dirs.class) token.attrJoin('class', dirs.class);
      if (orientation) token.attrSet('data-orientation', orientation);
      if (family) token.attrSet('data-family', family);
      if (dirs.color) style.set('color', dirs.color);
      if (dirs.backgroundColor) style.set('background-color', dirs.backgroundColor).set('background-image', 'none');
      if (dirs.backgroundImage) {
        style.set('background-image', dirs.backgroundImage)
          .set('background-position', dirs.backgroundPosition || 'center')
          .set('background-repeat', dirs.backgroundRepeat || 'no-repeat')
          .set('background-size', dirs.backgroundSize || 'cover');
      }
      if (truthy(dirs.paginate)) {
        token.attrSet('data-lattice-pagination', String(pageNumber));
        paginated.push(token);
      }
      if (dirs.header) token.meta.latticeHeader = dirs.header;
      if (dirs.footer) token.meta.latticeFooter = dirs.footer;
      const s = style.toString();
      if (s) token.attrSet('style', s);
    }
    // The DECK's total, not this document's. `Math.max` guards a caller whose count is
    // stale mid-edit and lower than what actually rendered here, which would otherwise
    // leave the attribute self-contradicting at "3 of 1".
    const total = Math.max(pageTotal, pageNumber);
    for (const token of paginated) token.attrSet('data-lattice-pagination-total', String(total));
  });

  // ── 3b. Header / footer DOM — marp-core emits <header>/<footer> as the
  //        first/last child of each section (content rendered as inline md). ──
  md.core.ruler.after('lattice_directives_apply', 'lattice_header_footer', (state) => {
    if (state.inlineMode) return;
    const out = [];
    let footer = null; // pending footer for the slide we're inside
    for (const token of state.tokens) {
      if (token.type === 'lattice_slide_open') {
        out.push(token);
        if (token.meta.latticeHeader) {
          out.push(rawBlock(state, `<header>${state.md.renderInline(token.meta.latticeHeader)}</header>`));
        }
        footer = token.meta.latticeFooter || null;
        continue;
      }
      if (token.type === 'lattice_slide_close') {
        if (footer) out.push(rawBlock(state, `<footer>${state.md.renderInline(footer)}</footer>`));
        footer = null;
        out.push(token);
        continue;
      }
      out.push(token);
    }
    state.tokens = out;
  });

  // ── 4. Container wrapper (article.lattice) — the name the plugins hook after ─
  // The deck is a self-contained composition, so the container is an `<article>`,
  // not a `<div>` (semantic-html ADR §4A, "article #1"). The `<main>` LANDMARK is
  // the document shell's job, not the deck's — `<main>` says WHERE the primary
  // content is, `<article>` says WHAT it is; they are orthogonal and both correct.
  // Emitting `<main>` here would also make a second `<main>` unavoidable on any
  // host page that already has one.
  //
  // `article` is a type selector exactly like `div`, so `css.js`'s packed
  // `article.lattice > section` keeps the same (0,1,2) specificity that has to beat
  // the preview frame's `.lattice > section` sizing rule. That lockstep is
  // load-bearing: change one without the other and every themed rule stops
  // matching.
  md.core.ruler.after('lattice_header_footer', 'lattice_slide_containers', (state) => {
    if (state.inlineMode) return;
    const open = new state.Token('lattice_slide_containers_open', 'article', 1);
    open.block = true;
    open.attrSet('class', 'lattice');
    const close = new state.Token('lattice_slide_containers_close', 'article', -1);
    close.block = true;
    state.tokens = [open, ...state.tokens, close];
  });
}

// Split a token array into per-slide groups on top-level `hr` (the `---`
// separator). Mirrors marpit's split(tokens, hr, true): a leading hr starts a
// new (possibly empty) slide; the separator token itself is dropped.
function splitOnHr(tokens) {
  const groups = groupOnSlideRule(tokens);
  // Drop a leading empty group only when it is truly empty (front matter
  // already stripped upstream, so an empty first group means a leading `---`).
  if (groups.length > 1 && groups[0].length === 0) groups.shift();
  return groups;
}

function truthy(v) {
  return v && v !== 'false' && v !== 'skip' && v !== 'hold';
}

// A block-level raw-HTML token (used for injected <header>/<footer>).
function rawBlock(state, html) {
  const t = new state.Token('html_block', '', 0);
  t.block = true;
  t.content = html;
  return t;
}


/* ── DIRECTIVE VALUES REACHING INLINE STYLE ──────────────────────────────────────────
 * Every known directive has its VALUE written into the section's inline `style`: once as a
 * custom property (`--header`, `--footer`, …) and, for SIX of them, also as a REAL
 * declaration: `color`, `backgroundColor`, `backgroundImage`, and — easy to miss, because
 * they are written in the same statement as the image — `backgroundPosition`,
 * `backgroundRepeat` and `backgroundSize`. All six reach `realDeclValueIsSafe`; an audit
 * that checks only the first three has checked half the surface. Inline style is the highest cascade tier
 * short of `!important`, so a value that can terminate its own declaration and open a
 * second one sets arbitrary CSS on the slide from ordinary markdown — a slide plane
 * (`--z-canvas: 9`) erases the body under the finish sheet; `position: fixed` is equally
 * reachable.
 *
 * THIS HAS BEEN FIXED FOUR TIMES. The first three attempts all tried to decide whether a
 * given `;` was "inert", by approximating CSS tokenization — and each was broken by a
 * construct the author had not thought of:
 *   v1 tracked quotes but not `url()`  → `url(a"b);--z-canvas:9` (a bad-url-token ends at
 *      `)`, so the quote never opened a string and the `;` was live).
 *   v2 also rejected values ending mid-token → dropped `Ladder's` from shipped decks.
 *   v3 tracked `url()` and ignored quotes → `'url(';--z-canvas:9` and `/*url(*\/;…` both
 *      turned the url suppression ON where CSS had nothing open at all.
 *
 * v4 stopped parsing and started quoting — the right shape — but shipped four holes, and
 * they are worth naming because none was in the quoting IDEA, all four were in its edges:
 *   a RAW NEWLINE in the value (a CSS string may not span one, so the tokenizer emits a
 *      bad-string-token and error recovery runs to the attacker's own `;`);
 *   an ODD BACKSLASH RUN, miscounted by the "it already looks like a string, leave it
 *      alone" shortcut, which was the one path that emitted a value unquoted;
 *   a RE-PARSE — `applyBackground` rebuilt an InlineStyle from the attribute this code had
 *      just serialized, and the constructor's naive `;` split cut inside a quoted value;
 *   a COMMENT OPENER inside a real declaration, which ran to the end of the attribute and
 *      deleted every declaration the engine writes after it.
 *
 * The lesson is that approximating the tokenizer is the wrong shape of solution, and that
 * quoting only holds if there is no path around it. This does not parse the value. It makes
 * a value structurally incapable of ending its declaration:
 *
 *   · CUSTOM PROPERTIES are emitted as a CSS STRING. `--footer:"…"`. A string token cannot
 *     terminate a declaration whatever it contains, so no analysis is required and no
 *     construct can surprise us. `\` and `"` are escaped; everything else — semicolons,
 *     braces, comment syntax, unbalanced quotes — is inert by construction. Nothing in the
 *     engine reads `var(--header)` / `var(--footer)` / `var(--color)`, so the quoting costs
 *     nothing; a consumer that wants the text gets it from `data-*`, or from `content:
 *     var(--footer)`, where a string is what you want anyway.
 *
 *   · REAL DECLARATIONS (all six, above) cannot be quoted — `color: "red"` is not a color —
 *     so they are VALIDATED instead, against a narrow allowlist: no `; { } < > \ " '`,
 *     and balanced parens. The one carve-out is a value that is exactly one `url(…)` token,
 *     which is how a data URI (`url(data:image/svg+xml;base64,…)`) keeps its semicolons.
 *     A value outside that is dropped rather than repaired.
 *
 *   · NOTHING RE-PARSES WHAT THIS PRODUCES. Both passes that touch a slide's style go
 *     through `styleFor`, which builds the map ONCE and stashes it on the token. A
 *     serialization is an output, never an input: the builder and any parser of its output
 *     are different code and will eventually disagree, and that disagreement is an
 *     injection. See the note on `styleFor` for the concrete escape this closed.
 *
 * Held by test/unit/engine/directive-style-injection.test.js, whose oracle is `css-tree` —
 * a real CSS parser — rather than another hand-rolled scanner. The previous test used a
 * hand-rolled one that shared the fix's blind spot and passed a broken fix.
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** A custom-property value, emitted so it cannot terminate its own declaration.
 *  Always becomes a CSS string token, which no construct can escape. */
function quoteDeclValue(value) {
  // Order matters: backslashes first (so the escapes added below are not re-escaped), then
  // the delimiter, then every character a CSS string may not contain literally.
  //
  // THE NEWLINE IS NOT COSMETIC. A CSS string cannot span a raw newline: the tokenizer emits
  // a bad-string-token, and declaration error-recovery then consumes tokens until the next
  // `;` — which is inside the attacker's own payload, so everything after it parses as fresh
  // declarations. A multi-line `<!-- _footer: … -->` reaches this. Escaping them as `\a `
  // keeps the text and removes the token boundary.
  //
  // There is deliberately NO "it already looks like a string, leave it alone" shortcut. One
  // existed and was the only unquoted path; its even-backslash check looked back two
  // characters instead of counting the run, so `"\\\\\\"` (an odd run of three) was judged
  // well-formed and emitted raw, where CSS reads the closing quote as escaped and the string
  // never ends. Quoting unconditionally costs a few bytes and removes the entire class.
  const v = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n\f\v\0\u2028\u2029]/g, (c) => `\\${c.codePointAt(0).toString(16)} `);
  return `"${v}"`;
}

/** True when a REAL declaration's value cannot escape its declaration. */
function realDeclValueIsSafe(value) {
  const v = String(value).trim();
  // Exactly one url() token: the data-URI carve-out. No quotes, no nesting, no injection
  // characters inside, and nothing after the closing paren.
  //
  // THE NEWLINES IN THESE CLASSES ARE LOAD-BEARING, and their absence was a live hole. A
  // QUOTED url is tokenized as a function-token followed by a STRING, not as a url-token —
  // so a raw newline inside the quotes makes a bad-string-token, the `)` is swallowed into
  // the following string, the function block never closes, and parsing runs to EOF. That is
  // precisely the swallow the balance check below exists to stop, reached by walking around
  // it. `url("a<newline>b")` deleted four engine declarations in Chromium. No legitimate URL
  // contains a raw newline, so rejecting them costs nothing; the value then falls through to
  // the quote ban and is dropped whole.
  if (/^url\([^()"'\\{}<>\r\n\f]*\)$/i.test(v)) return true;                 // url(unquoted)
  if (/^url\(\s*"[^"'()\\{}<>\r\n\f]*"\s*\)$/i.test(v)) return true;           // url("quoted")
  if (/^url\(\s*'[^"'()\\{}<>\r\n\f]*'\s*\)$/i.test(v)) return true;           // url('quoted')
  if (/[;{}<>\\"']/.test(v)) return false;
  // A comment opener runs to the end of the attribute, deleting every declaration the engine
  // writes after this one. `/` alone is legal (URLs), so reject only the two-character forms.
  if (v.includes('/*') || v.includes('*/')) return false;
  // Balanced parens: an unclosed function block swallows every declaration after it, which
  // lets an author silently delete the engine's own later declarations.
  let depth = 0;
  for (const c of v) {
    if (c === '(') depth++;
    else if (c === ')' && --depth < 0) return false;
  }
  return depth === 0;
}


/**
 * Minimal inline-style accumulator matching marpit's helpers/inline_style:
 * ordered `prop: value;` pairs, last-write-wins, serialised without spaces
 * between declarations (so `--paginate:true;--class:x;` matches marp-core).
 */
class InlineStyle {
  /* A directive VALUE is author text and reaches this map verbatim — `header:`, `footer:`,
   * `color:`, `logo:` and every other known directive is written out as a custom property
   * so CSS can read it (`--header`, `--footer`, …). Serializing it naively lets a `;` in
   * the value close the declaration and open a NEW one, in the section's INLINE style,
   * which outranks every stylesheet rule short of `!important`:
   *
   *     header: "Acme Q3; --z-canvas: 9"
   *       → style="--theme:indaco;--header:Acme Q3; --z-canvas: 9;"
   *
   * That injects a slide plane. `--z-canvas: 9` lifts the finish `.backdrop` from paint
   * step 3 to step 9 — over every word — and the deck renders with its body erased on
   * every slide, chrome intact. Verified end-to-end through the CLI on a `finish: halo`
   * deck: 16,749 differing pixels against the same markdown at the branch point, where the
   * plane tokens did not exist and the same injection was inert.
   *
   * The lever is not specific to layering: `position`, `transform`, `overflow`, `contain`
   * and anything else are reachable through the identical channel, so this is fixed at the
   * serializer rather than by escaping one property.
   *
   * HOW it is fixed is in the block above `quoteDeclValue`, and this paragraph used to
   * contradict it: it claimed a value carrying `;`, `}` or `<` is DROPPED, and argued that
   * dropping beats escaping "because there is no escape that makes `;` inert inside a
   * declaration value." That was v1's rationale, it outlived the code by three rewrites, and
   * it is wrong twice over — a CSS STRING is exactly the construct that makes `;` inert, and
   * dropping the declaration silently deleted ordinary prose semicolons from 20 shipped
   * decks. A custom-property value is now QUOTED and preserved in full; only a REAL
   * declaration, which cannot be quoted and stay a color, is dropped when it fails the
   * allowlist. Left here as a marker: this was the comment nearest the code, so it is the one
   * the next author would have believed.
   *
   * Inline style survives the Studio's sanitizer by design (`sanitize-slide-html.mjs` keeps
   * `style` and strips only script vectors), so a shared deck is a live path for this.
   * Held by test/unit/engine/directive-style-injection.test.js. */
  constructor(initial) {
    this.map = new Map();
    if (initial) {
      for (const decl of String(initial).split(';')) {
        const i = decl.indexOf(':');
        if (i === -1) continue;
        this.map.set(decl.slice(0, i).trim(), decl.slice(i + 1).trim());
      }
    }
  }
  set(prop, value) {
    this.map.set(prop, value);
    return this;
  }
  toString() {
    let s = '';
    for (const [k, v] of this.map) {
      if (k.startsWith('--')) { s += `${k}:${quoteDeclValue(v)};`; continue; }
      if (!realDeclValueIsSafe(v)) continue;
      s += `${k}:${v};`;
    }
    return s;
  }
}

/** The InlineStyle for a token, created once and REUSED.
 *
 *  Two passes touch a slide's style (the directive applier and the background-image rule),
 *  and the second used to do `new InlineStyle(token.attrGet('style'))` — re-parsing the
 *  attribute the first had just serialized. The constructor splits on `;` with no string
 *  awareness, so it cut INSIDE a quoted value and any fragment containing a `:` became a
 *  real declaration on the way back out. That resurrected the original injection verbatim on
 *  any slide carrying a `![bg]` image, with no newline, backslash or quote needed.
 *
 *  The lesson is not "write a better splitter". It is that a value should never be parsed
 *  out of a serialization we produced: the builder and the parser are different code and
 *  will always be able to disagree. The map is stashed on the token instead, so the second
 *  pass continues the first rather than re-reading it. The constructor's parse survives only
 *  for genuinely foreign input (a `style` attribute an author wrote in raw HTML). */
function styleFor(token) {
  if (!token.meta) token.meta = {};
  if (!token.meta.latticeStyle) token.meta.latticeStyle = new InlineStyle(token.attrGet('style'));
  return token.meta.latticeStyle;
}

module.exports = { installSlidePipeline, splitOnHr, InlineStyle, styleFor };
