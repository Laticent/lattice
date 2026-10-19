/**
 * Style needs — what a document must have loaded for each style module to matter.
 *
 * `dist/styles/` (tools/css-modules.js) cuts lattice.css into ordered modules. This file answers
 * the next question: given a document, which modules can change how it looks? It builds a small
 * INDEX from the module CSS (per module, the token sets its selectors require), and scans a
 * document for the tokens it actually carries (class names, attribute names, tag names, ids).
 * A module is needed when at least one of its selectors could match: every token that selector
 * requires is present in the document.
 *
 * The test is a NECESSARY condition, never a sufficient one, and that asymmetry is the whole design.
 * FALSE NEGATIVES MUST BE ZERO, for the DOM the scan saw plus the runtime tokens the caller names
 * (see RUNTIME TOKENS). False positives only cost bytes. So everything undecidable loosens:
 *   - The arguments of `:not()` `:has()` `:nth-*()` are ignored (fewer requirements, never more);
 *     `:is()` / `:where()` arguments become alternatives; attribute VALUES are ignored (only the
 *     name must exist); names are compared without case, without a namespace prefix, with CSS
 *     escapes decoded.
 *   - A selector this file cannot read at all makes its module unconditional (never an error).
 *   - The few at-rules that define nothing by name (`@page`, `@counter-style`, `@import`) make their
 *     module unconditional.
 *
 * NAMED DEFINITIONS are dependencies, not selectors. A module that defines `@keyframes x`,
 * `@font-face` family `F` or `@property --p` is needed when any needed module MENTIONS the name
 * (a computed style cannot tell: the animation or font silently does not load) or when the document
 * itself does (an inline `style` attribute). The index records those edges as `requires`, and
 * `neededModules` closes over them. Several modules defining one name all count.
 *
 * RUNTIME TOKENS. A scan is a snapshot. Script may add a class, attribute or highlight later (a copy
 * button, a guide preset, a view switch). The caller lists those tokens; they are added to the scan
 * and exempt from verification. Without that list a module keyed only on such a token is dropped.
 * `::highlight(name)` rules carry the token `::highlight(name)`, which only the caller can supply.
 *
 * VERIFY (optional, `buildIndex(modules, { selectors: true })`). Tokens cannot tell `section svg path` that
 * matches from one that does not, so a module whose only met alternatives are generic would load for
 * every deck. With selectors in the index, `neededModules(index, tokens, doc)` asks the document
 * (`doc.querySelector`) about the selectors of the alternatives that ARE met, and only those. A
 * selector is asked only when asking is sound: top-level pseudo-elements and state pseudo-classes
 * (`:hover`, `:focus-visible`, `:checked`, …) are removed, which loosens it. If a state pseudo-class
 * or pseudo-element sits inside `:not()` / `:is()` / `:has()`, if the rule is nested or in `@scope`
 * (`&`, `:scope`), or if the selector starts with a combinator, it cannot be asked soundly and its
 * alternative is kept. The cost is a bigger index; `tools/style-needs-audit.mjs` reports both.
 *
 * Pass `doc` only when the document is styled by the RAW module selectors. If the consumer rewrites
 * the CSS per document (Lattice does for a deck with panes: lib/core/pane-css.js adds `section
 * lat-pane.x` twins), the raw selectors cannot be asked about that document and the caller must
 * leave `doc` out. That one decision belongs to the adapter; the core cannot see it.
 *
 * Generic by construction: nothing here names a Lattice class. The index is built from CSS text and
 * the scan reads any DOM, so the same functions drive a docs page or a widget set. The Lattice
 * adapter is the module list it is handed, plus its runtime tokens (tools/style-needs-audit.mjs).
 *
 * Pure: strings and DOM nodes in, plain data out. No fs, no network.
 */
const csstree = require('css-tree');

