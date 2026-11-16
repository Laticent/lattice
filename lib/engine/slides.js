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
 * export boundary itself (lib/export/marp-bundle.js).
 */



const { cssUrlVerdict } = require('../core/url-scheme');
const realDeclValueIsSafe = require('../core/decl-value-safe');
const {
  KNOWN_DIRECTIVES, APPLIED_DIRECTIVES, FLAG_DIRECTIVES, NO_CUSTOM_PROP, SLIDE_ONLY_DIRECTIVES, kebab,
} = require('./directives');
const { readDirectiveComment: readComment } = require('../core/comment-directive');
const { hideValue } = require('../core/hide-directive.mjs');
const { expandInternal } = require('../core/meta-internal.mjs');

/**
 * A record comment still whole at this point: the door's internal comment (`lat-meta:`), or an authored record
 * (`{…}`, `@meta{…}`) the door did not compile (one inside a blockquote). A record's keys arrive only through
 * `lattice_meta_expand`, so a whole one is a record D1 does not read and applies nothing.
 */
const WHOLE_RECORD = /^\s*<!--\s*(?:lat-meta:|\{|@meta\{)/;
/** A record (internal or authored) anywhere in a block: one folded into a larger HTML block counts too. */
const WHOLE_RECORD_ANYWHERE = /<!--\s*(?:lat-meta:|\{|@meta\{)/;
const { groupOnSlideRule } = require('../core/slide-rule');
const { INLINE_CODE_LITERAL, isLiteralFromSource } = require('../core/resolve-inline-code');
const { deckClassTokensFromFrontMatter } = require('../core/deck-class-register');

// The engine's directive VOCABULARY, bound once. The grammar itself lives in
// lib/core/comment-directive.js so a source-side reader (which cannot run this
// pipeline but must agree with it about what `<!-- class: … -->` means) shares
// the parse instead of re-spelling it.
const DIRECTIVE_VOCAB = { known: KNOWN_DIRECTIVES, flags: FLAG_DIRECTIVES };

// Pull a single `<!-- (_)key: value -->` directive out of a token's raw content.
// Returns { spot, key, value } or null.
const readDirectiveComment = (raw) => readComment(raw, DIRECTIVE_VOCAB);

/**
 * Does this slide's CHROME (`header:` / `footer:`) sit under `inline-code: literal`?
 *
 * `lattice_header_footer` is anchored inside the slide pipeline, which runs BEFORE
 * `deckClassPropagate` pushes the deck-wide tokens onto each section — so the resolved
 * class the inline grammar normally gates on does not exist yet here. This reconstructs
 * the same answer from the two things that DO exist at this point: the deck's front
 * matter, and whatever `lattice_directives_apply` has already put on the slide (its own
 * `_class:`, and Marp's deck-wide `class:`).
 *
 * It exists because chrome renders through `md.renderInline`, a fresh parse with no slide
 * tokens in it, so a per-slide gate cannot see which slide it belongs to. A checker found
 * that a literal deck kept drawing pills in its own header and footer — the two directives
 * a foreign deck is most likely to carry, and the exact case the register exists for.
 */
function slideIsInlineCodeLiteral(token, src) {
  // THE CLASS FIRST, because the class is the contract (lib/core/resolve-inline-code.js) and
  // everything below it is a fallback for the class not being stamped yet. All three checks
  // are OR'd so the order changes no answer — it is written this way so the order READS as
  // the rule it implements. Four documents described it in this order while the code did the
  // opposite, which a fact-checker caught; a mechanism nobody can read off the code is one
  // that drifts from its description again.
  //
  // The slide's OWN class, from `_class:` — already applied by `lattice_directives_apply`.
  if ((token.attrGet('class') || '').split(/\s+/).includes(INLINE_CODE_LITERAL)) return true;
  // Then the register itself, straight from the deck's front matter.
  if (isLiteralFromSource(src)) return true;
  // AND the deck-wide `class:`, read the same way `deckClassPropagate` reads it. That rule
  // runs ELEVEN rules after this one (`lattice_header_footer` is the 15th rule and
  // `deck_class_propagate` the 26th, of 29 — 0-based indices 14 and 25, which an earlier
  // draft of this comment quoted as ordinals), and re-appending the deck-wide token to a
  // slide that carries its own `_class:` is
  // its entire job — Marpit's local directive REPLACES the global one. So reading the
  // token's class alone answers correctly for a slide with no `_class:` and wrongly for a
  // slide with one: measured, `class: inline-code-literal` plus `<!-- _class: content -->`
  // gave a literal BODY and drawn CHROME inside a single section, with the token present on
  // that section's final class list. Reading the front matter here closes it without
  // depending on a rule that has not run yet.
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  return !!fm && deckClassTokensFromFrontMatter(fm[1]).includes(INLINE_CODE_LITERAL);
}

// PAGINATION is not a slide directive at all any more (the owner's ruling, 2026-10-20). Front matter `paginate:`
// numbers the deck, on unless it says `false` (lib/engine/index.js); a slide opts out with the `no-pagination`
// class and back in with `with-pagination`; a component opts its slides out by its manifest
// (`chrome.pagination: false`, read from the generated list below). A `paginate:` or `_paginate:` comment is
// consumed and ignored, and the deck lint says what to write instead.
const { paginateOn, slidePaginates } = require('../core/pagination.js');

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
  // The deck's exact shape ("1.33"), stamped as `data-aspect` unless it is 16:9 (lib/adaptive/families.js
  // `aspectStamp`). `data-orientation` and `data-family` name a band of shapes; a chart that scores its
  // layouts at the slide's real shape needs the shape itself (lib/plugins/chart-family).
  const aspect = opts.aspect || null;
  // ── 0a. The slide-metadata record, as the directive blocks every rule below reads ──────────────
  // The door (lib/core/meta-door.mjs `compileMetaSource`, run by the engine before the parse) turned each authored
  // record `<!-- {layout=cards, footer="Q3"} -->` into ONE internal comment on the same lines. Here, right after the
  // block parse and before any rule that reads a directive, that one block becomes one block per key, each carrying
  // the record's `map`: `_class`, `_footer`, `_pane`, the note channels. So the heading split, focus steps, the pane
  // carve and `lattice_directives` below read a record exactly as they read the comments it replaces, and spot,
  // carry and last-wins precedence are what they were (engineering/decisions/2026-10-17-meta-record.md §5.1). Only
  // a TOP-LEVEL block is expanded: the door writes no other, and an internal comment folded into a larger HTML block
  // stays inert (the notes extractor reads every `lat-*` comment as tooling).
  md.core.ruler.after('block', 'lattice_meta_expand', (state) => {
    if (state.inlineMode || !/<!--\s*(?:lat-meta:|\{|@meta\{)/.test(state.src)) return;
    const out = [];
    const sink = state.env?.pluginDiagnostics;
    for (const t of state.tokens) {
      const parts = t.type === 'html_block' && t.level === 0 ? expandInternal(t.content) : null;
      if (!parts) {
        // A record the engine does not apply (D1: inside a list item, a blockquote or a larger HTML block) is SAID, at
        // render time, not only by the linter: the author wrote a layout and the slide will not have it.
        if (sink && t.type === 'html_block' && WHOLE_RECORD_ANYWHERE.test(t.content) && t.map) {
          // The body is the deck less its front matter; the line is the author's, in the whole file, when that holds.
          const whole = String(state.env.markdown || '');
          const shift = whole.endsWith(state.src) ? whole.slice(0, whole.length - state.src.length).split('\n').length - 1 : null;
          const where = shift === null ? '' : `line ${t.map[0] + 1 + shift}: `;
          sink.push({
            key: `meta/record|inert|${t.map[0]}`,
            id: 'meta/record',
            plugin: 'meta',
            message: `${where}a slide record inside a list item, a blockquote or another HTML block is not applied; put it on its own line at the top level (meta-not-own-line).`,
          });
        }
        out.push(t);
        continue;
      }
      for (const p of parts) {
        const c = new state.Token('html_block', '', 0);
        c.content = `${p.text}\n`;
        c.block = true;
        c.map = t.map ? t.map.slice() : null;
        // PROVENANCE: this block came from a record, not from an authored directive comment. Step 6 of the record note
        // (the cut) can tell the two apart by this mark, whatever the bytes say.
        c.meta = p.noteOnly ? { latticeRecord: true, latticeNote: true } : { latticeRecord: true };
        out.push(c);
      }
    }
    state.tokens = out;
  });
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
    // `hide` is a SLIDE key only: a front-matter `hide:` would hide the whole deck, and every export would ship nothing
    // (the checker measured a 0-slide PDF, exit 0). The engine ignores it there, so lint's "Lattice does not read this
    // front-matter key" is true (engineering/decisions/2026-11-06-hidden-slides.md).
    delete runningGlobal.hide;
    // `focusSteps` likewise: a walk names ONE slide's units, so a deck-wide default would walk every later slide by
    // the same ordinals (and, beside a deck-wide `build:`, hide a column for good). Front matter does not set it, and,
    // as a slide-only key (its manifest `scope: slide`), a bare comment sets its own slide only
    // (engineering/decisions/2026-11-09-steps-as-a-behavior.md; red team #2).
    delete runningGlobal.focusSteps;
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
      // A record's `note` (lattice_meta_expand) is a speaker note whatever its words: never read as a directive.
      if (token.meta?.latticeNote) continue;
      // A record still whole here was not expanded (one inside a list item, a blockquote or a larger HTML block, which
      // D1 does not read), so it applies nothing; the expansion above is the only way a record's keys arrive.
      if (WHOLE_RECORD.test(token.content)) continue;
      const dir = readDirectiveComment(token.content);
      if (!dir) continue;
      // `hide` counts only as a TOP-LEVEL block with an on/off value (lib/core/hide-directive.mjs): `> <!-- hide -->`
      // and `<!-- hide: if short on time -->` are left alone, the second as the speaker note it is.
      if (dir.key === 'hide' && (token.type !== 'html_block' || token.level || !hideValue(dir.value))) continue;
      if (dir.key === 'paginate') {
        // Retired as a slide directive: front matter, the classes and the manifest decide (lib/core/pagination.js).
      } else if (dir.spot || SLIDE_ONLY_DIRECTIVES.has(dir.key)) {
        // A SLIDE-ONLY key (`header`, `footer`) sets this slide alone in EITHER spelling: Lattice is not Marp, and
        // front matter is the one way to set them for every slide (the owner's ruling, audit §11r).
        slideLocal[dir.key] = dir.value;
      } else {
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
    const deckTokens = deckClassTokensOf(state);
    for (const token of state.tokens) {
      if (token.type !== 'lattice_slide_open') continue;
      const dirs = token.meta.latticeDirectives || {};
      // A HIDDEN slide (`<!-- hide -->`, engineering/decisions/2026-11-06-hidden-slides.md) stays in this
      // document — the editor shows it, dimmed — but Present and every export leave it out, so it takes no
      // page number and is not in the total: the shown slides read 1..N with no gap (the owner's ruling,
      // 2026-11-06). `data-lattice-hidden` is the one mark every consumer filters on.
      const hidden = Object.hasOwn(dirs, 'hide') && hideValue(dirs.hide) === 'on';
      if (hidden) token.attrSet('data-lattice-hidden', 'true');
      // Count every SHOWN slide — the pagination number is the slide's 1-based position among the
      // slides the audience sees, and the total is how many they see. A shown slide whose number is
      // switched off (`no-pagination`) is still counted, so the next paginated slide reads its true
      // position, not one less. Incrementing only on paginated slides renumbered after an unnumbered
      // slide and undercounted the total (the parity sweep caught "2" rendering as "1").
      if (!hidden) pageNumber += 1;
      const style = styleFor(token);
      for (const key of Object.keys(dirs)) {
        if (!APPLIED_DIRECTIVES.has(key)) continue;
        const value = dirs[key];
        // `build` and `debug` are flag directives: a bare `_build`/`_debug` (empty
        // value) still emits `data-build=""` / `data-debug=""` — an empty `debug`
        // means "the default profile". Every other directive skips an empty value,
        // `track` included: an empty `_track:` is nothing to override with, so the
        // slide falls back to the derived track rather than to a track of nothing.
        if (!value && key !== 'build' && key !== 'debug') continue;
        // paginate is decided below, from front matter, the slide's classes and its component's manifest.
        if (key === 'paginate') continue;
        // theme only lands when the palette is registered, matching marp-core.
        if (key === 'theme' && !isThemeKnown(value)) continue;
        const kb = kebab(key);
        token.attrSet(`data-${kb}`, value);
        // No CSS custom property for a directive read by CODE rather than by CSS
        // (`build`, `debug`, `track`) — the prop would be dead bytes for export to
        // strip. The set is named in directives.js beside the directives themselves.
        if (value && !NO_CUSTOM_PROP.has(key)) style.set(`--${kb}`, value);
      }
      if (dirs.class) token.attrJoin('class', dirs.class);
      if (orientation) token.attrSet('data-orientation', orientation);
      if (family) token.attrSet('data-family', family);
      if (aspect) token.attrSet('data-aspect', aspect);
      if (dirs.color) style.set('color', dirs.color);
      if (dirs.backgroundColor) style.set('background-color', dirs.backgroundColor).set('background-image', 'none');
      // URL-TYPED FIELD: a `url()` outside the scheme allowlist (lib/core/url-scheme.js) is dropped, with a
      // diagnostic, and the slide keeps no background image (design note 2026-10-17-meta-record.md §5.7).
      let bgImage = dirs.backgroundImage;
      if (bgImage) {
        let verdict = cssUrlVerdict(bgImage);
        // A value the declaration sink would drop anyway (a quote, a backslash escape, a `;`) is dropped
        // WITH the diagnostic too, so "dropped" never happens in silence.
        if (verdict.ok && !realDeclValueIsSafe(bgImage)) {
          verdict = { ok: false, url: bgImage, reason: 'it is not a plain url() or CSS value (a semicolon, a backslash, or a quote inside a function is refused)' };
        }
        if (!verdict.ok) {
          const diags = state.env?.pluginDiagnostics;
          const key = `meta/url-scheme|${verdict.url}`;
          if (Array.isArray(diags) && !diags.some((d) => d.key === key)) {
            diags.push({ key, id: 'meta/url-scheme', plugin: 'meta', message: `backgroundImage was dropped: ${verdict.reason}.`, detail: String(verdict.url).slice(0, 120) });
          }
          bgImage = '';
        }
      }
      if (bgImage) {
        style.set('background-image', bgImage)
          .set('background-position', dirs.backgroundPosition || 'center')
          .set('background-repeat', dirs.backgroundRepeat || 'no-repeat')
          .set('background-size', dirs.backgroundSize || 'cover');
      }
      if (!hidden && paginates(dirs, deckTokens)) {
        token.attrSet('data-paginate', 'true');
        style.set('--paginate', 'true');
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
    // The env handed to chrome's renderInline, reassigned per slide below. It starts as
    // the ONE flag and never as `state.env`: a token stream that emitted chrome before any
    // `lattice_slide_open` would otherwise hand the full render env to `renderInline` and
    // bring back the link-reference bug the per-slide assignment exists to avoid. No such
    // stream exists today — which is exactly why this line has to be right rather than
    // merely unreached.
    let inlineEnv = { latticeInlineCodeLiteral: false };
    const deckSrc = (state.env && (state.env.markdown || state.env.source)) || state.src || '';
    for (const token of state.tokens) {
      if (token.type === 'lattice_slide_open') {
        out.push(token);
        // `renderInline` re-enters the parser with NO slide tokens, so a core rule that
        // gates per slide cannot see which slide this chrome belongs to. Hand the answer
        // down. Today one rule needs it — the inline directive grammar, whose
        // `inline-code: literal` gate was silently inert here, so a deck that turned
        // pills off still drew them in its own header and footer.
        // ONLY the one flag — deliberately NOT `{ ...state.env }`. Spreading the render env
        // hands chrome markdown-it's `references` map, populated by the block parse of the
        // deck BODY, so `header: 'See [x] and [docs]'` started resolving link-reference
        // definitions written a hundred lines away and rendering as an anchor. Measured on
        // a deck that does not use this register at all: a silent render change on a
        // surface this feature never set out to touch. The gate wants one boolean; it took
        // the whole env with it.
        inlineEnv = { latticeInlineCodeLiteral: slideIsInlineCodeLiteral(token, deckSrc) };
        if (token.meta.latticeHeader) {
          out.push(rawBlock(state, `<header>${state.md.renderInline(token.meta.latticeHeader, inlineEnv)}</header>`));
        }
        footer = token.meta.latticeFooter || null;
        continue;
      }
      if (token.type === 'lattice_slide_close') {
        if (footer) out.push(rawBlock(state, `<footer>${state.md.renderInline(footer, inlineEnv)}</footer>`));
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

/**
 * Does this slide show its page number? The slide's own class first (`no-pagination` off, `with-pagination` on,
 * `silent` off), then its component's manifest (`chrome.pagination: false`), then the deck: front matter
 * `paginate:`, defaulted to on by lib/engine/index.js. The rule itself is lib/core/pagination.js. A slide is counted either
 * way, so the next one reads its true position. Every reason a number disappears is decided here, so no slide
 * carries `data-lattice-pagination` it does not show (the CSS opt-outs yield to `with-pagination`).
 */
function paginates(dirs, deckTokens = []) {
  // The deck's `class:` reaches every slide (a slide's own `_class` adds to it), so a deck-wide
  // `class: no-pagination` decides here too; reading the slide's class alone stamped
  // `data-lattice-pagination` on slides the CSS then hid (found by the inversion pass).
  return slidePaginates([...deckTokens, ...String(dirs.class || '').split(/\s+/).filter(Boolean)], paginateOn(dirs.paginate));
}

/** The deck's `class:` tokens, read from the source's front matter (the rule runs before they are on the slides). */
function deckClassTokensOf(state) {
  const src = (state.env && (state.env.markdown || state.env.source)) || state.src || '';
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  return fm ? deckClassTokensFromFrontMatter(fm[1]) : [];
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

// `realDeclValueIsSafe` lives in lib/core/decl-value-safe.js, shared with the placed-picture rule, which must know which
// `backgroundImage` values this sink writes (lib/core/placed-picture.mjs).


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
 *  Two passes used to touch a slide's style (the directive applier and the `![bg]` background
 *  rule, which the engine retired on 2026-11-13; the directive applier is the one writer left,
 *  and any later pass must continue from this map), and the second used to do `new InlineStyle(token.attrGet('style'))` — re-parsing the
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
