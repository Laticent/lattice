/**
 * Pane spec — the authoring contract of a panes slide, in ONE pure leaf that the carve
 * (lib/core/panes.js) and the linter (lib/authoring/lint-core.js) both read, so the render
 * and `lint:deck` can never disagree about what a marker, a ratio or a pane's budget means
 * (HARD RULE #1, #7). No requires, no DOM, no fs: it runs in the browser lint as well.
 *
 * Contract (engineering/decisions/2026-09-28-generic-pane-layouts-authoring.md §2):
 *   `<!-- _class: columns 40/60 -->` — the slide's layout: `columns` (side by side) or `rows`
 *                                   (stacked), an optional 25–75 ratio in 5% steps, `no-rule`
 *   `<!-- _pane: X no-title -->`  — where a pane begins, naming its component (default
 *                                   `content`) and its modifiers; optional
 *   `### Title`                   — a pane's title; on a slide with no `_pane` marker, each
 *                                   top-level `###` starts a `content` pane
 * The experimental syntax it replaced still reads, as an alias (§9):
 *   `<!-- pane: X -->`, `<!-- panes: 40/60 stack no-rule -->`
 *
 * Each component's `pane` manifest field decides whether it may go in a pane and how much it
 * holds there. The carve and the linter take that field as plain data (a catalog, a vocab), so
 * this module never loads a manifest.
 */

/** The `pane:` ALIAS marker as authored, alone on its line (trimmed): one component, `[1]`, and
 *  at most `no-title`. A reader of authored source takes `parseMarker`, which reads both
 *  spellings; the engine's own rules read only `INTERNAL_PANE_RE`. */
const PANE_RE = /^<!--\s*pane:\s*([a-z][\w-]*)(?:\s+no-title)*\s*-->$/;
/** A pane marker in the engine's INTERNAL form: `<!-- lat-pane: {"cls":…,"mods":[…],"modifiers":[…]} -->`.
 *  lib/core/panes.js `normalizePaneSyntax` rewrites every authored marker, either spelling, into
 *  it before any pane rule runs, so no rule after it reads an author's text, and the alias can be
 *  retired without touching the carve. */
const INTERNAL_PANE_RE = /^<!--\s*lat-pane:\s*(\{[^<>]*\})\s*-->$/;
/** The layout in the engine's internal form: `<!-- lat-panes: 60/40 stack no-rule heads -->`. */
const INTERNAL_PANES_RE = /^<!--\s*lat-panes:([^<>]*)-->$/;
/** Either spelling of a marker, as authored: `_pane:` (the syntax) or `pane:` (the alias). */
const MARKER_RE = /^<!--\s*(_?)pane:([^<>]*)-->$/;
/** The pane modifiers a marker may carry after its component. */
const PANE_MODS = ['no-title'];
/** A `_class` spot directive comment — one directive per comment (lib/engine/directives.js). */
const CLASS_RE = /^<!--\s*_class\s*:\s*([^<>]*?)\s*-->$/;
/** The layout words a `_class` may carry, and the direction each lays out. */
const LAYOUTS = { columns: 'side', rows: 'stack' };
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

/**
 * A pane marker as authored, or null: `{ cls, mods, modifiers, legacy }`. `_pane:` takes an
 * optional component, then words: the pane's own (`no-title`, in `mods`) and the component's
 * modifiers (`_pane: team-profile sides`, in `modifiers`), which reach the pane's render as a
 * slide's `_class` would carry them. `_pane: no-title` is a `content` pane. The `pane:` alias is
 * one component and at most `no-title`, as it always was.
 */
