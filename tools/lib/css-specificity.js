/**
 * Selector specificity over a css-tree Selector, for build tools. One implementation, shared by
 * tools/build-marp-vscode-css.js (its tie test) and tools/build-css.js (the nesting guard).
 *
 * Returns [ids, classes, types]. `:where()` adds zero; `:is()`, `:not()`, `:has()` and `:matches()`
 * add their most specific argument; any other pseudo-class adds one class. The four legacy
 * one-colon pseudo-elements (`section:after`) count as pseudo-elements, as browsers read them.
 */

// The four pseudo-elements CSS still accepts with ONE colon (`section:after`), which the parser reads as pseudo-classes.
const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);
const isPseudoElement = (n) => n.type === 'PseudoElementSelector'
  || (n.type === 'PseudoClassSelector' && LEGACY_PSEUDO_ELEMENTS.has(n.name.toLowerCase()));

const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** Specificity [ids, classes, types] of one complex selector (a css-tree Selector), with `:where` at zero. */
function specificity(sel) {
  const s = [0, 0, 0];
  const add = (t) => { s[0] += t[0]; s[1] += t[1]; s[2] += t[2]; };
  const most = (list) => list.children.toArray().map(specificity).reduce((m, t) => (cmp(t, m) > 0 ? t : m), [0, 0, 0]);
  sel.children.forEach((n) => {
    if (n.type === 'IdSelector') s[0]++;
    else if (n.type === 'ClassSelector' || n.type === 'AttributeSelector') s[1]++;
    else if (n.type === 'TypeSelector') { if (n.name !== '*') s[2]++; }
    else if (isPseudoElement(n)) s[2]++;
    else if (n.type === 'PseudoClassSelector') {
      const name = n.name.toLowerCase();
      if (name === 'where') return;
      const list = n.children?.first;
      if (['is', 'not', 'has', 'matches'].includes(name) && list && list.type === 'SelectorList') add(most(list));
      else s[1]++;
    }
  });
  return s;
}

module.exports = { specificity, cmp, isPseudoElement, LEGACY_PSEUDO_ELEMENTS };
