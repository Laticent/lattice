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
 * bakes it into list-contract.generated.js with the element each list depth is read as (from the
 * list slots' `match.marker`). This kernel enforces it ONCE, before any layout sees the slide, so
 * no layout, chart kernel or stylesheet has to know that an author has two markers:
 *
 *   neutral        every list on the slide becomes the element its depth names (`ol` where the
 *                  slot says `ordered`, `ul` everywhere else), whichever marker the author typed.
 *   numbered-tags  the outermost list carries `data-ordered="true|false"` (what the author wrote)
 *                  and becomes the element its slot names, if it names one (list-steps' cards are
 *                  styled on `ol`, so a `-` list becomes an `ol` with `data-ordered="false"`, and
 *                  the stylesheet drops the tag). Deeper lists are treated as `neutral`.
 *   prose          nested lists render as written. The outermost list does too, unless a register
 *                  styles both markers on one element: `list principles` names `ordered`, so a `-`
 *                  list becomes an `ol` with `data-ordered="false"` and draws dots, not numbers.
 *
 * A list inside a blockquote (the Key Insight callout, a quoted aside) is left exactly as written:
 * it is the author's prose, not the layout's body, and the layout's `ol` CSS would restyle it.
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
 * The contract for a slide's class list: `{ lists, markers }`, or null when the slide names no
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
  return { component: name, lists: pick.lists, markers: pick.markers };
}

/**
 * The element a list at `depth` (1 = outermost) becomes under `contract`, or null to leave it as
 * the author wrote it.
 */
function targetElement(contract, depth) {
  if (!contract) return null;
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
 */
function normalizeListTokens(tokens) {
  let contract = null;
  const stack = []; // per open list: the element its close token must become, or null
  let quoted = 0; // blockquote depth: a callout's list is prose, not the layout's body
  for (const t of tokens) {
    if (t.type === 'lattice_slide_open') {
      contract = listContractFor(t.attrGet('class'));
      if (contract && !applies(contract)) contract = null;
      if (contract) t.attrSet(STAMP, contract.lists);
      stack.length = 0;
      continue;
    }
    if (t.type === 'lattice_slide_close') {
      contract = null;
      continue;
    }
    if (!contract) continue;
    if (t.type === 'blockquote_open') quoted++;
    else if (t.type === 'blockquote_close') quoted--;
    if ((t.type === 'bullet_list_open' || t.type === 'ordered_list_open') && quoted > 0) {
      stack.push(null);
      continue;
    }
    if (t.type === 'bullet_list_open' || t.type === 'ordered_list_open') {
      const depth = stack.length + 1;
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
      stack.push(want && want !== wrote ? want : null);
      continue;
    }
    if (t.type === 'bullet_list_close' || t.type === 'ordered_list_close') {
      const want = stack.pop();
      if (want) {
        t.type = CLOSE[want];
        t.tag = want;
        t.markup = want === 'ol' ? '.' : '-';
      }
    }
  }
  return tokens;
}

/** The lists inside `section` at `depth` 1 from it, in document order, skipping deeper ones. */
function listsByDepth(section) {
  const out = [];
  const walk = (el, depth) => {
    for (const child of el.children) {
      const tag = child.tagName.toLowerCase();
      if (tag === 'blockquote') continue; // a callout's list is prose, not the layout's body
      if (tag === 'ul' || tag === 'ol') {
        out.push({ el: child, depth });
        walk(child, depth + 1);
      } else walk(child, depth);
    }
  };
  walk(section, 1);
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
    for (const { el, depth } of listsByDepth(section).reverse()) {
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

module.exports = { STAMP, listContractFor, targetElement, normalizeListTokens, normalizeListsDom };
