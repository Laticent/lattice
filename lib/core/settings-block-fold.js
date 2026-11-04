/**
 * lib/core/settings-block-fold.js — a bundle deck coming BACK into Lattice: its settings block folded
 * into its front matter. The engine and lint read every deck through it; the runtime never does, so
 * it is a module of its own (docs/route-budget.json `engineJsGz`). The block itself:
 * lib/core/settings-block.js.
 */
const { keyGroups, classTokensOf } = require('./front-matter-groups');

// The open tag, as settings-block.js writes it (kept literal here so the fold does not pull the
// merge and the DOM reader into the engine's boot bundle).
const SETTINGS_OPEN = '<script type="application/lattice-settings">';

// The front matter, closed at its FIRST fence — the same reading `readFrontMatterBlock` and Marpit
// make. One regex for "front matter, then the block" was the first draft, and its lazy body walked
// PAST the real closing fence to a later `---` that happened to be followed by a block (a deck that
// SHOWS a bundle in a fenced example): the whole deck up to there read as front matter, and rendered
// as one slide. Two anchored steps cannot do that.
const FRONT_MATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
// The block as written into a deck SOURCE, directly after the front matter: the open tag alone on
// its line and `</script>` alone on the last. A `<script type="application/lattice-settings">` an
// author wrote on slide 7 is not this and stays the author's.
const SETTINGS_HEAD_RE = new RegExp(
  `^(?:[ \\t]*\\r?\\n)*${SETTINGS_OPEN.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\r?\\n([\\s\\S]*?)\\r?\\n?</script>[ \\t]*(?:\\r?\\n|$)`,
);

/**
 * Fold a bundle's settings block back into its front matter — the way a bundle deck comes
 * BACK into Lattice (rendered, linted, re-exported). Returns the source unchanged when it
 * carries no block. The block's keys win over the top's, `class` is the union
 * (`mergeFrontMatter`), so the folded deck renders exactly as the bundle did.
 *
 * EVERY LINE KEEPS ITS NUMBER (the default), front matter included: the fold is written as
 * the same lines with the seam rewritten — the closing fence and the `<script>` line become
 * YAML comments and `</script>` becomes the closing fence — so each key stays on the line
 * the author sees it on. A key the top shares with the block is commented out at the top
 * (the block wins); for `class`, the block's first line carries the union. That is what lets
 * a lint finding, a fix that edits by line number, and an editor's line ↔ slide mapping work
 * on a bundle deck exactly as on any other. An earlier draft compacted the front matter and
 * padded below it: lines after the block kept their numbers, the keys did not, so a lint fix
 * aimed at a block key would have edited the wrong line.
 *
 * The exporter's re-export wants the compact merged form instead (it writes the block back itself,
 * and a re-export must be byte-identical): `foldSettingsBlockCompact`, lib/export/bundle-front-matter.js.
 */
function foldSettingsBlock(deckSource) {
  const src = String(deckSource || '');
  const fm = src.match(FRONT_MATTER_RE);
  if (!fm) return src;
  const block = src.slice(fm[0].length).match(SETTINGS_HEAD_RE);
  if (!block) return src;

  const lines = src.split('\n');
  // trimEnd, not `/[ \t\r]+$/`: that regex is quadratic on a long run of tabs (CodeQL js/polynomial-redos).
  const bare = (i) => (lines[i] || '').trimEnd();
  const close = 1 + lines.slice(1).findIndex((l) => /^---[ \t]*\r?$/.test(l));
  let open = close + 1;
  while (open < lines.length && bare(open) === '') open++;
  let end = open + 1;
  while (end < lines.length && bare(end) !== '</script>') end++;
  // Only the exact shape the exporter writes (open tag and `</script>` alone on their lines) is
  // folded line for line; anything else is left as the author's.
  if (bare(open) !== SETTINGS_OPEN || end >= lines.length) return src;

  // Each top-level key's line range, from the groups' own line counts (keyGroups keeps them in order).
  const ranges = (from, to) => {
    let at = from;
    return keyGroups(lines.slice(from, to).join('\n')).groups.map((g) => {
      const r = { key: g.key, start: at, end: at + g.text.split('\n').length, text: g.text };
      at = r.end;
      return r;
    });
  };
  const topRanges = ranges(1, close);
  const blockRanges = ranges(open + 1, end);
  const blockKeys = new Map(blockRanges.map((r) => [r.key, r]));
  const out = lines.slice();
  const commentOut = (from, to) => { for (let i = from; i < to; i++) out[i] = `#${out[i]}`; };
  for (const r of topRanges) {
    const mine = blockKeys.get(r.key);
    if (!mine) continue;
    commentOut(r.start, r.end);
    if (r.key === 'class') {
      const union = [...new Set([...classTokensOf(r.text), ...classTokensOf(mine.text)])];
      // The block's group may lead with its own comment lines; the `class:` line is the one to rewrite.
      const at = mine.start + mine.text.split('\n').findIndex((l) => /^class[ \t]*:/.test(l));
      commentOut(mine.start, mine.end);
      out[at] = `class: ${union.join(' ')}`;
    }
  }
  for (let i = close; i <= open; i++) out[i] = '#';
  out[end] = '---';
  return out.join('\n');
}

module.exports = { FRONT_MATTER_RE, SETTINGS_HEAD_RE, foldSettingsBlock };
