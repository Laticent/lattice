/**
 * Pane CSS — give a PANE (lib/core/panes.js) the rules its component already has.
 *
 * Component CSS reaches its content through the slide: `section.list > .cell-stage > ul`.
 * A slide with two panes can only answer "which component are you?" once, so each pane
 * is a `<lat-pane class="list form">` element carrying its component's classes. This
 * kernel adds, beside every rule arm that reaches a pane's body, the same arm rooted at
 * `lat-pane` instead of `section`:
 *
 *     section.list > .cell-stage > ul   →   section.list > .cell-stage > ul, lat-pane.list > .cell-stage > ul
 *
 * Nothing is copied: the twin lives in the SAME rule, so it keeps the rule's source order,
 * and `lat-pane` is a type selector like `section`, so it keeps its specificity.
 *
 * AN ARM IS TWINNED when it is rooted at `section` and either
 *   - its first compound names a component (or the chart family's `chart-frame`) —
 *     the component sheets, and the theme rules keyed to a component, such as the a11y
 *     texture channel in themes/a11y-base.css; or
 *   - it reaches THROUGH `.cell-stage` — the base stage defaults every body gets
 *     (table rules, list rhythm, code).
 * Slide-level rules (padding, backdrop, pagination, a bare `section`) never reach a pane.
 *
 * APPLIED ONLY TO A DECK THAT HAS PANES, at the point a deck's stylesheet is assembled:
 * the engine's `composeCss` (Studio, Playground, player) and the CLI's inlined sheet. The
 * shipped `dist/lattice.css` is never widened, so every other deck — and the
 * Export-to-Marp bundle, whose scoper reads only a literal leading `section` — gets
 * exactly the bytes it had. A leading `:is(a, b)` list is distributed first, so each
 * arm is judged, and twinned, on its own (the Marp-safe shape).
 *
 * Pure and fs-free, so the browser bundle shares it (HARD RULE #1).
 */

const { splitSelectorList, leadingIsArms } = require('./leading-is');
const { COMPONENT_NAMES } = require('./resolve-component');

const FAMILY_CLASSES = ['chart-frame'];
const COMPONENT_CLASS_RE = new RegExp(
  `\\.(?:${[...COMPONENT_NAMES, ...FAMILY_CLASSES].map((c) => c.replace(/[-]/g, '\\-')).join('|')})(?![\\w-])`,
);
const SECTION_ROOT_RE = /^section(?![\w-])/;
const STAGE_RE = /\.cell-stage(?![\w-])/;

/** The first compound of a selector: everything before its first top-level combinator. */
function firstCompound(sel) {
  let depth = 0;
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (depth === 0 && (c === ' ' || c === '>' || c === '+' || c === '~' || c === '\n' || c === '\t')) return sel.slice(0, i);
  }
  return sel;
}

/** Remove every `:not(…)` group (nested parens included): a class it names is an EXCLUSION,
 *  so `section:where(:not(.glossary))` is not a glossary rule. */
function dropNegations(compound) {
  let out = '';
  let i = 0;
  while (i < compound.length) {
    if (compound.startsWith(':not(', i)) {
      let depth = 0;
      let j = i + 4;
      for (; j < compound.length; j++) {
        if (compound[j] === '(') depth++;
        else if (compound[j] === ')' && --depth === 0) break;
      }
      i = j + 1;
      continue;
    }
    out += compound[i++];
  }
  return out;
}

/** Does this single (already distributed) selector reach a pane's body? */
function reachesPane(sel) {
  if (!SECTION_ROOT_RE.test(sel)) return false;
  return COMPONENT_CLASS_RE.test(dropNegations(firstCompound(sel))) || STAGE_RE.test(sel);
}

/** The selector list with a `lat-pane` twin after each arm that reaches a pane. */
function twinSelectorList(list) {
  let changed = false;
  const out = [];
  for (const part of splitSelectorList(list)) {
    const lead = part.match(/^\s*/)[0];
    const sel = part.trim();
    const li = leadingIsArms(sel);
    const arms = li ? li.arms.map((a) => a.trim() + li.rest) : [sel];
    const twins = arms.filter(reachesPane).map((a) => `lat-pane${a.slice('section'.length)}`);
    if (!twins.length) {
      out.push(part);
      continue;
    }
    changed = true;
    // Distribute the head so every arm is a plain selector, then add the twins.
    out.push(lead + [...arms, ...twins].join(', '));
  }
  return changed ? out.join(',') : list;
}

/**
 * Widen a stylesheet for a deck with panes. Walks style rules the way the engine's
 * `packTheme` does — at-rule preludes and `@keyframes` frames are left alone.
 */
function widenForPanes(css) {
  if (!css?.includes('section')) return css;
  let out = '';
  let seg = 0;
  let depth = 0;
  let keyframeDepth = -1;
  let inComment = false;
  for (let i = 0; i < css.length; i++) {
    if (inComment) {
      if (css[i] === '*' && css[i + 1] === '/') {
        inComment = false;
        i++;
      }
      continue;
    }
    if (css[i] === '/' && css[i + 1] === '*') {
      inComment = true;
      i++;
      continue;
    }
    const ch = css[i];
    if (ch === '{') {
      // Comments come out FIRST and ride ahead of the selector list. A comment BETWEEN two
      // arms (base.sketch.css has one) must not hide the arms before it, and a `;` INSIDE a
      // comment must not be read as the end of a hoisted statement — that split a comment
      // in half and broke the selector after it (the rule defining --sketch-ink, measured).
      let comments = '';
      const prelude = css.slice(seg, i).replace(/\/\*[\s\S]*?\*\//g, (c) => {
        comments += c;
        return '';
      });
      // A hoisted statement ahead of the rule (`@import …;`) passes through untouched.
      const semi = prelude.lastIndexOf(';') + 1;
      const head = prelude.slice(0, semi);
      const sel = prelude.slice(semi);
      const trimmed = sel.trim();
      let next = sel;
      if (trimmed.startsWith('@')) {
        if (keyframeDepth < 0 && /^@(?:-\w+-)?keyframes\b/.test(trimmed)) keyframeDepth = depth;
      } else if (keyframeDepth < 0 && trimmed.includes('section')) {
        next = twinSelectorList(sel);
      }
      out += head + comments + next + '{';
      depth++;
      seg = i + 1;
    } else if (ch === '}') {
      out += css.slice(seg, i + 1);
      depth--;
      if (keyframeDepth >= 0 && depth === keyframeDepth) keyframeDepth = -1;
      seg = i + 1;
    }
  }
  return out + css.slice(seg);
}

/** Does this rendered HTML hold a pane? The one test every assembler uses. */
function hasPanes(html) {
  return typeof html === 'string' && html.includes('<lat-pane ');
}

module.exports = { widenForPanes, reachesPane, twinSelectorList, hasPanes };
