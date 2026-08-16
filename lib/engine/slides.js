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
      const style = new InlineStyle(token.attrGet('style'));
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
        // No CSS custom property for `build` (a behavioural flag the build resolver
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


/** A value safe to serialize into an inline `style` declaration, or null to drop it.
 *
 *  A bare `;` ends the declaration and lets the rest of the value become a NEW one — the
 *  injection this guards (see the InlineStyle note below). `}` can close an injected block
 *  and `<` risks breaking out of the attribute in a downstream serializer. None can be
 *  escaped inside a declaration value, so a value carrying one is dropped.
 *
 *  BUT `;` is legal and common inside a `url()` — a data URI is
 *  `url(data:image/svg+xml;base64,…)`, which CSS tokenizes as ONE token, so the browser
 *  never reads that `;` as a separator. Dropping on a naive `/;/` would break every
 *  data-URI background. So the scan has to know where a `;` is inert and where it bites.
 *
 *  THE FIRST VERSION OF THIS WAS BYPASSABLE, and the bypass is worth stating because the
 *  mistake is easy to repeat. It tracked "quote depth" and "paren depth" as independent
 *  toggles, checking for a quote BEFORE checking whether it was inside a `url(`. CSS does
 *  not work that way: an UNQUOTED url token may not contain a quote at all — `url(a"b)` is
 *  a **bad-url-token**, which the tokenizer consumes up to the next `)` and no further. So
 *  `url(a"b);--z-canvas:9` put the old scanner into string mode at the `"`, swallowed the
 *  `)` and the `;`, and returned the value intact — while the browser saw a bad-url-token,
 *  then a perfectly ordinary `;`, then a new declaration. Same three-character injection
 *  the documented case was fixed for, straight back open, and no test caught it because
 *  there were none.
 *
 *  This version follows the tokenizer instead of approximating it:
 *    · `url(` opens a URL token. Whether it is QUOTED is decided by the first non-space
 *      character after the paren, exactly as CSS decides it.
 *    · A quoted url is a string: `;` inside is inert, the string ends at its own quote.
 *    · An UNQUOTED url ends at `)` — and a quote inside it makes it a bad-url-token, which
 *      still ends at `)`. Either way the quote is NOT a string opener, which is the whole
 *      bug.
 *    · Outside a url token a quote does open a string (an ordinary quoted value), and a
 *      `;` inside that string is inert.
 *  Anything else that meets `;`, `}` or `<` at top level rejects the value.
 *
 *  Held by test/unit/engine/directive-style-injection.test.js, which asserts both the
 *  closure and the data-URI survival. Do not edit this without adding the case you had in
 *  mind to that file first. */
function sanitizeDeclValue(value) {
  const v = String(value);
  let url = false;   // inside a `url(` … `)` token
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    if (url) {
      // A url token ends at `)` and nowhere else — quoted, unquoted, or bad-url alike.
      if (c === ')') url = false;
      continue;
    }
    if (c === '(' && /url\s*$/i.test(v.slice(0, i))) { url = true; continue; }
    if (c === ';' || c === '}' || c === '<') return null;
  }
  return v;
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
   * serializer rather than by escaping one property. A value carrying a `;`, a `}` or a
   * `<` cannot be expressed safely in an inline declaration, so the declaration is DROPPED
   * — the directive still lands as a `data-*` attribute, which is where anything reading it
   * for content should look. Dropping beats escaping here because there is no escape that
   * makes `;` inert inside a declaration value, and beats accepting because inline style is
   * the one tier no stylesheet can defend against.
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
      const safe = sanitizeDeclValue(v);
      if (safe === null) continue;
      s += `${k}:${safe};`;
    }
    return s;
  }
}

module.exports = { installSlidePipeline, splitOnHr, InlineStyle };
