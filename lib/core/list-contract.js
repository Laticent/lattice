/**
 * lib/core/list-contract.js — ONE LIST CONTRACT: what `1.` versus `-` means on a slide.
 *
 * An author has two list markers, and before this kernel every layout gave them its own meaning:
 * `agenda` drew its ledger only for `1.`, `cycle` drew its loop only for `-`, sixteen chart kinds
 * read only a nested `-`, and the rest rendered either marker the same. The owner's rules
 * (engineering/decisions/2026-11-19-deterministic-authoring-audit.md, Finding 2, W2):
 *
 *   R1 `prose`          the native list renders: `1.` numbers, `-` bullets (content, list).
 *   R2 `numbered-tags`  card layouts: `1.` turns the cards' number tags on, `-` leaves them off
 *                       (cards-grid, cards-stack, list-steps, split-panel steps and watermark).
 *   R3 `neutral`        every other layout: the marker means nothing, both render the same.
 *
 * Each manifest declares its contract (`lists`, `variantLists`), and tools/build-stage-catalog.js
 * bakes it into list-contract.generated.js: the contract, the element each list depth is read as
 * (from the list slots' `match.marker`, or a slot selector that names only `ol`), and `depths`, the
 * deepest list level any slot reads. This kernel enforces it ONCE, before any layout sees the slide,
 * so no layout, chart kernel or stylesheet has to know that an author has two markers:
 *
 *   neutral        each of the layout's lists, down to `depths`, becomes the element its depth
 *                  names (`ol` where the slot reads `ol`, `ul` otherwise), whichever marker the
 *                  author typed.
 *   numbered-tags  the outermost list carries `data-ordered="true|false"` (what the author wrote)
 *                  and becomes the element its slot names, if it names one (list-steps' cards are
 *                  styled on `ol`, so a `-` list becomes an `ol` with `data-ordered="false"`, and
 *                  the stylesheet drops the tag). Levels 2 to `depths` are treated as `neutral`.
 *   prose          the author's lists render as written, unless a register styles both markers on
 *                  one element: `list principles` names `ordered`, so a `-` list becomes an `ol`
 *                  with `data-ordered="false"` and draws dots, not numbers.
 *
 * What stays the AUTHOR'S, exactly as written: a list nested below `depths` (the owner's ruling on
 * #3330: a nested `1.` keeps its numbers and its meaning to a screen reader); a list inside a
 * blockquote; a list inside a raw-HTML container (`<div>` … `</div>`); and an aside, a top-level list
 * that follows prose with no heading after it. The layout's own lists are the first top-level list
 * and each later one that only a heading, a comment or nothing separates from the one before.
 * test/unit/core/list-contract.test.js holds each layout's stylesheet to the same boundary: it may
 * not style one marker only below `depths`, nor reach a list through a bare descendant combinator.
 *
 * The deck's front-matter `class:` counts (`class: steps` sets split-panel's contract), read here
 * because this pass runs before `deck_class_propagate`.
 *
 * A list that changes element keeps a `1.` list's start number as the `--lat-split-offset` the
 * counter layouts read (the job markdown-it `orderedListStart` does for an `ol` that stays one).
 *
 * Two entry points, one rule (HARD RULE #1): `normalizeListTokens` runs in the engine's markdown-it
 * chain (lib/integrations/markdown-it/plugins.js `listContract`, before every list reader), and
 * `normalizeListsDom` is the runtime's mirror for a Marp render (lib/runtime/index.js). Both stamp
 * the slide `data-list-contract`, and the mirror never revisits a stamped slide, so it is idempotent
 * and never rewrites a list a chart transform built after it ran.
 *
 * Pure, dependency-free apart from the generated table, so it bundles into the browser runtime.
 */

const CATALOG = require('./list-contract.generated.js');

/** Whole-token test on a class list (`timeline` must not match `timeline-list`). */
const tokensOf = (cls) => String(cls || '').split(/\s+/).filter(Boolean);

/**
 * The contract for a slide's class list: `{ component, lists, depths, markers }`, or null when the slide names no
 * component that reads a list. The component is the first class token the table knows; a variant
 * row (`split-panel steps`) wins over the component's own when the slide carries that variant.
 */
function listContractFor(classes) {
  const toks = Array.isArray(classes) ? classes : tokensOf(classes);
  const name = toks.find((t) => Object.hasOwn(CATALOG, t));
  if (!name) return null;
  const row = CATALOG[name];
  const v = row.variants && toks.find((t) => Object.hasOwn(row.variants, t));
  const pick = v ? row.variants[v] : row;
  return { component: name, lists: pick.lists, depths: pick.depths, markers: pick.markers };
}

/**
 * The element a list at `depth` (1 = outermost) becomes under `contract`, or null to leave it as
 * the author wrote it.
 */
function targetElement(contract, depth) {
  if (!contract) return null;
  // Below the deepest list a slot reads, the list is the author's: a nested `1.` keeps its `<ol>`
  // (and its meaning to a screen reader) instead of becoming a `ul` nobody asked for.
  if (depth > contract.depths) return null;
  const named = contract.markers[depth - 1] || null;
  if (contract.lists === 'prose') return depth === 1 ? named : null;
  if (contract.lists === 'numbered-tags' && depth === 1) return named;
  return named || 'ul';
}

