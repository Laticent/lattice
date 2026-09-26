/**
 * Pane spec — the authoring contract of a panes slide, in ONE pure leaf that the carve
 * (lib/core/panes.js) and the linter (lib/authoring/lint-core.js) both read, so the render
 * and `lint:deck` can never disagree about what a marker, a ratio or a pane's budget means
 * (HARD RULE #1, #7). No requires, no DOM, no fs: it runs in the browser lint as well.
 *
 * Contract (engineering/decisions/2026-09-25-panes-two-components-one-slide.md §1):
 *   `<!-- pane: X -->`           — where component X's body begins; two per slide
 *   `<!-- panes: 40/60 stack no-rule -->` — optional layout: a 25–75 ratio in 5% steps,
 *                                   `stack` (default side by side), `no-rule` (no spine)
 *
 * Each component's `pane` manifest field decides whether it may go in a pane and how much it
 * holds there. The carve and the linter take that field as plain data (a catalog, a vocab), so
 * this module never loads a manifest.
 */

/** A pane marker, alone on its line (trimmed). */
const PANE_RE = /^<!--\s*pane:\s*([a-z][\w-]*)\s*-->$/;
/** The optional layout comment. No quantifier may overlap its neighbor: `\s*([^<>]*?)\s*`
 *  backtracked cubically on an unclosed comment (3 KB of spaces took 3.8s in a render), so the
 *  capture is `[^<>]*` and callers trim it. */
const PANES_RE = /^<!--\s*panes:([^<>]*)-->$/;

/** The 25–75 range in 5% steps: past 75/25 the narrow pane is too thin to read. */
const RATIO_MIN = 25;
const RATIO_MAX = 75;
const RATIO_STEP = 5;
/** The share a `pane.budget.side` is declared at when its `at` is absent. A stack is 50/50. */
const BUDGET_AT = 50;

/** `{ direction, a, b, rule, error? }` from a `panes:` spec (null → 50/50 side, ruled). */
function parseLayout(spec) {
  const out = { direction: 'side', a: 50, b: 50, rule: true };
  if (!spec) return out;
  const words = spec.replace(/\s*\/\s*/g, '/').split(/\s+/).filter(Boolean);
  for (const word of words) {
    if (word === 'stack' || word === 'side') out.direction = word;
    else if (word === 'no-rule' || word === 'rule') out.rule = word === 'rule';
    else if (/^\d+\/\d+$/.test(word)) {
      const [a, b] = word.split('/').map(Number);
      const ok = a + b === 100 && a >= RATIO_MIN && a <= RATIO_MAX && a % RATIO_STEP === 0;
      if (ok) Object.assign(out, { a, b });
      else out.error = `panes ratio ${word}: use ${RATIO_STEP}% steps from ${RATIO_MIN}/${RATIO_MAX} to ${RATIO_MAX}/${RATIO_MIN}`;
    } else out.error = `panes: unknown word "${word}" — use a ratio like 40/60, optionally with "stack" or "no-rule"`;
  }
  return out;
}

/** A component's pane spec, `{ side, stack }` — the least share it reads at in each direction,
 *  or false — from a `{ name → { side, stack } }` map (the pane catalog, or the lint vocab). No
 *  row — an installed package — fits any share both ways. */
function specOf(specs, cls) {
  const row = specs && Object.hasOwn(specs, cls) ? specs[cls] : null;
  return { side: row ? row.side : RATIO_MIN, stack: row ? row.stack : RATIO_MIN };
}

/** Whether a pane of `spec` reads at `share` of the stage in `direction`. */
function fits(spec, direction, share) {
  const least = spec[direction];
  return least !== false && share >= least;
}

/**
 * How a panes slide RENDERS, decided from its two components' measured fits (the owner's
 * ruling: a pairing that does not read is never drawn): `{ as, layout, why }`.
 *   · `written`    — both panes fit the layout the author wrote;
 *   · `reoriented` — they do not, but both fit the OTHER direction at the same shares: the
 *                    slide stacks instead of sitting side by side, or the reverse;
 *   · `split`      — neither: the slide becomes one ordinary slide per pane.
 * `why` names the pane that decided it, for the linter to say. `classes` are the authored names.
 */
