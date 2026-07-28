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

// Pull a single `<!-- (_)key: value -->` directive out of a comment body.
// Returns { spot, key, value } or null. Mirrors directives.parseCommentDirectives
// but operates on a token's raw content inside the pipeline.
function readDirectiveComment(raw) {
  // Value is optional so a flag-style directive can be written bare —
  // `<!-- _build -->` (≡ `_build:` with an empty value). Only an exact
  // `_?<knownDirective>` with nothing else matches, so prose comments are safe.
  const m = /^<!--\s*(_?)([A-Za-z][\w]*)\s*(?::\s*([\s\S]*?))?\s*-->$/.exec(raw.trim());
  if (!m) return null;
  const [, spot, key, value] = m;
  if (!KNOWN_DIRECTIVES.has(key)) return null;
  // Bare (no colon) is only a directive for flag directives (`_build`); otherwise
  // a comment that's just a known-directive word is prose — leave it alone.
  if (value === undefined && !FLAG_DIRECTIVES.has(key)) return null;
  return { spot: Boolean(spot), key, value: stripQuotes(value ?? '') };
}

function stripQuotes(v) {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

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
    let pageNumber = 0;
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
    for (const token of paginated) token.attrSet('data-lattice-pagination-total', String(pageNumber));
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
  const groups = [[]];
  for (const t of tokens) {
    if (t.type === 'hr' && t.level === 0) {
      groups.push([]);
    } else {
      groups[groups.length - 1].push(t);
    }
  }
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

/**
 * Minimal inline-style accumulator matching marpit's helpers/inline_style:
 * ordered `prop: value;` pairs, last-write-wins, serialised without spaces
 * between declarations (so `--paginate:true;--class:x;` matches marp-core).
 */
class InlineStyle {
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
    for (const [k, v] of this.map) s += `${k}:${v};`;
    return s;
  }
}

module.exports = { installSlidePipeline, splitOnHr, InlineStyle };