/**
 * Does the outermost list record the author's marker as `data-ordered`? Always on a
 * `numbered-tags` layout (its tags read it); on a `prose` one only when a register styles both
 * markers on one element (`list principles`: an `ol`, numbered for `1.`, dotted for `-`).
 */
const recordsMarker = (contract) =>
  contract.lists === 'numbered-tags' || (contract.lists === 'prose' && !!contract.markers[0]);

/**
 * The section attribute that says "these lists are in their contract's shape". The engine writes
 * it on every slide it normalizes; the runtime mirror skips a section that carries it and writes it
 * on one it normalizes. That is what keeps the mirror off lists a LATER transform builds: a chart
 * kind draws its own `<ol class="journey-stages">`, and the runtime's next pass must not rewrite it.
 */
const STAMP = 'data-list-contract';

/** The attribute an aside list carries (a top-level list after prose), on the engine and the runtime. */
const ASIDE = ['data-list', 'aside'];

/** Does `contract` change anything on a slide? (`prose` only where a register names a marker.) */
const applies = (contract) => contract.lists !== 'prose' || !!contract.markers[0];

const OPEN = { ul: 'bullet_list_open', ol: 'ordered_list_open' };
const CLOSE = { ul: 'bullet_list_close', ol: 'ordered_list_close' };
const ELEMENT_OF = { bullet_list_open: 'ul', ordered_list_open: 'ol', bullet_list_close: 'ul', ordered_list_close: 'ol' };

/** Append `--lat-split-offset` for a `1.` list that started past 1 and is no longer an `ol`. */
function offsetStyle(cur, start) {
  const head = String(cur || '').trimEnd();
  return `${head && !head.endsWith(';') ? `${head};` : head}--lat-split-offset:${start - 1};`;
}

/**
 * The engine side: rewrite the list tokens of every `lattice_slide_open … lattice_slide_close`
 * range in place. A token stream with no slide containers (a bare markdown-it parse) is left alone.
 *
 * `deckClasses` are the deck's front-matter `class:` tokens. This pass runs before
 * `deck_class_propagate` puts them on each slide (it has to run before every reader of a list), so a
 * deck-wide variant (`class: steps`, `class: principles`) is read here, the way `tableRowLabels`
 * reads it, instead of being missed.
 *
 * Which lists are the LAYOUT'S: the first top-level list, and each later one unless prose stands
 * between it and the one before with no heading after the prose. So a sectioned body
 * (`regulatory-update`'s `### Added` / `### Amended`) is all the layout's, a marker change or a
 * comment between two lists changes nothing, and a list after a line of prose ("Open risks:") is the
 * author's aside. An aside, a list inside a blockquote, and a list inside a raw-HTML container
 * (`<div>` … `</div>`, even one Markdown parses inside it) are left exactly as written, at every depth.
 */
function normalizeListTokens(tokens, deckClasses = []) {
  let contract = null;
  const stack = []; // per open list: { want: the element its close becomes, or null; aside }
  let quoted = 0; // blockquote depth
  let tops = 0; // top-level lists seen on this slide
  let prose = false; // prose (or raw HTML) since the last top-level list, with no heading after it
  let html = 0; // open raw-HTML containers (`<div>` … `</div>` written as html_blocks)
  for (const t of tokens) {
    if (t.type === 'lattice_slide_open') {
      const own = tokensOf(t.attrGet('class'));
      contract = listContractFor([...own, ...deckClasses.filter((c) => !own.includes(c))]);
      if (contract && !applies(contract)) contract = null;
      if (contract) t.attrSet(STAMP, contract.lists);
      stack.length = 0;
      quoted = 0;
      tops = 0;
      prose = false;
      html = 0;
      continue;
    }
    if (t.type === 'lattice_slide_close') {
      contract = null;
      continue;
    }
    if (!contract) continue;
    if (t.type === 'blockquote_open') quoted++;
    else if (t.type === 'blockquote_close') quoted--;
    else if (!stack.length && !quoted) {
      if (t.type === 'heading_open') prose = false;
      else if (t.type === 'paragraph_open' && tops) prose = true;
      else if (t.type === 'html_block' && !/^\s*<!--/.test(t.content)) {
        // A raw element is the author's HTML: a list written inside `<div>` … `</div>` is theirs.
        const open = (t.content.match(/<(div|section|aside|figure|details|article)\b/gi) || []).length;
        const close = (t.content.match(/<\/(div|section|aside|figure|details|article)>/gi) || []).length;
        html = Math.max(0, html + open - close);
        if (tops) prose = true;
      }
    }
    if (t.type === 'bullet_list_open' || t.type === 'ordered_list_open') {
      const depth = stack.length + 1;
      const inAside = quoted > 0 || html > 0 || stack.some((e) => e.aside);
      if (depth === 1 && !quoted && !html) {
        const body = tops === 0 || !prose;
        tops++;
        prose = false;
        if (!body) {
          // Stamped so a layout's stylesheet can tell its own list from the author's aside
          // (`ol:where(.cell-stage > :not([data-list="aside"]))`); the element stays as written.
          t.attrSet(ASIDE[0], ASIDE[1]);
          stack.push({ want: null, aside: true });
          continue;
        }
      }
      if (inAside) {
        stack.push({ want: null, aside: true });
        continue;
      }
      const wrote = ELEMENT_OF[t.type];
      if (depth === 1 && recordsMarker(contract) && t.attrGet('data-ordered') === null) {
        t.attrSet('data-ordered', wrote === 'ol' ? 'true' : 'false');
      }
      const want = targetElement(contract, depth);
      if (want && want !== wrote) {
        const start = Number(t.attrGet('start'));
        if (wrote === 'ol' && Number.isInteger(start) && start > 1) t.attrSet('style', offsetStyle(t.attrGet('style'), start));
        if (t.attrs) t.attrs = t.attrs.filter(([k]) => k !== 'start');
        t.type = OPEN[want];
        t.tag = want;
        t.markup = want === 'ol' ? '.' : '-';
      }
      stack.push({ want: want && want !== wrote ? want : null, aside: false });
      continue;
    }
    if (t.type === 'bullet_list_close' || t.type === 'ordered_list_close') {
      const want = stack.pop()?.want;
      if (want) {
        t.type = CLOSE[want];
        t.tag = want;
        t.markup = want === 'ol' ? '.' : '-';
      }
    }
  }
  return tokens;
}