function arrangePanes(specs, classes, layout) {
  const shares = [layout.a, layout.b];
  const misfit = (direction) => classes
    .map((cls, i) => ({ cls, share: shares[i], spec: specOf(specs, cls) }))
    .find(({ spec, share }) => !fits(spec, direction, share));
  const other = layout.direction === 'stack' ? 'side' : 'stack';
  const here = misfit(layout.direction);
  if (!here) return { as: 'written', layout, why: null };
  const why = describeMisfit(here, layout.direction);
  if (!misfit(other)) return { as: 'reoriented', layout: { ...layout, direction: other }, why };
  const there = misfit(other);
  return { as: 'split', layout, why: `${why}; ${describeMisfit(there, other)}` };
}

function describeMisfit({ cls, share, spec }, direction) {
  const how = direction === 'stack' ? 'stacked' : 'side by side';
  const least = spec[direction];
  return least === false
    ? `"${cls}" does not read ${how} at any share`
    : `"${cls}" needs ${least}% ${how}, and has ${share}%`;
}

/**
 * The `{ sweet, hard }` a pane holds at position `i` of `layout`, from the component's
 * `pane.budget`, or null when it declares none for this direction. `side` is declared at the
 * budget's `at` share (default 50%) and `stack` at 50/50. A pane SMALLER than its basis
 * scales the counts down in proportion; a larger one keeps them, never up (the declared number
 * is the one measured or judged; a larger box is headroom, not a promise), and never below the
 * component's `budget.min`.
 */
function paneBudgetLimit(budget, spec, layout, i) {
  const counts = layout.direction === 'stack' ? budget?.stack : budget?.side;
  if (!counts) return null;
  const share = i === 0 ? layout.a : layout.b;
  const basis = layout.direction === 'stack' ? 50 : budget.at || BUDGET_AT;
  const k = Math.min(1, share / basis);
  // Never below the component's own minimum (a 2x2 is always four): a pane too small for that
  // is the export's overflow probe to report, not a count to warn a correct pane about.
  const floor = Math.max(1, budget.min || 1);
  const scale = (n) => Math.max(floor, Math.floor(n * k));
  return { sweet: scale(counts.sweet), hard: scale(counts.hard) };
}

// CommonMark HTML block starts (spec §4.6), in markdown-it's order. Types 1–5 run to their own
// end marker, across blank lines; 6 and 7 end at a blank line; 7 cannot interrupt a paragraph.
const HTML_BLOCK_TAGS = 'address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul';
const HTML_STARTS = [
  { open: /^<(?:script|pre|style|textarea)(?=\s|>|$)/i, end: /<\/(?:script|pre|style|textarea)>/i },
  // Type 2 ends at the literal `-->` and nothing else — markdown-it's own rule
  // (rules_block/html_block.mjs), which this scanner must match line for line. It is a BLOCK
  // BOUNDARY, not an HTML filter: a browser also closes a comment at `--!>`, but markdown-it
  // keeps the block open there, and so must lint, or it would find a marker the render does not.
  { open: /^<!--/, end: { test: (s) => s.includes('-->') } },
  { open: /^<\?/, end: /\?>/ },
  { open: /^<![A-Za-z]/, end: />/ },
  { open: /^<!\[CDATA\[/, end: /\]\]>/ },
  { open: new RegExp(`^</?(?:${HTML_BLOCK_TAGS})(?=\\s|/?>|$)`, 'i'), end: null },
  { open: /^(?:<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][\w.:-]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?>|<\/[A-Za-z][A-Za-z0-9-]*\s*>)\s*$/, end: null, noInterrupt: true },
];

/** Leading whitespace as a column count, tabs to the next multiple of 4 (CommonMark §2.2). */
function indentOf(raw) {
  let col = 0;
  for (const ch of raw) {
    if (ch === ' ') col++;
    else if (ch === '\t') col += 4 - (col % 4);
    else break;
  }
  return col;
}