function parseMarker(text) {
  const m = String(text || '').trim().match(MARKER_RE);
  if (!m) return null;
  const legacy = !m[1];
  const words = m[2].trim().split(/\s+/).filter(Boolean);
  // The alias is ONE component, plus the modifiers the engine's own rewrite writes after it: a
  // comment like `<!-- pane: check the numbers -->` is a speaker note, as it always was.
  if (legacy && (!words.length || PANE_MODS.includes(words[0]) || !/^[a-z][\w-]*$/.test(words[0]) || words.slice(1).some((w) => !PANE_MODS.includes(w)))) return null;
  let cls = 'content';
  const mods = [];
  const modifiers = [];
  words.forEach((w, i) => {
    if (PANE_MODS.includes(w)) mods.push(w);
    else if (i === 0 && /^[a-z][\w-]*$/.test(w)) cls = w;
    else modifiers.push(w);
  });
  return { cls, mods, modifiers, legacy };
}

/** The internal marker comment for a pane (`INTERNAL_PANE_RE`). A class name is `[\w-]` only,
 *  so a word that is not one is dropped here rather than carried into markup. */
function markerComment(cls, mods = [], modifiers = []) {
  const safe = (list) => list.filter((w) => /^[\w-]+$/.test(w));
  return `<!-- lat-pane: ${JSON.stringify({ cls, mods: safe(mods), modifiers: safe(modifiers) })} -->`;
}

/** The internal marker a comment holds, or null: `{ cls, mods, modifiers }`. */
function readMarker(text) {
  const m = String(text || '').trim().match(INTERNAL_PANE_RE);
  if (!m) return null;
  try {
    const v = JSON.parse(m[1]);
    return typeof v?.cls === 'string' ? { cls: v.cls, mods: v.mods || [], modifiers: v.modifiers || [] } : null;
  } catch {
    return null;
  }
}

/** The internal layout a comment holds, or null (`INTERNAL_PANES_RE`). */
function readLayout(text) {
  const m = String(text || '').trim().match(INTERNAL_PANES_RE);
  return m ? parseLayout(m[1].trim()) : null;
}

/** Whether a pane of `cls` keeps every `###` it holds: its own anatomy uses them (`h3` in the
 *  pane catalog, from its manifest's slots — `team-profile sides`). Then no `###` in it is taken
 *  as the pane's title or as the start of another pane. */
function ownsHeadings(specs, cls) {
  return Boolean(specs && Object.hasOwn(specs, cls) && specs[cls].h3);
}

/**
 * The layout a `_class` value names, or null when it names none: `{ spec, rest }`. `spec` is
 * the layout in `parseLayout`'s words (`stack 40/60 no-rule`); `rest` is every other class,
 * which stays the slide's. A ratio or `no-rule` without `columns` / `rows` is not a layout and
 * stays in `rest`, as any other word would.
 */
function classLayout(value) {
  const words = String(value || '').replace(/\s*\/\s*/g, '/').split(/\s+/).filter(Boolean);
  const named = words.filter((w) => Object.hasOwn(LAYOUTS, w));
  if (!named.length) return null;
  const spec = [];
  const rest = [];
  for (const w of words) {
    if (Object.hasOwn(LAYOUTS, w)) continue;
    if (/^\d+\/\d+$/.test(w) || w === 'no-rule') spec.push(w);
    else rest.push(w);
  }
  if (LAYOUTS[named[named.length - 1]] === 'stack') spec.unshift('stack');
  return { spec: spec.join(' '), rest: rest.join(' '), layout: named[named.length - 1] };
}

/** The `_class` value of a comment, or null. */
function classOf(text) {
  const m = String(text || '').trim().match(CLASS_RE);
  return m ? m[1] : null;
}

/** The internal layout comment for a parsed layout. `heads` marks a slide written in the pane
 *  SYNTAX (a `_class` layout or a `_pane` marker): only there does a pane's opening `###` become
 *  its head and a pane's Key Insight the slide's. A slide written in the alias keeps the behavior
 *  it rendered with, byte for byte. */
function layoutComment(l) {
  return `<!-- lat-panes: ${l.direction === 'stack' ? 'stack ' : ''}${l.a}/${l.b}${l.rule ? '' : ' no-rule'}${l.heads ? ' heads' : ''} -->`;
}