/** At-rules that define nothing by name and are not selector-keyed: the module is always needed. */
const UNCONDITIONAL_AT_RULES = new Set(['counter-style', 'font-feature-values', 'page', 'namespace', 'import', 'charset']);

const MAX_ALTERNATIVES = 32;
const MAX_SELECTORS_PER_ALT = 24;

/**
 * Pseudo-classes whose truth changes with interaction or form state, not with the document's
 * structure. Removed (top level) before asking; their presence anywhere deeper makes the selector
 * unaskable. Broader than the CSS-spec "dynamic" list on purpose: a missed entry is a false negative.
 * (lib/export/player-prune.js keeps a narrower list of its own; unifying the two is an E4 task, since
 * this file must not import the export pipeline.)
 */
const STATE_PSEUDOS = new Set([
  'hover', 'focus', 'focus-visible', 'focus-within', 'active', 'visited', 'link', 'any-link', 'target', 'target-within',
  'checked', 'indeterminate', 'default', 'enabled', 'disabled', 'required', 'optional', 'valid', 'invalid', 'user-valid', 'user-invalid',
  'in-range', 'out-of-range', 'read-only', 'read-write', 'placeholder-shown', 'autofill', 'open', 'popover-open', 'modal', 'fullscreen',
  'picture-in-picture', 'playing', 'paused', 'seeking', 'buffering', 'stalled', 'muted', 'current', 'past', 'future', 'defined',
]);

const unescapeCss = (s) => s.replace(/\\([0-9a-fA-F]{1,6})\s?|\\(.)/g, (_m, hex, ch) => (hex ? String.fromCodePoint(Number.parseInt(hex, 16) || 0xfffd) : ch));
const stripNs = (s) => s.slice(s.lastIndexOf('|') + 1);
/** A class or id name as the document compares it: decoded, lower case (quirks mode ignores case). */
const nameTok = (s) => unescapeCss(s).toLowerCase();
/** An attribute or tag name: decoded, no namespace, lower case (SVG camelCase tags included). */
const tagTok = (s) => stripNs(unescapeCss(s)).toLowerCase();

/**
 * Token sets one selector requires, as ALTERNATIVES: the selector can match only if ALL tokens of
 * at least one alternative are present. If a selector expands past MAX_ALTERNATIVES the `:is()` is
 * ignored instead, which only loosens the requirement.
 *
 * @returns {{c:Set<string>, a:Set<string>, t:Set<string>, i:Set<string>}[]}
 */
function requirementsOf(selector) {
  const fresh = () => ({ c: new Set(), a: new Set(), t: new Set(), i: new Set() });
  let alts = [fresh()];
  const addAll = (kind, token) => {
    for (const r of alts) r[kind].add(token);
  };
  for (const n of selector.children.toArray()) {
    if (n.type === 'ClassSelector') addAll('c', nameTok(n.name));
    else if (n.type === 'AttributeSelector') addAll('a', tagTok(n.name.name));
    else if (n.type === 'TypeSelector') {
      if (n.name !== '*' && !n.name.endsWith('|*')) addAll('t', tagTok(n.name));
    } else if (n.type === 'IdSelector') addAll('i', nameTok(n.name));
    else if (n.type === 'PseudoElementSelector' && n.name.toLowerCase() === 'highlight') {
      addAll('t', `::highlight(${csstree.generate(n).replace(/^::highlight\(|\)$/gi, '')})`);
    } else if (n.type === 'PseudoClassSelector' && ['is', 'where', 'matches', '-webkit-any', '-moz-any'].includes(n.name.toLowerCase()) && n.children) {
      const arms = [];
      for (const list of n.children.toArray()) {
        if (list.type !== 'SelectorList') continue;
        for (const arm of list.children.toArray()) arms.push(...requirementsOf(arm));
      }
      if (arms.length && alts.length * arms.length <= MAX_ALTERNATIVES) {
        alts = alts.flatMap((base) =>
          arms.map((arm) => ({ c: new Set([...base.c, ...arm.c]), a: new Set([...base.a, ...arm.a]), t: new Set([...base.t, ...arm.t]), i: new Set([...base.i, ...arm.i]) })),
        );
      }
    }
    // everything else (combinators, :not, :has, :nth-*, state pseudo-classes) adds nothing
  }
  return alts;
}

