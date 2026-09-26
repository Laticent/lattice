/**
 * Pane CSS — give a PANE (lib/core/panes.js) the rules its component already has.
 *
 * Component CSS reaches its content through the slide: `section.list > .cell-stage > ul`.
 * A slide with two panes can only answer "which component are you?" once, so each pane
 * is a `<lat-pane class="list form">` element carrying its component's classes. This
 * kernel adds, beside every rule arm that reaches a pane's body, the same arm rooted at
 * the pane inside its slide:
 *
 *     section.list > .cell-stage > ul   →   section.list > .cell-stage > ul, section lat-pane.list > .cell-stage > ul
 *
 * Nothing is copied: the twin lives in the SAME rule, so it keeps the rule's source order and
 * its declarations. It carries ONE more type selector than the slide rule — identically in the
 * CLI and in the engine's packed sheet — so a pane's own component wins a tie against a
 * slide-level rule that reaches down into the pane through the host section.
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
 * exactly the bytes it had. A leading `:is(a, b)` is split only to FIND its arms; the authored
 * selector is emitted untouched, and each twin is a plain `section lat-pane…` selector.
 *
 * Pure and fs-free, so the browser bundle shares it (HARD RULE #1).
 */

const { splitSelectorList, leadingIsArms } = require('./leading-is');
const { COMPONENT_NAMES } = require('./resolve-component');

