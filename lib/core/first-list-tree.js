/**
 * first-list-tree — the ONE Markdown reading of a slide's first list, as a tree.
 *
 * Flow narrators (`chart-narration.js`) and hub-spoke's linter (`hub-spoke-model.js`,
 * via `lint-core.js`) both need "the list the transform will draw" from Markdown. They
 * used to answer it twice, and the two readers disagreed about ordered-list hubs
 * (`1. Hub`), CommonMark content-column nesting and emphasis inside a name (HARD
 * RULE #1). It lives in its own module, not in chart-narration, because the linter
 * ships in the browser bundle (`tools/build-authoring-core.js`) and must not drag the
 * narrator and its speech tables in with it.
 *
 * Pure: no fs, no DOM.
 */

const LIST_ITEM = /^([ \t]*)([-*+]|\d+[.)])[ \t]+(.*)$/;

/**
 * The slide's FIRST list as a tree — the list every flow transform turns into its
 * chart (`spliceFirstList`). Each node is `{ text, line, children }`, where `line` is
 * the item's index into `md.split('\n')` so a narrator can mark what it spoke.
 *
 * Nesting is read from the CONTENT COLUMN of the parent, the rule CommonMark uses: a
 * line is a child when its marker sits at or past the column the parent's text starts
 * in. A continuation line (indented prose with no marker) is appended to the item it
 * continues. The list ends at the first line that is neither blank, a marker, nor
 * indented continuation — which is where markdown-it ends it too — and at a top-level
 * marker of a DIFFERENT kind (`-` then `*`, or bullets then `1.`), which CommonMark starts
 * as a new list the transform never draws.
 *
 * It starts AFTER THE HEADING when the slide has one: a list above the heading is not the
 * chart's (the family does not frame that section at all), so reading it as rows would say
 * a chart the slide does not show.
 */
function firstListTree(md) {
  const lines = md.split('\n');
  const headingAt = lines.findIndex((l) => /^#{1,6}\s/.test(l));
  const roots = [];
  const stack = []; // { node, contentCol, indent }
  let started = false;
  let topKind = null;
  let lastNode = null;
  const consumed = new Set();
  const kindOf = (marker) => (/\d/.test(marker) ? `ol${marker.slice(-1)}` : marker);
  for (let i = headingAt >= 0 ? headingAt + 1 : 0; i < lines.length; i++) {
    const raw = lines[i];
    const m = raw.match(LIST_ITEM);
    if (!started) {
      if (!m) continue;
      started = true;
    }
    if (!raw.trim()) continue;
    if (m) {
      const indent = m[1].replace(/\t/g, '    ').length;
      const contentCol = raw.length - m[3].length;
      while (stack.length && indent < stack[stack.length - 1].contentCol) stack.pop();
      if (!stack.length) {
        if (topKind && kindOf(m[2]) !== topKind) break;
        topKind = kindOf(m[2]);
      }
      const node = { text: m[3].trim(), line: i, children: [] };
      if (stack.length) stack[stack.length - 1].node.children.push(node);
      else {
        // A top-level marker that follows a nested one belongs to the SAME list only if
        // it is at the list's own indent; anything shallower is a new block we stop at.
        roots.push(node);
      }
      stack.push({ node, contentCol, indent });
      lastNode = node;
      consumed.add(i);
      continue;
    }
    // Indented prose continues the item above it; an unindented line ends the list.
    if (/^[ \t]+\S/.test(raw) && lastNode) {
      lastNode.text = `${lastNode.text} ${raw.trim()}`;
      consumed.add(i);
      continue;
    }
    break;
  }
  return { roots, consumed };
}

/** Peel trailing `` `pill` `` spans off a lead — `stripTrailingPills`, on Markdown. */
function trailingPills(text) {
  const pills = [];
  let s = String(text || '');
  for (;;) {
    const m = s.match(/^([\s\S]*?)\s*`([^`]+)`\s*$/);
    if (!m) break;
    pills.unshift(m[2].trim());
    s = m[1];
  }
  return { lead: s.trim(), pills };
}

module.exports = { LIST_ITEM, firstListTree, trailingPills };