const STATE_RE = new RegExp(`:(?:${[...STATE_PSEUDOS].join('|')})(?![-\\w])`, 'i');

/**
 * The selector text `querySelector` can be asked, or null when asking is not sound. Top-level
 * pseudo-elements and state pseudo-classes are removed (a looser selector can only match more).
 * Anything that would change meaning if removed, or that needs a parent rule, returns null.
 */
function askableOf(selector, nested) {
  if (nested) return null; // `&`-relative or @scope-relative: meaningless at the top level
  const clone = csstree.clone(selector);
  const drop = [];
  clone.children.forEach((node, item) => {
    if (node.type === 'PseudoElementSelector' || (node.type === 'PseudoClassSelector' && STATE_PSEUDOS.has(node.name.toLowerCase()))) drop.push(item);
  });
  for (const item of drop) clone.children.remove(item);
  const text = csstree.generate(clone).trim();
  // A state pseudo-class or pseudo-element left inside a functional pseudo, a leading combinator,
  // a nesting selector or `:scope`: not askable. A one-colon legacy pseudo-element (`:before`) is a
  // pseudo-class to the parser and never matches.
  if (!text || STATE_RE.test(text) || /::/.test(text) || /^[>+~]/.test(text) || /&|:scope/i.test(text)) return null;
  if (/:(before|after|first-line|first-letter)(?![-\w])/i.test(text)) return null;
  return text;
}

/**
 * Drop every alternative that another alternative of the same module is a subset of: when the larger
 * set is met the smaller one is too, so under "any alternative met" it adds nothing. Exact for the
 * token index. NOT used with `selectors`, where each alternative carries its own selector text to
 * verify. On the 187 Lattice modules this cuts 5,802 alternatives to 1,735 and the index from
 * 33 KB to 14 KB gzipped, with no change to which modules any document needs.
 */
function pruneSubsumed(alts) {
  const sets = alts.map((alt) => new Set(alt.flatMap((names, kind) => names.map((n) => `${kind}:${n}`))));
  return alts.filter((_alt, i) => !sets.some((other, j) => j !== i && other.size <= sets[i].size && (other.size < sets[i].size || j < i) && [...other].every((x) => sets[i].has(x))));
}

const keyOf = (r) => JSON.stringify([[...r.c].sort(), [...r.a].sort(), [...r.t].sort(), [...r.i].sort()]);