/**
 * The panes of one slide's markdown, or null when it has fewer than two markers: `{ layout,
 * markers, panes: [{ cls, markdown, line }] }` (`markers` counts every marker, a third
 * included). The carve works on markdown-it's parsed tokens and takes a marker only when it is
 * a TOP-LEVEL html block; this is the linter's instant, parser-free answer to the same question,
 * so it runs the part of CommonMark's block structure that decides it:
 *   - fences close on the same character, at least as long, with no info string, and close with
 *     the list item that opened them;
 *   - the seven HTML block types, each with its own end (types 1–5 cross blank lines; 7 cannot
 *     interrupt a paragraph);
 *   - a stack of list content columns (a line indented to one is that item's content), the rules
 *     for which list items may interrupt a paragraph, lazy paragraph continuation, and a setext
 *     underline closing a paragraph;
 *   - tabs to 4-column stops, and four columns of indent as code.
 * test/unit/core/pane-contract.test.js renders every edge case the reviews found through the
 * engine and requires the same panes. A third marker folds into the second pane, as the carve
 * folds it.
 */
function splitPaneMarkdown(slide) {
  const lines = String(slide || '').split(/\r?\n/);
  const lists = [];
  // Per open list item: it began EMPTY and has held nothing yet. Such an item cannot start with
  // two blank lines (CommonMark §5.2), so a blank line closes it and an indented line after that
  // is not its content.
  const bare = [];
  let fence = null;
  let html = null;
  let para = false;
  const markers = [];
  let spec = null;
  // Whether a block's first-line CONTENT opens a paragraph (only a paragraph takes lazy
  // continuation lines). Blockquote markers are stripped first: `>` alone, a heading or a
  // thematic break inside one opens none.
  const opensPara = (content) => {
    const c = content.replace(/^(?:>[ \t]?)+/, '').trim();
    return !!c && !/^(?:#{1,6}(?:\s|$)|(?:[-*_][ \t]*){3,}$)/.test(c);
  };
  lines.forEach((raw, n) => {
    const blank = !raw.trim();
    const indent = indentOf(raw);
    if (fence) {
      if (!blank && indent < fence.col) fence = null;
      else {
        const close = !blank && indent - fence.col < 4 && raw.trim().match(/^(`+|~+)\s*$/);
        if (close && close[1][0] === fence.ch && close[1].length >= fence.len) fence = null;
        return;
      }
    }
    if (html) {
      if (!blank && indent < html.col) html = null;
      else {
        if (blank && !html.end) html = null;
        else if (html.end?.test(raw)) html = null;
        return;
      }
    }
    if (blank) {
      para = false;
      if (bare[bare.length - 1]) {
        lists.pop();
        bare.pop();
      }
      return;
    }
    // The innermost list this line is indented into; relative to it, the line's own indent.
    let depth = lists.length;
    while (depth > 0 && lists[depth - 1] > indent) depth--;
    const base = depth ? lists[depth - 1] : 0;
    if (depth && depth === lists.length) bare[depth - 1] = false;
    const rel = indent - base;
    const line = raw.trim();
    // A setext underline (`===` / `---`, or a lone `-`) under an open paragraph makes it a
    // heading and closes it — it is not an empty list item or a thematic break.
    if (para && rel < 4 && /^(?:=+|-+)[ \t]*$/.test(line)) {
      lists.length = depth;
      bare.length = depth;
      para = false;
      return;
    }
    const fenceOpen = rel < 4 && line.match(/^(`{3,}|~{3,})(.*)$/);
    const isFence = fenceOpen && !(fenceOpen[1][0] === '`' && fenceOpen[2].includes('`'));
    const item = rel < 4 && line.match(/^([-*+]|(\d{1,9})[.)])(?:([ \t]+)(.*))?$/);
    const itemEmpty = item && !(item[4] || '').trim();
    const itemOk = item && !(para && (itemEmpty || (item[2] !== undefined && item[2] !== '1')));
    const htmlType = rel < 4 ? HTML_STARTS.findIndex((h) => h.open.test(line) && !(para && h.noInterrupt)) : -1;
    const other = rel < 4 && /^(?:#{1,6}(?:\s|$)|>|(?:[-*_][ \t]*){3,}$)/.test(line);
    const starts = isFence || itemOk || htmlType >= 0 || other;
    if (para && !starts) return; // lazy continuation of an open paragraph
    lists.length = depth;
    bare.length = depth;
    if (rel >= 4) return; // indented code
    if (isFence) {
      fence = { ch: fenceOpen[1][0], len: fenceOpen[1].length, col: base };
      para = false;
      return;
    }
    if (itemOk) {
      const markerEnd = indent + item[1].length;
      const gap = item[3] ? indentOf(item[3]) : 0;
      const col = itemEmpty || gap > 4 ? markerEnd + 1 : markerEnd + gap;
      lists.push(col);
      bare.push(itemEmpty);
      const rest = item[4] || '';
      const restFence = !itemEmpty && gap <= 4 && rest.match(/^(`{3,}|~{3,})(.*)$/);
      const restHtml = !itemEmpty && gap <= 4 ? HTML_STARTS.findIndex((h) => h.open.test(rest.trim())) : -1;
      if (restFence && !(restFence[1][0] === '`' && restFence[2].includes('`'))) {
        fence = { ch: restFence[1][0], len: restFence[1].length, col };
        para = false;
      } else if (restHtml >= 0) {
        // An HTML block opening on the item's own line: it runs on inside the item.
        const h = HTML_STARTS[restHtml];
        para = false;
        if (!h.end?.test(rest.trim().replace(h.open, ''))) html = { end: h.end, col };
      } else para = !itemEmpty && opensPara(rest);
      return;
    }
    if (htmlType >= 0) {
      para = false;
      if (!depth) {
        const m = line.match(PANE_RE);
        const l = line.match(PANES_RE);
        if (m) markers.push({ cls: m[1], line: n });
        else if (l) spec = l[1].trim();
      }
      const h = HTML_STARTS[htmlType];
      // A block that ends on its own opening line (a one-line comment) closes at once.
      if (!h.end?.test(line.replace(h.open, ''))) html = { end: h.end, col: base };
      return;
    }
    para = opensPara(line);
  });
  if (markers.length < 2) return null;
  const body = (from, to) => lines.slice(from + 1, to).join('\n');
  return {
    layout: parseLayout(spec),
    markers: markers.length,
    panes: [
      { cls: markers[0].cls, line: markers[0].line, markdown: body(markers[0].line, markers[1].line) },
      { cls: markers[1].cls, line: markers[1].line, markdown: body(markers[1].line, lines.length) },
    ],
  };
}

/**
 * The PANE contract per component (lib/core/pane-spec.js): its fit and stack flag, and its pane
 * budget, from the manifests. Plain data, so it serializes like `capacity`. A component with no
 * `pane` field (an installed package) has no row: a `half` that stacks, with no budget. ONE
 * derivation for both consumers — `buildVocab` (lib/authoring/lint.js), and the table tools/build-stage-catalog.js
 * bakes into lib/authoring/pane-lint.generated.js for the browser linter, whose vocab does not
 * carry it — so the Studio and `lint:deck` warn on the same numbers.
 */
function paneVocab(ms) {
  const paneSpec = {};
  const paneBudget = {};
  for (const m of ms) {
    if (!m.pane) continue;
    paneSpec[m.name] = { side: m.pane.side, stack: m.pane.stack };
    if (m.pane.budget) {
      const { axis, min, at, side, stack } = m.pane.budget;
      paneBudget[m.name] = { axis, ...(min ? { min } : {}), ...(at ? { at } : {}), ...(side ? { side: { ...side } } : {}), ...(stack ? { stack: { ...stack } } : {}) };
    }
  }
  return { paneSpec, paneBudget };
}

module.exports = {
  PANE_RE, PANES_RE, RATIO_MIN, RATIO_MAX, RATIO_STEP, BUDGET_AT,
  parseLayout, specOf, fits, arrangePanes, paneBudgetLimit, splitPaneMarkdown, paneVocab,
};