/** Whether a slide's source could hold panes — the cheap reject every other slide takes. */
function mayHavePanes(text) {
  const s = String(text || '');
  return s.includes('pane:') || (s.includes('_class') && /\b(?:columns|rows)\b/.test(s));
}

/**
 * A pane's HEAD, read from the start of its markdown: an optional eyebrow pill, a `###` title
 * and an optional subtitle pill, as a slide's are one level up. `{ eyebrow, title, subtitle,
 * body }` (each a string or null; `body` is the markdown after the head), or null when the pane
 * does not open with a `###`. Text-level, for the linter: the engine reads the same shape from
 * tokens (lib/core/panes.js `paneHeadOf`).
 */
function paneHeadText(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  let i = 0;
  const skipBlank = () => { while (i < lines.length && !lines[i].trim()) i++; };
  const pill = (l) => { const m = (l || '').trim().match(/^`([^`]+)`$/); return m ? m[1] : null; };
  skipBlank();
  let eyebrow = null;
  if (pill(lines[i]) !== null && /^\s*###\s/.test(lines[i + 1] || '')) eyebrow = pill(lines[i++]);
  const h = (lines[i] || '').match(/^ {0,3}###(?:\s+(.*?))?(?:\s+#+)?\s*$/);
  if (!h) return null;
  const title = (h[1] || '').trim();
  i++;
  let subtitle = null;
  if (pill(lines[i]) !== null) subtitle = pill(lines[i++]);
  return { eyebrow, title, subtitle, body: lines.slice(i).join('\n') };
}

/** `{ direction, a, b, rule, error? }` from a `panes:` spec (null → 50/50 side, ruled). */
function parseLayout(spec) {
  const out = { direction: 'side', a: 50, b: 50, rule: true };
  if (!spec) return out;
  const words = spec.replace(/\s*\/\s*/g, '/').split(/\s+/).filter(Boolean);
  for (const word of words) {
    if (word === 'stack' || word === 'side') out.direction = word;
    else if (word === 'heads') out.heads = true;
    else if (word === 'no-rule' || word === 'rule') out.rule = word === 'rule';
    else if (/^\d+\/\d+$/.test(word)) {
      const [a, b] = word.split('/').map(Number);
      const ok = a + b === 100 && a >= RATIO_MIN && a <= RATIO_MAX && a % RATIO_STEP === 0;
      if (ok) Object.assign(out, { a, b });
      else out.error = `pane ratio ${word}: use ${RATIO_STEP}% steps from ${RATIO_MIN}/${RATIO_MAX} to ${RATIO_MAX}/${RATIO_MIN}`;
    } else out.error = `pane layout: unknown word "${word}" — use a ratio like 40/60, optionally with "no-rule"`;
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

/**
 * A pane budget with a visible HEAD taken out of it: the counts scaled by the share of the pane's
 * height the head leaves, rounded, never below `floor`. The budgets were measured with no head, so
 * the head's cost is subtracted from them rather than measured into them. Heights are the
 * heights in `PANE_HEAD` below, the same ones the engine takes out of the pane's box. Side by side
 * a title is about 12% of the pane; stacked at 50/50, 27%. The linter counts one title line: it
 * has no pane width to wrap against, and a wrapped title is rare in a pane that also has a budget.
 * Measured against examples/pane-layouts.md: a titled 40% progress band holds 2 of its 3 rows
 * (the third clips), and a titled 50% content pane holds 3 short items with room to spare.
 */
/**
 * THE PANE HEAD'S MEASURED HEIGHTS — the one copy the engine's pane box (lib/engine/index.js
 * `paneGeometry`) and this linter's budget both read, each a fraction of the slide WIDTH, measured
 * in Chromium at 1280 (indaco, lib/forms/cell/pane/pane.css) with the head's own spacing counted
 * in: a title line .02875 (30.7px Display, 36.8 line), an eyebrow .0290, a subtitle .0283, and
 * the gap between head and pane .0125 (--sp-sm). A title or subtitle that WRAPS takes a line per
 * line, against a measured capacity of 70.2 and 106.6 characters per 1000px of pane width.
 * `stage` is a title-only 16:9 slide's pane height (438.9px at 1280) and `stackGap` the stacked
 * gutter (--sp-xl), for the linter, which has no box to measure.
 */
const PANE_HEAD = {
  title: 0.02875, eyebrow: 0.0290, subtitle: 0.0283, gap: 0.0125, cplTitle: 70.2, cplSubtitle: 106.6,
  stage: 438.9 / 1280, stackGap: 0.0375,
};
function headedBudget(limit, direction, share, head, floor = 1) {
  if (!limit || !head) return limit;
  const H = PANE_HEAD;
  const headPx = H.title + (head.eyebrow ? H.eyebrow : 0) + (head.subtitle ? H.subtitle : 0) + H.gap;
  const panePx = direction === 'stack' ? (H.stage - H.stackGap) * (share / 100) : H.stage;
  const k = Math.max(0, 1 - headPx / panePx);
  const scale = (n) => Math.max(floor, Math.round(n * k));
  return { sweet: scale(limit.sweet), hard: scale(limit.hard) };
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
 * A slide's pane layout, read from its markdown: `{ split, classLine, fromClass }`. `split` is
 * `{ layout, markers, panes: [{ cls, mods, markdown, line }], … }`, or null when the slide has
 * fewer than two panes (`markers` counts every pane start, a third included); `classLine` and
 * `fromClass` are the slide's last top-level `_class` comment and the layout it names, so a
 * caller can report a layout that found too few panes. The carve works on markdown-it's parsed tokens and takes a marker only when it is
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
function scanPanes(slide, specs = null) {
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
  let klass = null;
  const heads = [];
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
        // A comment's whole text: it runs to the first line holding `-->` (markdown-it's own end).
        let end = n;
        if (htmlType === 1) while (end < lines.length - 1 && !lines[end].includes('-->')) end++;
        const full = htmlType === 1 ? lines.slice(n, end + 1).join('\n').trim() : line;
        const m = parseMarker(full);
        const l = full.match(PANES_RE);
        const c = classOf(full);
        if (m) markers.push({ ...m, line: n, end });
        else if (l) spec = l[1].trim();
        else if (c !== null) klass = { value: c, line: n };
      }
      const h = HTML_STARTS[htmlType];
      // A block that ends on its own opening line (a one-line comment) closes at once.
      if (!h.end?.test(line.replace(h.open, ''))) html = { end: h.end, col: base };
      return;
    }
    if (!depth && /^###(?:[ \t]|$)/.test(line)) heads.push(n);
    para = opensPara(line);
  });
  const fromClass = klass ? classLayout(klass.value) : null;
  const syntax = Boolean(fromClass) || markers.some((m) => !m.legacy);
  const starts = syntax ? paneStartsOf(markers, heads, lines, specs) : markers.map((m) => ({ ...m, from: m.end + 1 }));
  const intent = { classLine: klass ? klass.line : -1, fromClass };
  if (starts.length < 2) return { split: null, ...intent };
  const body = (from, to) => lines.slice(from, to).join('\n');
  const pane = (k) => {
    const st = starts[k];
    const to = k === 0 ? starts[1].line : lines.length;
    return { cls: st.cls, mods: st.mods, modifiers: st.modifiers || [], line: st.line, heading: Boolean(st.heading), markdown: body(st.from, to) };
  };
  const layout = parseLayout(fromClass ? fromClass.spec : spec);
  // Written in the SYNTAX (a `_class` layout or a `_pane` marker): heads and the slide-wide coda
  // apply. In the alias alone, neither does (`layoutComment`).
  if (fromClass || markers.some((m) => !m.legacy)) layout.heads = true;
  return { ...intent, split: {
    layout,
    markers: starts.length,
    // Which syntax the slide used: `class` (a `_class` layout), else the `panes:` alias.
    syntax: fromClass ? 'class' : 'legacy',
    legacyMarkers: markers.some((m) => m.legacy),
    legacyLayout: spec !== null,
    classLine: klass ? klass.line : -1,
    classRest: fromClass ? fromClass.rest : null,
    panes: [pane(0), pane(1)],
    // The starts past the second, which fold into it: each `{ cls, line, heading }` (`heading`
    // when a `###` started it rather than a marker), so the linter can say what folded.
    folded: starts.slice(2).map((st) => ({ cls: st.cls, line: st.line, heading: Boolean(st.heading) })),
  } };
}