/** The names a module DEFINES: @keyframes, @property, and @font-face families (lower case). */
function definitionsOf(ast) {
  const d = new Set();
  csstree.walk(ast, {
    visit: 'Atrule',
    enter(n) {
      const name = n.name.toLowerCase();
      if (/keyframes$/.test(name) && n.prelude) d.add(csstree.generate(n.prelude).replace(/^["']|["']$/g, '').toLowerCase());
      else if (name === 'property' && n.prelude) d.add(csstree.generate(n.prelude).trim().toLowerCase());
      else if (name === 'font-face' && n.block) {
        csstree.walk(n.block, {
          visit: 'Declaration',
          enter(decl) {
            if (decl.property.toLowerCase() === 'font-family') d.add(csstree.generate(decl.value).replace(/^["']|["']$/g, '').toLowerCase());
          },
        });
      }
    },
  });
  return d;
}

/**
 * @param {{id:string, text:string}[]} modules
 * @param {{selectors?: boolean}} [opts]  `selectors`: also index the selector text behind each
 *   alternative so `neededModules` can verify against a document
 * @returns {{id:string, always:boolean, alts:[string[],string[],string[],string[]][], requires:number[], defines?:string[], sel?:(string[]|null)[]}[]}
 *   per module: `always` (needed whatever the document holds), `alts` (the distinct
 *   [classes, attributes, tags, ids] requirement sets; the module is needed if ANY is met),
 *   `requires` (indexes of the modules defining names this module mentions), `defines` (the names it
 *   defines) and, with `selectors`, `sel[i]`: the askable selectors behind `alts[i]`, or null when
 *   any of them cannot be asked soundly (the alternative is then never verified).
 */
function buildIndex(modules, { selectors = false } = {}) {
  const parsed = modules.map(({ id, text }) => {
    const ast = csstree.parse(text);
    let always = false;
    const seen = new Map();
    const sels = new Map(); // alt key -> askable selector texts, or null once any is unaskable
    csstree.walk(ast, {
      visit: 'Atrule',
      enter(n) {
        if (UNCONDITIONAL_AT_RULES.has(n.name.toLowerCase())) always = true;
      },
    });
    let ruleDepth = 0;
    csstree.walk(ast, {
      visit: 'Rule',
      enter(rule) {
        ruleDepth++;
        // Keyframe steps (`from`, `50%`) parse as rules inside @keyframes: not selectors.
        if (this.atrule && /keyframes$/i.test(this.atrule.name)) return;
        // A prelude the parser could not read is Raw: keep the module.
        if (rule.prelude.type !== 'SelectorList') {
          always = true;
          return;
        }
        const nested = ruleDepth > 1 || (this.atrule && /^scope$/i.test(this.atrule.name));
        for (const sel of rule.prelude.children.toArray()) {
          try {
            for (const r of requirementsOf(sel)) {
              if (!r.c.size && !r.a.size && !r.t.size && !r.i.size) always = true; // `*`, `:root`
              else {
                const k = keyOf(r);
                seen.set(k, [[...r.c], [...r.a], [...r.t], [...r.i]]);
                if (selectors) {
                  const text = askableOf(sel, nested);
                  const list = sels.get(k);
                  if (list === null || text === null) sels.set(k, null);
                  else {
                    const next = list || [];
                    if (!next.includes(text)) next.push(text);
                    sels.set(k, next.length > MAX_SELECTORS_PER_ALT ? null : next);
                  }
                }
              }
            }
          } catch {
            always = true; // a selector this file cannot read: keep the module, never fail the build
          }
        }
      },
      leave() {
        ruleDepth--;
      },
    });
    return { id, lower: text.toLowerCase(), always, seen, sels, defs: definitionsOf(ast) };
  });
  // name -> every module that defines it (the cascade picks one; any may be the one that applies)
  const definedIn = new Map();
  parsed.forEach((m, i) => {
    for (const name of m.defs) definedIn.set(name, [...(definedIn.get(name) || []), i]);
  });
  return parsed.map((m, i) => {
    const requires = new Set();
    for (const [name, at] of definedIn) {
      if (!m.lower.includes(name)) continue;
      for (const j of at) if (j !== i) requires.add(j);
    }
    // A module with no selector and no named definition (the banner, the @theme comment, an
    // `@layer` statement) is structural: a few bytes, and dropping it would change how the sheet is read.
    const always = m.always || (m.seen.size === 0 && m.defs.size === 0);
    const alts = always ? [] : [...m.seen.values()];
    const out = { id: m.id, always, alts: selectors ? alts : pruneSubsumed(alts), requires: [...requires] };
    if (selectors && !always) out.sel = [...m.seen.keys()].map((k) => m.sels.get(k) ?? null);
    if (m.defs.size) out.defines = [...m.defs];
    return out;
  });
}

const { scanDocument, neededModules } = require('../lib/core/style-needs-scan.mjs');

module.exports = { buildIndex, scanDocument, neededModules, requirementsOf, askableOf, STATE_PSEUDOS, UNCONDITIONAL_AT_RULES };