const HEADING = /^h[1-6]$/;

/**
 * The layout's lists inside `section`, with their depth, by the engine's rule above (an aside is
 * stamped `data-list="aside"` on the way, as the engine stamps it). The walk
 * follows only what Markdown builds: the section's own children and the engine's `cell-*` wrappers
 * at the top, and lists nested directly in an item below that. It never walks into an author's raw
 * HTML element (`<div>`, which the engine leaves as written too) or a blockquote; any element other
 * than a heading or a list after the first list counts as prose, as the engine counts a paragraph.
 */
function layoutLists(section) {
  const out = [];
  let tops = 0;
  let prose = false;
  const nested = (list, depth) => {
    for (const li of list.children) {
      for (const child of li.children) {
        const tag = child.tagName.toLowerCase();
        if (tag === 'ul' || tag === 'ol') {
          out.push({ el: child, depth });
          nested(child, depth + 1);
        }
      }
    }
  };
  const top = (el) => {
    for (const child of el.children) {
      const tag = child.tagName.toLowerCase();
      if (HEADING.test(tag)) prose = false;
      else if (tag === 'ul' || tag === 'ol') {
        const body = tops === 0 || !prose;
        tops++;
        prose = false;
        if (!body) {
          child.setAttribute(ASIDE[0], ASIDE[1]);
          continue;
        }
        out.push({ el: child, depth: 1 });
        nested(child, 2);
      } else if (/(^|\s)cell-/.test(child.getAttribute('class') || '')) top(child);
      else if (tops) prose = true;
    }
  };
  top(section);
  return out;
}

/**
 * The runtime side, for a Marp render (where no markdown-it plugin ran): the same rule on the live
 * DOM of every slide section under `root`, ONCE per section (`data-list-contract`, above), before
 * any transform has built lists of its own. An element that changes is rebuilt with its attributes
 * and children; nothing is parsed from a string (HARD RULE #22). Returns how many lists changed.
 */
function normalizeListsDom(root, selector = 'section') {
  if (!root?.querySelectorAll) return 0;
  let changed = 0;
  for (const section of root.querySelectorAll(selector)) {
    if (section.hasAttribute(STAMP)) continue;
    const contract = listContractFor(section.getAttribute('class'));
    if (!contract || !applies(contract)) continue;
    section.setAttribute(STAMP, contract.lists);
    // Deepest first, so a rebuilt outer list carries already-rebuilt children.
    for (const { el, depth } of layoutLists(section).reverse()) {
      const wrote = el.tagName.toLowerCase();
      if (depth === 1 && recordsMarker(contract) && !el.hasAttribute('data-ordered')) {
        el.setAttribute('data-ordered', wrote === 'ol' ? 'true' : 'false');
      }
      const want = targetElement(contract, depth);
      if (!want || want === wrote) continue;
      const next = el.ownerDocument.createElement(want);
      for (const { name, value } of [...el.attributes]) if (name !== 'start') next.setAttribute(name, value);
      const start = Number(el.getAttribute('start'));
      if (wrote === 'ol' && Number.isInteger(start) && start > 1) next.setAttribute('style', offsetStyle(el.getAttribute('style'), start));
      while (el.firstChild) next.appendChild(el.firstChild);
      el.replaceWith(next);
      changed++;
    }
  }
  return changed;
}

module.exports = { STAMP, ASIDE, listContractFor, targetElement, normalizeListTokens, normalizeListsDom };