const FAMILY_CLASSES = ['chart-frame'];
// Every regex metacharacter escaped, backslash included, so a class name can only ever
// match itself (names are `[a-z0-9-]` today; the escape does not rely on that).
const escapeRe = (x) => x.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
const COMPONENT_CLASS_RE = new RegExp(
  `\\.(${[...COMPONENT_NAMES, ...FAMILY_CLASSES].map(escapeRe).join('|')})(?![\\w-])`, 'g',
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

/** The classes a compound names OUTSIDE any `( … )` — required of the element, unlike the
 *  alternatives inside `:is(.a, .b)` or `:where(…)`. */
function topLevelClasses(compound) {
  let depth = 0;
  let flat = '';
  for (const c of compound) {
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (depth === 0) flat += c;
  }
  return [...flat.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
}

/**
 * Does this single (already distributed) selector reach a pane's body — and, when `only` (the
 * classes the deck's panes carry) is given, a pane THIS deck has? An arm keyed to a component
 * reaches only a pane of that component, so `section.kpi > .cell-stage > ul` is not twinned for
 * a deck whose panes are a list and a table. An arm keyed to no component that reaches through
 * `.cell-stage` is a base stage default every pane's body gets.
 */
function reachesPane(sel, only) {
  if (!SECTION_ROOT_RE.test(sel)) return false;
  const root = dropNegations(firstCompound(sel));
  // Every plain class on the root compound must be one this deck's panes carry, or the twin can
  // match nothing (`section.lat-pane-host …` is the slide; `section.print …` needs a print pane).
  if (only && topLevelClasses(root).some((c) => !only.has(c))) return false;
  const named = [...root.matchAll(COMPONENT_CLASS_RE)].map((m) => m[1]);
  if (named.length) return !only || named.some((c) => only.has(c));
  return STAGE_RE.test(sel);
}

/**
 * The selector list with a pane twin after each arm that reaches a pane. The authored
 * selector is kept byte for byte (a leading `:is()` is only split to FIND the arms, never in
 * the output), and each twin is `section lat-pane…`: a pane always sits inside a slide, and the
 * one extra type selector is the SAME in every path — the engine's pack prefixes a twin
 * exactly this way — so wherever a slide-level rule reaching down through the host ties a
 * pane rule, the pane's own component wins (`section:not(.math) .katex` must not restyle a
 * math pane's equations).
 */
function twinSelectorList(list, only) {
  let changed = false;
  const out = [];
  for (const part of splitSelectorList(list)) {
    const sel = part.trim();
    const li = leadingIsArms(sel);
    const arms = li ? li.arms.map((a) => a.trim() + li.rest) : [sel];
    const twins = arms.filter((a) => reachesPane(a, only)).map((a) => `section lat-pane${a.slice('section'.length)}`);
    if (!twins.length) {
      out.push(part);
      continue;
    }
    changed = true;
    out.push(`${part.replace(/\s+$/, '')}, ${twins.join(', ')}`);
  }
  return changed ? out.join(',') : list;
}

/**
 * Index just past a quoted string or an unquoted `url(…)` that opens at `i`, or -1 when none
 * does. Quoted strings honor `\` escapes and end at an unescaped newline, as a browser ends a
 * bad string there — so one unterminated string cannot swallow the rest of an author's sheet.
 * An unquoted `url(` runs to its `)`: an apostrophe inside `url(data:…'…)` is not a quote.
 */
function skipToken(text, i) {
  const ch = text[i];
  if (ch === '"' || ch === "'") {
    let j = i + 1;
    while (j < text.length && text[j] !== ch && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
    return Math.min(j + 1, text.length);
  }
  if ((ch === 'u' || ch === 'U') && /^url\(\s*[^\s"')]/i.test(text.slice(i, i + 64))
    && !/[\w-]/.test(text[i - 1] || '')) {
    const close = text.indexOf(')', i + 4);
    return close < 0 ? text.length : close + 1;
  }
  return -1;
}

/** Split a prelude into its comments and the rest, token-aware: a `/*` or `;` inside a
 *  quoted attribute value is text. `semi` is the index in `rest` just past its last
 *  top-level `;` (0 when none) — where a hoisted statement ends and the selector begins. */
function pullComments(text) {
  let comments = '';
  let rest = '';
  let semi = 0;
  let i = 0;
  while (i < text.length) {
    const end = skipToken(text, i);
    if (end >= 0) {
      rest += text.slice(i, end);
      i = end;
    } else if (text[i] === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      const stop = close < 0 ? text.length : close + 2;
      comments += text.slice(i, stop);
      i = stop;
    } else {
      rest += text[i];
      if (text[i] === ';') semi = rest.length;
      i++;
    }
  }
  return { comments, rest, semi };
}

/**
 * Widen a stylesheet for a deck with panes. Walks style rules the way the engine's
 * `packTheme` does — at-rule preludes and `@keyframes` frames are left alone. `classes` (the
 * classes the deck's panes carry, from `paneClasses`) scopes the twins to the components the
 * deck actually puts in a pane; omitted, every component is twinned (the invariant test).
 */
function widenForPanes(css, classes) {
  if (!css?.includes('section')) return css;
  const only = classes ? new Set(classes) : null;
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
    // A quoted string (`content: "/*"`, `[data-x="a{b"]`) or an unquoted `url(…)` is text:
    // no brace, comment or semicolon inside it means anything to the walk.
    const end = skipToken(css, i);
    if (end >= 0) {
      i = end - 1;
      continue;
    }
    if (ch === '{') {
      // Comments come out FIRST and ride ahead of the selector list. A comment BETWEEN two
      // arms (base.sketch.css has one) must not hide the arms before it, and a `;` INSIDE a
      // comment must not be read as the end of a hoisted statement — that split a comment
      // in half and broke the selector after it (the rule defining --sketch-ink, measured).
      const { comments, rest: prelude, semi } = pullComments(css.slice(seg, i));
      // A hoisted statement ahead of the rule (`@import …;`) passes through untouched.
      const head = prelude.slice(0, semi);
      const sel = prelude.slice(semi);
      const trimmed = sel.trim();
      let next = sel;
      if (trimmed.startsWith('@')) {
        if (keyframeDepth < 0 && /^@(?:-\w+-)?keyframes\b/.test(trimmed)) keyframeDepth = depth;
      } else if (keyframeDepth < 0 && trimmed.includes('section')) {
        next = twinSelectorList(sel, only);
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

/** The classes this rendered HTML's panes carry — sorted, unique, and empty when it holds no
 *  pane. It is the scope `widenForPanes` twins for, and (joined) the composed sheet's cache key. */
function paneClasses(html) {
  if (!hasPanes(html)) return [];
  // Only real `<lat-pane>` elements count: text inside a comment (a speaker note quoting one)
  // is not a pane, and the CLI's export escapes it — so the sheet it ships and the one
  // tools/palette-sweep.js rebuilds from the export would differ. Comments are cut by scanning
  // for their delimiters, not by a pattern over them.
  let live = '';
  let at = 0;
  for (let open = html.indexOf('<!--'); open >= 0; open = html.indexOf('<!--', at)) {
    live += html.slice(at, open);
    const close = html.indexOf('-->', open + 4);
    at = close < 0 ? html.length : close + 3;
  }
  live += html.slice(at);
  const out = new Set();
  for (const m of live.matchAll(/<lat-pane\sclass="([^"]*)"/g)) for (const c of m[1].split(/\s+/)) if (c) out.add(c);
  return [...out].sort();
}

module.exports = { widenForPanes, reachesPane, twinSelectorList, hasPanes, paneClasses };
