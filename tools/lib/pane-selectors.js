/**
 * Widen component CSS so it also styles a pane (lib/core/panes.js).
 *
 * Every component rule reaches its content through the slide: `section.list > …`.
 * A slide with two panes can only answer "which component are you?" once, so the
 * pane element (`<lat-pane class="list">`) carries the component class instead. This
 * rewrite widens the ROOT compound's type selector in place:
 *
 *     section.list > .cell-stage > ul   →   :is(section,lat-pane).list > .cell-stage > ul
 *
 * Nothing is copied. `lat-pane` is a custom element, so `:is(section,lat-pane)` has
 * exactly the specificity `section` had (0,0,1): every rule keeps its cascade rank,
 * and a normal slide matches exactly the rules it matched before.
 *
 * Only a selector whose FIRST compound starts with the `section` type is touched;
 * `section` elsewhere (inside `:has()`, a later compound) is left alone. The edit is
 * positional, so comments and formatting survive byte-for-byte around it.
 */


const csstree = require('css-tree');

const WIDE = ':is(section,lat-pane)';

/**
 * `stageOnly` widens a selector only when it reaches THROUGH `.cell-stage` — the body a pane
 * holds. The base sheets are applied this way: their stage defaults (tables, lists, code)
 * must reach a pane's stage, and their slide-level rules must not reach a pane at all.
 */
function widenSectionRoots(cssText, { stageOnly = false } = {}) {
  if (!cssText.includes('section')) return cssText;
  const ast = csstree.parse(cssText, {
    positions: true,
    parseRulePrelude: true,
    parseValue: false,
    parseCustomProperty: false,
    parseAtrulePrelude: false,
  });
  const offsets = [];
  csstree.walk(ast, {
    visit: 'Rule',
    enter(rule) {
      if (rule.prelude.type !== 'SelectorList') return;
      rule.prelude.children.forEach((selector) => {
        const first = selector.children.first;
        if (first && first.type === 'TypeSelector' && first.name === 'section' && first.loc) {
          if (!stageOnly || /\.cell-stage\b/.test(csstree.generate(selector))) offsets.push(first.loc.start.offset);
        }
        // The dual-surface chart head `:is(section.x, figure.x) …` — widen each arm
        // that itself starts with the `section` type.
        if (!stageOnly && first && first.type === 'PseudoClassSelector' && /^(is|where)$/.test(first.name) && first.children) {
          first.children.forEach((list) => {
            if (list.type !== 'SelectorList') return;
            list.children.forEach((arm) => {
              const head = arm.children?.first;
              if (head && head.type === 'TypeSelector' && head.name === 'section' && head.loc) {
                offsets.push(head.loc.start.offset);
              }
            });
          });
        }
      });
    },
  });
  if (!offsets.length) return cssText;
  let out = '';
  let at = 0;
  for (const o of offsets.sort((a, b) => a - b)) {
    out += cssText.slice(at, o) + WIDE;
    at = o + 'section'.length;
  }
  return out + cssText.slice(at);
}

module.exports = { widenSectionRoots, WIDE };