/**
 * Where each pane of a slide in the pane SYNTAX starts — the rule the engine's rewrite applies to
 * tokens (lib/core/panes.js `normalizePaneSyntax`), on text: every top-level `###` is a pane's
 * title. It is the title of the pane a marker just opened when nothing but an eyebrow pill sits
 * between them; otherwise it starts a new `content` pane. A pane whose component owns its `###`s
 * (`ownsHeadings`) keeps them all. So an author can add a marker above one `###` of an outline
 * and the other `###` stays a pane.
 */
function paneStartsOf(markers, heads, lines, specs) {
  const events = [
    ...markers.map((m) => ({ kind: 'marker', at: m.line, m })),
    ...heads.map((line) => ({ kind: 'head', at: line })),
  ].sort((x, y) => x.at - y.at);
  const onlyPill = (from, to) => lines.slice(from, to).filter((l) => l.trim() && !/^<!--.*-->$/.test(l.trim())).every((l, _i, all) => all.length === 1 && /^`[^`]+`$/.test(l.trim()));
  const starts = [];
  let current = null;
  let titleOpen = false;
  let after = 0;
  for (const ev of events) {
    if (ev.kind === 'marker') {
      starts.push({ ...ev.m, from: ev.m.end + 1 });
      current = ev.m.cls;
      titleOpen = !ownsHeadings(specs, current);
      after = ev.m.end + 1;
      continue;
    }
    if (current && ownsHeadings(specs, current)) continue;
    if (current && titleOpen && (after >= ev.at || onlyPill(after, ev.at))) {
      titleOpen = false;
      continue;
    }
    starts.push({ cls: 'content', mods: [], modifiers: [], legacy: false, line: ev.at, end: ev.at - 1, from: ev.at, heading: true });
    current = 'content';
    titleOpen = false;
  }
  return starts;
}

/** The panes of one slide's markdown, or null when it has fewer than two (`scanPanes`). `specs`
 *  is the pane catalog (for `ownsHeadings`); without it no component owns a `###`. */
function splitPaneMarkdown(slide, specs = null) {
  return scanPanes(slide, specs).split;
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
    const h3 = Object.values(m.slots || {}).some((s) => /(?:^|[\s>+~,(])h3\b/.test(String(s?.selector || '')));
    paneSpec[m.name] = { side: m.pane.side, stack: m.pane.stack, ...(h3 ? { h3: true } : {}) };
    if (m.pane.budget) {
      const { axis, min, at, side, stack } = m.pane.budget;
      paneBudget[m.name] = { axis, ...(min ? { min } : {}), ...(at ? { at } : {}), ...(side ? { side: { ...side } } : {}), ...(stack ? { stack: { ...stack } } : {}) };
    }
  }
  return { paneSpec, paneBudget };
}

module.exports = {
  PANE_RE, PANES_RE, MARKER_RE, CLASS_RE, INTERNAL_PANE_RE, INTERNAL_PANES_RE, PANE_MODS, LAYOUTS, PANE_HEAD, RATIO_MIN, RATIO_MAX, RATIO_STEP, BUDGET_AT,
  parseLayout, parseMarker, markerComment, readMarker, readLayout, ownsHeadings, paneStartsOf, classLayout, classOf, layoutComment, mayHavePanes, paneHeadText, headedBudget,
  specOf, fits, arrangePanes, paneBudgetLimit, splitPaneMarkdown, scanPanes, paneVocab,
};
