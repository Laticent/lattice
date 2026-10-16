/**
 * Panes — two components' body content on ONE slide (proof of concept).
 *
 * A slide stays one slide: its title, eyebrow, subtitle, Key Insight, below-note,
 * header, footer and pagination all belong to the HOST section, exactly as today.
 * Only the BODY is split. The author writes body content for two components and
 * marks where each begins:
 *
 *     ## Q3 pipeline by region
 *     <!-- panes: 40/60 -->            optional — default 50/50; `stack 35/65` stacks
 *     <!-- pane: list -->
 *     - EMEA leads the quarter
 *     <!-- pane: table -->
 *     | Region | Q2 | Q3 |
 *     …
 *     > The slide's Key Insight.
 *
 * How it renders (engineering/decisions/2026-09-25-panes-two-components-one-slide.md):
 *
 *   1. `installPanes` adds a markdown-it core rule that runs INSIDE the host parse, after
 *      the engine has split slides (`---` and `split: headings`), applied directives and
 *      propagated deck classes. So "where does a slide end", "is this marker inside a
 *      fence" and "which directive does this comment set" are the engine's own answers,
 *      never a second guess. The rule carves each slide carrying two `pane:` markers:
 *      the host keeps its masthead, any heading found inside a pane, and the trailing
 *      coda; each pane's blocks are cut back out of the SOURCE by their line maps; the
 *      pane region becomes one placeholder.
 *   2. The engine renders each pane's markdown AS AN ORDINARY ONE-SLIDE DECK of its
 *      component, through a parser built for the PANE's box — so every transform sees a
 *      normal whole section, and `data-family` / `data-orientation` describe the pane.
 *   3. `embed()` lifts that section's body into a `<lat-pane>` element carrying the
 *      pane's class list and stamps, and drops it into the placeholder.
 *
 * Component CSS reaches the pane because a deck WITH panes composes its sheet through
 * lib/core/pane-css.js, which adds a `section lat-pane…` twin beside each rule arm that
 * reaches one of the deck's panes; the shipped sheet is never widened. A pane is not a
 * `section`, so nothing that counts slides counts a pane.
 *
 * ON A TALL OR SQUARE DECK THE PANES SPLIT (`installPaneSplit`). Square, portrait, story and
 * mobile set type about twice as large, so two components do not share one frame there: a
 * panes slide becomes one ordinary slide per pane, before the engine forms slides, and each
 * then renders — and auto-splits — exactly as if the author had written it. The gate is the
 * structural auto-split's own (every family but `wide`, lib/core/structural-split.js).
 *
 * Which component may go in a pane, and what it renders AS there, is each manifest's
 * `pane` field, baked into lib/forms/cell/pane/pane-catalog.generated.js: the share it needs
 * side by side and stacked, or `false` for a direction it never takes. A pairing that does not
 * read as written is re-oriented, or split into one slide per pane (`installPaneSplit`), so a
 * pane is never drawn too small for its component. The lint says which, and never blocks.
 */

const { isComponentToken } = require('./resolve-component');
const { groupOnSlideRule } = require('./slide-rule');
const spec = require('./pane-spec');
const { PANES_RE, RATIO_MIN, RATIO_MAX, RATIO_STEP, parseLayout } = spec;
const { isSlideRule } = require('./slide-rule');
const CODA_CATALOG = require('../forms/cell/coda/coda-catalog.generated.js');
const { CARDS_TOKENS } = require('./resolve-cards');
const { commentCloser } = require('./closed-comments');

/** The class the carve puts on a host section. It names no component, and it keeps
 *  the default `content` off the host, whose descendant rules would reach both panes. */
const HOST_CLASS = 'lat-pane-host';

/** Each component's `pane` manifest field — the least `side` and `stack` share it reads at, and
 *  its pane `form` (tools/build-stage-catalog.js). */
const PANE_CATALOG = require('../forms/cell/pane/pane-catalog.generated.js');

/** The component a pane renders AS: its pane form if it has one, else itself. Own keys only,
 *  so a marker naming `constructor` or `toString` reads as that literal name. */
function paneForm(cls) {
  return (Object.hasOwn(PANE_CATALOG, cls) && PANE_CATALOG[cls].form) || cls;
}

/** Group a slide's tokens into top-level blocks: [{ start, end }] index ranges. */
function topLevelBlocks(tokens, from, to) {
  const blocks = [];
  let i = from;
  while (i < to) {
    if (tokens[i].nesting === 1) {
      let depth = 0;
      let j = i;
      for (; j < to; j++) {
        depth += tokens[j].nesting;
        if (depth === 0) break;
      }
      blocks.push({ start: i, end: j + 1 });
      i = j + 1;
    } else {
      blocks.push({ start: i, end: i + 1 });
      i++;
    }
  }
  return blocks;
}

const headingLevel = (tokens, b) => {
  const t = tokens[b.start];
  return t.type === 'heading_open' ? Number(t.tag.slice(1)) : 0;
};
const isCodeOnlyParagraph = (tokens, b) => {
  if (tokens[b.start].type !== 'paragraph_open') return false;
  const kids = tokens[b.start + 1]?.children || [];
  return kids.length === 1 && kids[0].type === 'code_inline';
};
const isBlockquote = (tokens, b) => tokens[b.start].type === 'blockquote_open';
const isNoteParagraph = (tokens, b) =>
  tokens[b.start].type === 'paragraph_open' && /^\s*—\s/.test(tokens[b.start + 1]?.content || '');
// A directive comment the engine already consumed is left as an empty text token.
const isEmpty = (tokens, b) =>
  b.end - b.start === 1 && tokens[b.start].type === 'text' && tokens[b.start].content === '';
/** A block's text length — the sum of its inline content — for the engine's line estimate. */
const textLength = (tokens, b) => {
  let n = 0;
  for (let i = b.start; i < b.end; i++) if (tokens[i].type === 'inline') n += tokens[i].content.length;
  return n;
};
const isComment = (tokens, b) =>
  tokens[b.start].type === 'html_block' && /^\s*<!--[\s\S]*-->\s*$/.test(tokens[b.start].content);

/**
 * A pane's head, cut out of its block list `p` (mutated): `{ eyebrow, title, subtitle, hidden }`
 * as raw inline markdown (each null when absent), or null when the pane does not OPEN with a
 * `###` — after its comments, with at most an eyebrow pill before it. The text-level twin is
 * lib/core/pane-spec.js `paneHeadText`.
 */
function paneHeadOf(tokens, p, hidden) {
  let n = 0;
  while (n < p.length && (isComment(tokens, p[n]) || isEmpty(tokens, p[n]))) n++;
  const isH3 = (b) => Boolean(b) && headingLevel(tokens, b) === 3;
  const at = n < p.length && isCodeOnlyParagraph(tokens, p[n]) && isH3(p[n + 1]) ? n + 1 : n;
  if (!isH3(p[at])) return null;
  // Each part as its raw inline source (a pill keeps its backticks), so the head renders through
  // the host's own inline rules, pill directives included (`paneHeadHtml`).
  const inline = (b) => tokens[b.start + 1]?.content ?? '';
  const sub = at + 1 < p.length && isCodeOnlyParagraph(tokens, p[at + 1]) ? at + 1 : -1;
  const head = { eyebrow: at > n ? inline(p[n]) : null, title: inline(p[at]), subtitle: sub >= 0 ? inline(p[sub]) : null, hidden };
  p.splice(n, (sub >= 0 ? sub : at) - n + 1);
  // A bare `###` titles nothing: it is dropped rather than set as an empty row (an eyebrow above
  // it goes with it). An eyebrow is NOT a row of its own: it joins the title (`paneHeadHtml`).
  return head.title.trim() ? head : null;
}

/** A small, stable FNV-1a hash — the placeholder's nonce, so author HTML can't forge it. */
function nonceOf(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Put the host class on the section and take any component class off it. */
function markHost(open) {
  const keep = (list) => list.split(/\s+/).filter(Boolean).filter((c) => !isComponentToken(c));
  open.attrSet('class', [...keep(open.attrGet('class') || '').filter((c) => c !== HOST_CLASS), HOST_CLASS].join(' '));
  // The raw class payload goes too, in both the places a slide carries it: a component
  // transform keyed on `data-class` / `--class` would otherwise run on the HOST (a
  // `_class: glossary` put a letter-range pill on the slide title and cut the pane's
  // entries), and nothing on the host is a component any more.
  const data = open.attrGet('data-class');
  if (data != null) {
    const rest = keep(data).join(' ');
    if (rest) open.attrSet('data-class', rest);
    else open.attrs = open.attrs.filter(([k]) => k !== 'data-class');
  }
  const style = open.attrGet('style');
  if (style) {
    // Anchored to a declaration start, so a `--class:` inside another property's quoted value
    // (a header reading `--class:`) is never mistaken for it.
    const next = style.replace(/(^|;)\s*--class:\s*"([^"]*)";?/, (_m, lead, v) => {
      const rest = keep(v).join(' ');
      return rest ? `${lead}--class:"${rest}";` : lead;
    });
    if (next !== style) open.attrSet('style', next);
  }
}

function carveSlide(tokens, from, to, lines, section, nonce, env) {
  const blocks = topLevelBlocks(tokens, from, to);
  const markers = [];
  let layoutSpec = null;
  const layoutBlocks = new Set();
  blocks.forEach((b, k) => {
    const t = tokens[b.start];
    if (t.type !== 'html_block') return;
    const m = spec.readMarker(t.content);
    if (m) markers.push({ k, ...m });
    const l = t.content.trim().match(spec.INTERNAL_PANES_RE);
    if (l) {
      layoutSpec = l[1].trim();
      layoutBlocks.add(k);
    }
  });
  if (markers.length < 2) return null;

  const layout = parseLayout(layoutSpec);
  const warnings = layout.error ? [layout.error] : [];
  if (markers.length > 2) warnings.push(`panes: ${markers.length} pane markers — v1 takes two; the rest fold into the second pane`);

  const host = [];
  const tail = [];
  const pane = [[], []];
  blocks.forEach((b, k) => {
    if (layoutBlocks.has(k) || markers.some((m) => m.k === k)) return;
    if (k < markers[0].k) host.push(b);
    // A block with no source line map was built by an earlier rule (the running header
    // and footer): it is the host's, never a pane's, and keeps its place at the end.
    else if (!tokens[b.start].map && !isEmpty(tokens, b)) tail.push(b);
    // A directive comment the engine already applied — to the SLIDE, which is where a spot
    // directive belongs — stays on the host. Copied into a pane's source, a `_class` would
    // apply a second time there and replace the pane's component.
    else if (isEmpty(tokens, b)) tail.push(b);
    else pane[k < markers[1].k ? 0 : 1].push(b);
  });
  // ONE title: a heading written inside a pane is the slide's, and so is an eyebrow or
  // subtitle pill right next to it.
  const hoisted = [];
  for (const p of pane) {
    for (let n = 0; n < p.length; n++) {
      const lvl = headingLevel(tokens, p[n]);
      if (lvl !== 1 && lvl !== 2) continue;
      const lo = n > 0 && isCodeOnlyParagraph(tokens, p[n - 1]) ? n - 1 : n;
      const hi = n + 1 < p.length && isCodeOnlyParagraph(tokens, p[n + 1]) ? n + 1 : n;
      hoisted.push(...p.splice(lo, hi - lo + 1));
      n = lo - 1;
    }
  }
  // A pairing that does not fit never reaches the carve: `installPaneSplit` re-oriented or split
  // it before the slides formed, from the same measured fits (`spec.arrangePanes`).
  const cls = markers.slice(0, 2).map((m) => m.cls);
  // EACH PANE'S HEAD — an eyebrow pill, a `###` title, a subtitle pill — opening the pane, as a
  // slide's masthead opens the slide one level up. It is the pane FRAME's, not the component's:
  // it comes out of the pane's source here and the engine sets it above the pane (`embed`), so no
  // component rule written for a `###` of its own ever styles it.
  // Only a slide written in the pane SYNTAX (`layout.heads`, lib/core/pane-spec.js
  // `layoutComment`) takes heads and the slide-wide coda; a slide in the alias keeps the rules it
  // rendered with.
  const syntax = Boolean(layout.heads);
  // A component that owns its `###`s (team-profile sides) keeps the first one too.
  const heads = pane.map((p, index) => (syntax && !spec.ownsHeadings(PANE_CATALOG, cls[index]) ? paneHeadOf(tokens, p, markers[index].mods.includes('no-title')) : null));
  const claimsOf = (index) => {
    const key = paneForm(cls[index]);
    return new Set((Object.hasOwn(CODA_CATALOG, key) && CODA_CATALOG[key].claims) || []);
  };
  const codaShaped = (b, claims) => (isBlockquote(tokens, b) && !claims.has('blockquote'))
    || (isNoteParagraph(tokens, b) && !claims.has('trailing-paragraph'));
  const coda = [];
  if (syntax) {
    // The Key Insight and the below-note belong to the SLIDE (a pane is a portal: it brings its
    // component's stage content and nothing else): the trailing run of `>` and `— ` in EITHER pane,
    // where an author closes a thought, goes below both panes. A `>` in the middle of a pane is a
    // quotation, part of that pane's argument, and stays. So does whatever the pane's component
    // claims for its own anatomy (a quote's attribution, a chart's caption), and a pane that is
    // nothing but coda-shaped blocks (one blockquote; a quote and its `— ` attribution), which
    // would otherwise be left empty under its title.
    pane.forEach((list, index) => {
      const claims = claimsOf(index);
      const content = list.filter((b) => !isComment(tokens, b) && !isEmpty(tokens, b));
      if (content.every((b) => codaShaped(b, claims))) return;
      const run = [];
      while (list.length && (codaShaped(list[list.length - 1], claims) || isComment(tokens, list[list.length - 1]) || isEmpty(tokens, list[list.length - 1]))) run.unshift(list.pop());
      // The comments in pane A's run stay with pane A; those after the last pane (a speaker note)
      // close the slide, as they always have.
      for (const b of run) {
        if (codaShaped(b, claims) || index === 1) coda.push(b);
        else list.push(b);
      }
    });
  } else {
    // The alias: the trailing run after the last pane belongs to the slide, unless pane B's
    // component claims it.
    const claims = claimsOf(1);
    const last = pane[1];
    while (last.length > 1) {
      const b = last[last.length - 1];
      if (!(codaShaped(b, claims) || isComment(tokens, b) || isEmpty(tokens, b))) break;
      coda.unshift(last.pop());
    }
  }
  // Coda-shaped blocks that STAYED in a pane — a component's claimed coda, and in the alias a pane
  // A's own trailing Key Insight or note — take their height there, so that pane's chart canvas is smaller by them (lib/engine/index.js
  // `renderPane`). Index 0 is never counted: a pane whose body IS a blockquote is content.
  const keptTail = (list) => {
    const kept = { insight: 0, note: 0 };
    for (let n = list.length - 1; n > 0; n--) {
      const b = list[n];
      if (isComment(tokens, b) || isEmpty(tokens, b)) continue;
      if (isBlockquote(tokens, b)) kept.insight = Math.max(1, textLength(tokens, b));
      else if (isNoteParagraph(tokens, b)) kept.note = Math.max(1, textLength(tokens, b));
      else break;
    }
    return kept;
  };

  const source = (list) => list
    .filter((x) => tokens[x.start].map)
    .map((x) => lines.slice(tokens[x.start].map[0], tokens[x.start].map[1]).join('\n'))
    .join('\n\n');
  // What the HOST keeps above and below the panes — each takes stage height the panes do not
  // get (lib/engine/index.js `paneGeometry`). A code-only paragraph before the title is an
  // eyebrow, after it a subtitle; the coda's blockquote is the Key Insight, a `— ` line the note.
  const mast = [...host, ...hoisted];
  const titleAt = mast.findIndex((b) => [1, 2].includes(headingLevel(tokens, b)));
  // Each is its text LENGTH (0 when absent), so the engine can count the lines it wraps to.
  const len = (list, test) => list.filter(test).reduce((n, b) => n + Math.max(1, textLength(tokens, b)), 0);
  const chrome = {
    title: titleAt >= 0 ? textLength(tokens, mast[titleAt]) : 0,
    eyebrow: len(mast.filter((_b, n) => titleAt < 0 || n < titleAt), (b) => isCodeOnlyParagraph(tokens, b)),
    subtitle: titleAt >= 0 ? len(mast.filter((_b, n) => n > titleAt), (b) => isCodeOnlyParagraph(tokens, b)) : 0,
    insight: len(coda, (b) => isBlockquote(tokens, b)),
    note: len(coda, (b) => isNoteParagraph(tokens, b)),
    // Each pane's head, as text lengths (0 when absent); a hidden head takes no height.
    heads: heads.map((h) => (h && !h.hidden
      ? { title: Math.max(1, h.title.length + (h.eyebrow === null ? 0 : (spec.pillText(h.eyebrow) ?? h.eyebrow).length + spec.LABEL_SEP.length)), subtitle: h.subtitle === null ? 0 : Math.max(1, h.subtitle.length) }
      : null)),
  };
  if (!env.latticePanes) env.latticePanes = [];
  const slot = `${nonce}-${env.latticePanes.length}`;
  env.latticePanes.push({
    slot, section, layout, warnings, chrome,
    panes: markers.slice(0, 2).map((m, index) => ({
      index, cls: cls[index], authored: m.cls, mods: m.mods, modifiers: m.modifiers, head: heads[index],
      markdown: source(pane[index]), claimed: keptTail(pane[index]),
      // The source lines (of the parsed body) this pane's blocks came from, so a caller that
      // holds a position in the source can tell which pane it lands in without re-reading markers.
      lines: pane[index].filter((x) => tokens[x.start].map).map((x) => tokens[x.start].map.slice()),
    })),
  });

  const placeholder = new tokens[from].constructor('html_block', '', 0);
  placeholder.block = true;
  placeholder.content =
    `<div class="lat-panes" data-panes="${layout.direction}"${layout.rule ? '' : ' data-rule="none"'} data-pane-slot="${slot}"` +
    ` style="--pane-a: ${layout.a}; --pane-b: ${layout.b}"></div>\n`;
  const take = (list) => list.flatMap((x) => tokens.slice(x.start, x.end));
  return [...take(host), ...take(hoisted), placeholder, ...take(coda), ...take(tail)];
}

/**
 * A split page's body with its pane HEAD (eyebrow, `###`, subtitle — the page's first blocks) held
 * together in one `<div class="lat-pane-head">`, so the page's component reads it as one block of
 * lead content: a chart's wrap otherwise took the head's subtitle pill for the chart's own and
 * lifted it into the masthead, above the pane title. A `no-title` head stays in the page, hidden
 * to the eye as it was on the slide. A body that opens with no `###` comes back as it went in.
 */
function headBlock(state, body, hidden) {
  const blocks = [];
  let n = 0;
  while (n < body.length) {
    const t = body[n];
    let end = n;
    if (t.nesting === 1) { let d = 0; for (; end < body.length; end++) { d += body[end].nesting; if (d === 0) break; } }
    blocks.push({ start: n, end: end + 1 });
    n = end + 1;
  }
  const comment = (b) => body[b.start].type === 'html_block' && /^\s*<!--/.test(body[b.start].content);
  const pill = (b) => b && body[b.start].type === 'paragraph_open' && (body[b.start + 1]?.children || []).length === 1 && body[b.start + 1].children[0].type === 'code_inline';
  const h3 = (b) => b && body[b.start].type === 'heading_open' && body[b.start].tag === 'h3';
  let k = 0;
  while (k < blocks.length && comment(blocks[k])) k++;
  const at = pill(blocks[k]) && h3(blocks[k + 1]) ? k + 1 : k;
  if (!h3(blocks[at])) return body;
  const last = pill(blocks[at + 1]) ? at + 1 : at;
  // A bare `###` titles nothing: it goes with the eyebrow pill above it and the subtitle pill
  // below it, as the whole head does above a pane on the wide slide (`paneHeadOf`), so no empty
  // head row is left behind and no stray pill is read as the page masthead's subtitle.
  if (!body[blocks[at].start + 1].content.trim()) {
    return [...body.slice(0, blocks[k].start), ...body.slice(blocks[last].end)];
  }
  // One label per pane, as above a pane (`paneHeadHtml`): the eyebrow pill, rendered by the host's
  // inline rules, is prepended to the heading's inline children.
  if (at > k) {
    const inline = body[blocks[at].start + 1];
    const label = new state.Token('html_inline', '', 0);
    label.content = `${spec.labelOf(state.md.renderInline(body[blocks[k].start + 1].content))}${spec.LABEL_SEP}`;
    inline.children = [label, ...(inline.children || [])];
  }
  const from = at > k ? blocks[at].start : blocks[k].start;
  const open = new state.Token('html_block', '', 0);
  open.content = `<div class="lat-pane-head"${hidden ? ' data-hidden' : ''}>\n`;
  open.block = true;
  const close = new state.Token('html_block', '', 0);
  close.content = '</div>\n';
  close.block = true;
  return [
    ...body.slice(0, blocks[k].start), open, ...body.slice(from, blocks[last].end), close, ...body.slice(blocks[last].end),
  ];
}

/** A spot directive comment (`<!-- _class: … -->`): it belongs to the slide, so each split
 *  page carries it. Any other comment (a speaker note) stays with the first page only. */
const SPOT_DIRECTIVE_RE = /^<!--\s*_[\w-]+\s*:/;
const SPOT_CLASS_RE = /^<!--\s*_class\s*:\s*([\s\S]*?)\s*-->\s*$/;

/** A deep copy of a markdown-it token, so each split page owns the directives it carries. */
function cloneToken(state, t) {
  const c = new state.Token(t.type, t.tag, t.nesting);
  c.attrs = t.attrs ? t.attrs.map((a) => a.slice()) : t.attrs;
  c.map = t.map ? t.map.slice() : t.map;
  c.level = t.level;
  c.children = t.children ? t.children.map((ch) => cloneToken(state, ch)) : t.children;
  c.content = t.content;
  c.markup = t.markup;
  c.info = t.info;
  c.meta = t.meta;
  c.block = t.block;
  c.hidden = t.hidden;
  return c;
}

/**
 * Every top-level `###` on a slide in the pane syntax is a pane's title: of the pane a marker just
 * opened, when nothing but an eyebrow pill (and comments) sits between them, or else of a new
 * `content` pane, whose internal marker is inserted before it. A pane whose component owns its
 * `###`s (`team-profile sides`, lib/core/pane-spec.js `ownsHeadings`) keeps them all. The text
 * twin is lib/core/pane-spec.js `paneStartsOf`; the two are held to one answer by
 * test/unit/core/pane-layouts.test.js. `list` is mutated.
 */
function startPanesAtHeadings(list, comment) {
  let current = null;
  let titleOpen = false;
  let seen = 0;
  let pill = false;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t.level !== 0 || t.nesting === -1) continue;
    const m = t.type === 'html_block' ? spec.readMarker(t.content) : null;
    if (m) {
      current = m.cls;
      titleOpen = !spec.ownsHeadings(PANE_CATALOG, current);
      seen = 0;
      pill = false;
      continue;
    }
    if (t.type === 'heading_open' && t.tag === 'h3') {
      if (current && spec.ownsHeadings(PANE_CATALOG, current)) continue;
      if (current && titleOpen && seen === 0) {
        titleOpen = false;
        continue;
      }
      list.splice(i, 0, comment(spec.markerComment('content'), t.map));
      i++;
      current = 'content';
      titleOpen = false;
      continue;
    }
    if (t.type === 'html_block' && /^\s*<!--/.test(t.content)) continue;
    const kids = t.type === 'paragraph_open' ? list[i + 1]?.children || [] : [];
    if (titleOpen && seen === 0 && !pill && kids.length === 1 && kids[0].type === 'code_inline') {
      pill = true;
      continue;
    }
    seen++;
  }
}

/**
 * THE AUTHORING SYNTAX, rewritten into the internal one the rules below read
 * (engineering/decisions/2026-09-28-generic-pane-layouts-authoring.md §2). Runs on the block
 * tokens after the heading split has placed every slide break and before anything else reads a
 * pane, so one pass decides what every later rule sees:
 *   · `<!-- _class: columns ratio-60-40 dark -->` → the layout comment `<!-- panes: 60/40 -->`, and a
 *     `_class` of whatever else it named (`dark`), or none. `rows` is `stack`. A `_class`
 *     layout wins over a `panes:` comment on the same slide, which goes.
 *   · `<!-- _pane: bar no-title -->` → `<!-- pane: bar no-title -->` (`_pane: no-title` names
 *     `content`).
 *   · a `columns` / `rows` slide with no marker: a `content` marker before each top-level `###`.
 * A slide that names no layout and no `_pane` marker keeps every token it had, so a deck
 * written in the alias renders exactly as before.
 */
function normalizePaneSyntax(state) {
  const tokens = state.tokens;
  const top = (t) => t.type === 'html_block' && t.level === 0;
  const comment = (content, map) => {
    const t = new state.Token('html_block', '', 0);
    t.content = `${content}\n`;
    t.block = true;
    t.map = map ? map.slice() : null;
    return t;
  };
  const out = [];
  let group = [];
  const flush = () => {
    // The slide's layout is its LAST `_class` comment's, as the last `_class` is the one the
    // engine applies (Marp's rule): `_class: columns` then `_class: dark` is a plain dark slide.
    const classAts = [];
    group.forEach((t, i) => { if (top(t) && spec.classOf(t.content) !== null) classAts.push(i); });
    const lastClass = classAts.length ? classAts[classAts.length - 1] : -1;
    const fromClass = lastClass >= 0 ? spec.classLayout(spec.classOf(group[lastClass].content)) : null;
    // The internal form is the ENGINE's, never an author's: a comment written in it is inert, so
    // no one can hand the carve a marker the rewrite did not check (a `cls` carrying quotes).
    group.forEach((t, i) => {
      if (top(t) && (spec.INTERNAL_PANE_RE.test(t.content.trim()) || spec.INTERNAL_PANES_RE.test(t.content.trim()))) {
        group[i] = comment('<!-- -->', t.map);
      }
    });
    const markerAt = [];
    group.forEach((t, i) => { if (top(t) && spec.parseMarker(t.content)) markerAt.push(i); });
    if (!fromClass && !markerAt.length) { out.push(...group); return; }
    // Written in the pane SYNTAX (a `_class` layout or a `_pane` marker), not only the alias.
    const syntax = Boolean(fromClass) || markerAt.some((i) => !spec.parseMarker(group[i].content).legacy);
    const next = [];
    let legacyLayout = null;
    group.forEach((t, i) => {
      if (top(t) && PANES_RE.test(t.content.trim())) {
        // The class layout wins over an alias layout comment; with none, the alias comment keeps
        // its ratio.
        if (!fromClass) legacyLayout = t.content.trim().match(PANES_RE)[1].trim();
        return;
      }
      if (classAts.includes(i)) {
        // The layout words are never classes: every `_class` loses them. The last one stays even
        // when nothing is left of it, so an earlier `_class` cannot take its place.
        const l = spec.classLayout(spec.classOf(t.content));
        if (!l) next.push(t);
        else if (l.rest || i === lastClass) next.push(comment(`<!-- _class: ${l.rest} -->`, t.map));
        return;
      }
      const m = markerAt.includes(i) ? spec.parseMarker(t.content) : null;
      // A host (`columns`, `rows`) cannot go inside a pane: that pane renders as `content`, and
      // `lint:deck` says so (pane-spec `scanPanes` mirrors this).
      if (m) { next.push(comment(spec.markerComment(spec.isHost(PANE_CATALOG, m.cls) ? 'content' : m.cls, m.mods, m.modifiers), t.map)); return; }
      next.push(t);
    });
    if (syntax) startPanesAtHeadings(next, comment);
    // A `_class: columns` slide that found fewer than two panes is an ordinary slide, and the word
    // stays the class it was before this syntax existed (a Marp deck's own `section.columns`).
    if (fromClass && next.filter((t) => top(t) && spec.readMarker(t.content)).length < 2) {
      out.push(...group);
      return;
    }
    // One layout comment, before the first pane; `heads` marks the syntax.
    const first = next.findIndex((t) => top(t) && spec.readMarker(t.content));
    if (first >= 0) {
      const layout = parseLayout(fromClass ? fromClass.spec : legacyLayout);
      next.splice(first, 0, comment(spec.layoutComment({ ...layout, heads: syntax }), next[first].map));
    }
    out.push(...next);
  };
  for (const t of tokens) {
    if (isSlideRule(t)) { flush(); out.push(t); group = []; } else group.push(t);
  }
  flush();
  state.tokens = out;
}

/**
 * Decide how each panes slide renders, before the engine forms slides, from the components'
 * measured fits (`spec.arrangePanes`): as written; RE-ORIENTED, when both panes fit the other
 * direction (the layout comment is rewritten, so the carve lays them out that way); or SPLIT into
 * one ordinary slide per pane. On a deck whose family is not `wide` (square, portrait, story,
 * mobile) every panes slide splits: those sizes set type too large for two components to share a
 * frame. A split slide's first page takes the masthead and the first pane, each later
 * page repeats the masthead (and the slide's spot directives) with its own pane, and the coda —
 * written after the last pane — closes the last page. The page's class is the pane's component,
 * merged with any spot `_class` the author wrote. The markers and the layout comment go.
 */
function installPaneSplit(md, { family } = {}) {
  const alwaysSplit = Boolean(family) && family !== 'wide';
  md.core.ruler.before('lattice_slide', 'lattice_panes_normalize', (state) => {
    if (state.inlineMode || !spec.mayHavePanes(state.src)) return;
    normalizePaneSyntax(state);
  });
  md.core.ruler.before('lattice_slide', 'lattice_panes_split', (state) => {
    if (state.inlineMode || !spec.mayHavePanes(state.src)) return;
    const isMarker = (t) => t.type === 'html_block' && t.level === 0 && Boolean(spec.readMarker(t.content));
    const isLayout = (t) => t.type === 'html_block' && t.level === 0 && spec.INTERNAL_PANES_RE.test(t.content.trim());
    const out = [];
    let first = true;
    const pushHr = () => {
      if (first) { first = false; return; }
      const hr = new state.Token('hr', 'hr', 0);
      hr.markup = '---';
      hr.block = true;
      out.push(hr);
    };
    for (const group of groupOnSlideRule(state.tokens)) {
      const at = [];
      group.forEach((t, i) => { if (isMarker(t)) at.push(i); });
      if (at.length < 2) {
        pushHr();
        out.push(...group);
        continue;
      }
      if (!alwaysSplit) {
        const layoutAt = group.findIndex(isLayout);
        const layout = layoutAt >= 0 ? spec.readLayout(group[layoutAt].content) : spec.parseLayout(null);
        const arranged = spec.arrangePanes(PANE_CATALOG, at.slice(0, 2).map((i) => spec.readMarker(group[i].content).cls), layout);
        if (arranged.as !== 'split') {
          if (arranged.as === 'reoriented') {
            const l = arranged.layout;
            const t = new state.Token('html_block', '', 0);
            t.content = `${spec.layoutComment(l)}\n`;
            t.block = true;
            t.map = layoutAt >= 0 ? group[layoutAt].map : group[at[0]].map;
            if (layoutAt >= 0) group[layoutAt] = t;
            else group.splice(at[0], 0, t);
          }
          pushHr();
          out.push(...group);
          continue;
        }
      }
      // A slide takes two panes; a third marker folds into the second, as the carve does.
      const cut = at.slice(0, 2);
      const layoutTok = group.find(isLayout);
      const syntax = Boolean(layoutTok && spec.readLayout(layoutTok.content).heads);
      // The slide's spot directives — wherever the author wrote them, before the first marker
      // or inside a pane — belong to the whole slide, so every page carries them. The last
      // `_class` wins, as on one slide, and a component class in it is dropped: each page's
      // component is its pane's, never one written for the whole slide.
      const isSpot = (t) => t.type === 'html_block' && t.level === 0 && SPOT_DIRECTIVE_RE.test(t.content.trim());
      const spots = group.filter(isSpot);
      const classSpot = spots.map((t) => t.content.trim().match(SPOT_CLASS_RE)).filter(Boolean).pop();
      const extra = classSpot ? classSpot[1].split(/\s+/).filter((c) => c && !isComponentToken(c)).join(' ') : '';
      const otherSpots = spots.filter((t) => !SPOT_CLASS_RE.test(t.content.trim()));
      const lead = group.slice(0, cut[0]).filter((t) => !isLayout(t) && !isSpot(t));
      cut.forEach((start, k) => {
        pushHr();
        const marker = spec.readMarker(group[start].content);
        const cls = [marker.cls, ...marker.modifiers].join(' ');
        for (const t of otherSpots) out.push(cloneToken(state, t));
        const d = new state.Token('html_block', '', 0);
        d.content = `<!-- _class: ${extra ? `${cls} ${extra}` : cls} -->\n`;
        d.block = true;
        out.push(d);
        for (const t of lead) {
          const isComment = t.type === 'html_block' && /^\s*<!--/.test(t.content);
          // A speaker note (any other comment) stays with the first page.
          if (k > 0 && isComment) continue;
          out.push(k > 0 ? cloneToken(state, t) : t);
        }
        const end = k + 1 < cut.length ? cut[k + 1] : group.length;
        const body = group.slice(start + 1, end).filter((t) => !isLayout(t) && !isSpot(t) && !isMarker(t));
        // Only a slide in the pane syntax has heads (`layoutComment`); the alias's `###` stays body.
        const heads = syntax && !spec.ownsHeadings(PANE_CATALOG, marker.cls);
        out.push(...(heads ? headBlock(state, body, marker.mods.includes('no-title')) : body));
      });
    }
    state.tokens = out;
  });
}

/**
 * The markdown-it core rule. Pane specs land on `state.env.latticePanes` as
 * { slot, section, layout, warnings, chrome, panes: [{ index, cls, authored, markdown, claimed }] };
 * the engine renders them after the host's transforms and `embed()` places them.
 *
 * It runs RIGHT AFTER the slide containers exist and BEFORE every component body rule
 * (glossary tables, checklist states, matrix cells, table row labels, badges …). Those key on
 * the slide's class, so run first they rewrote a panes slide whose author also wrote a
 * `_class: glossary` — a letter-range pill on the slide title, and the pane's own entries
 * cut. The host loses its component class here, so none of them fire on it. The deck-class
 * rule runs later, and can hand a deck-wide component class back; the second rule below
 * takes it off again, before the default-component rule, so the host never gains `content`.
 */
function installPanes(md) {
  md.core.ruler.after('lattice_slide_containers', 'lattice_panes', (state) => {
    if (state.inlineMode || !spec.mayHavePanes(state.src)) return;
    const lines = state.src.split('\n');
    const nonce = nonceOf(state.src);
    const tokens = state.tokens;
    const out = [];
    let section = -1;
    let i = 0;
    while (i < tokens.length) {
      const open = tokens[i];
      if (open.type !== 'lattice_slide_open') {
        out.push(open);
        i++;
        continue;
      }
      section++;
      let close = i + 1;
      while (close < tokens.length && tokens[close].type !== 'lattice_slide_close') close++;
      const carved = carveSlide(tokens, i + 1, close, lines, section, nonce, state.env);
      if (carved) {
        // A per-slide `_class: cards-*` names where a card row or list puts its spare height.
        // It lands on the HOST, which is no card component, so each pane's own render takes it
        // (lib/engine/index.js `renderPane`) and resolves it as that slide would.
        const cards = (open.attrGet('class') || '').split(/\s+/).find((c) => CARDS_TOKENS.includes(c));
        if (cards) for (const p of state.env.latticePanes[state.env.latticePanes.length - 1].panes) p.cards = cards;
        markHost(open);
      }
      out.push(open, ...(carved || tokens.slice(i + 1, close)));
      if (close < tokens.length) out.push(tokens[close]);
      i = close + 1;
    }
    state.tokens = out;
  });
  md.core.ruler.before('lattice_default_component', 'lattice_panes_host', (state) => {
    if (state.inlineMode || !state.env.latticePanes) return;
    for (const t of state.tokens) {
      if (t.type === 'lattice_slide_open' && (t.attrGet('class') || '').split(/\s+/).includes(HOST_CLASS)) markHost(t);
    }
  });
}

/** Walk `<div>` open/close tags from `start` and return the index just past its match.
 *  Comments are skipped and a self-closing `<div/>` opens nothing. */
function matchDiv(html, start) {
  // Comments end at a cursor rather than a `<!--[\s\S]*?-->` arm, which rescans to the end
  // from every unclosed `<!--` (lib/core/closed-comments.js). Unclosed, it is text.
  const re = /<!--|<\/?div\b[^>]*>/g;
  const commentEnd = commentCloser(html);
  re.lastIndex = start;
  let depth = 0;
  let m = re.exec(html);
  while (m) {
    const tag = m[0];
    if (tag === '<!--') {
      const end = commentEnd(m.index);
      re.lastIndex = end < 0 ? m.index + 1 : end;
    } else if (!tag.endsWith('/>')) {
      depth += tag[1] === '/' ? -1 : 1;
      if (depth === 0) return re.lastIndex;
    }
    m = re.exec(html);
  }
  return -1;
}

/** Remove a `.cell-masthead` div from a pane: the host slide owns the only masthead. A pane is
 *  rendered with no heading (a chart pane's wrap runs headless, chart-family.dispatch.js
 *  `extractChartBody`), so this is a guard rather than a routine step. A paragraph a masthead
 *  lifted (a pill the pane opened with) is the pane's CONTENT: it comes back at the head of the
 *  body instead of leaving with the masthead. */
function dropMasthead(html) {
  const start = html.search(/<div class="cell-masthead[^"]*"/);
  if (start < 0) return html;
  const end = matchDiv(html, start);
  if (end < 0) return html;
  const kept = (html.slice(start, end).match(/<p\b[\s\S]*?<\/p>/g) || []).join('');
  const rest = html.slice(0, start) + html.slice(end);
  if (!kept) return rest;
  const stage = rest.match(/<div class="cell-stage[^"]*">/);
  return stage ? rest.replace(stage[0], () => stage[0] + kept) : kept + rest;
}

/** Pull a rendered pane section's class list, stamps and body. */
function paneParts(sectionHtml) {
  const open = sectionHtml.match(/<section\b([^>]*)>/);
  const attrs = open ? open[1] : '';
  // `(?:^|\s)` so `class=` never matches inside `data-class=`.
  const attr = (name) => (attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`)) || [undefined, ''])[1];
  const openEnd = open ? sectionHtml.indexOf(open[0]) + open[0].length : 0;
  const close = sectionHtml.lastIndexOf('</section>');
  const inner = sectionHtml.slice(openEnd, close < 0 ? undefined : close);
  return {
    cls: attr('class'), fam: attr('data-family'), ori: attr('data-orientation'),
    cards: attr('data-cards'), cardsCoda: attr('data-cards-coda'), off: attr('data-lattice-off'), body: dropMasthead(inner),
  };
}

/** A pane head's markup, through the HOST parser's inline rules, so a title reads as the slide's
 *  own headings do: `<p><code>eyebrow</code></p><h3>title</h3><p><code>subtitle</code></p>`. */
function paneHeadHtml(md, head) {
  if (!head) return '';
  const para = (src) => (src === null ? '' : `<p>${md.renderInline(src)}</p>`);
  // One label: the eyebrow pill, rendered by the host's inline rules, then the title.
  const eyebrow = head.eyebrow === null ? '' : `${spec.labelOf(md.renderInline(head.eyebrow))}${spec.LABEL_SEP}`;
  return `<h3>${eyebrow}${md.renderInline(head.title)}</h3>${para(head.subtitle)}`;
}

/** Replace each placeholder with its two rendered `<lat-pane>` elements. */
function embed(html, carved) {
  const bySlot = new Map(carved.map((c) => [c.slot, c]));
  return html.replace(
    /<div class="lat-panes" data-panes="(\w+)"( data-rule="none")? data-pane-slot="([\w-]+)" style="([^"]*)"><\/div>/g,
    (whole, dir, noRule, slot, style) => {
      const c = bySlot.get(slot);
      if (!c) return whole;
      bySlot.delete(slot); // each placeholder is filled once
      // A slide whose panes carry no head keeps the markup it always had.
      const headed = c.panes.some((p) => p.head);
      const inner = c.panes.map((p) => {
        const { cls, fam, ori, cards, cardsCoda, off, body } = paneParts(p.html);
        const famAttr = fam ? ` data-family="${fam}"` : '';
        const oriAttr = ori ? ` data-orientation="${ori}"` : '';
        // Where a card row or list puts its spare height (`cards:`), resolved by the pane's own
        // render; lib/forms/cell/pane/pane.css turns it into `--cards-align` on the pane.
        const cardsAttr = (cards ? ` data-cards="${cards}"` : '') + (cardsCoda ? ` data-cards-coda="${cardsCoda}"` : '');
        const attr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        // A plugin the deck's render had off (the chart family's marker, spec/LPM.md §3.3) rides onto
        // the pane, as it is on a slide's own section; absent on every render with nothing off.
        const offAttr = off ? ` data-lattice-off="${attr(off)}"` : '';
        const el = `<lat-pane class="${attr(cls || p.cls)}" data-pane="${attr(p.authored)}"${famAttr}${oriAttr}${cardsAttr}${offAttr}>${body}</lat-pane>`;
        if (!headed) return el;
        // A pane with a head sits in a CELL with it: the head is the pane frame's, a sibling of
        // the `<lat-pane>`, so a component's own `h3` rule (its twin reaches inside the pane)
        // never styles a pane title. `data-head` says whether the cell shows one.
        const head = p.head ? `<div class="lat-pane-head"${p.head.hidden ? ' data-hidden' : ''}>${p.headHtml || ''}</div>` : '';
        const shown = p.head && !p.head.hidden ? ' data-head' : '';
        return `<div class="lat-pane-cell"${shown}>${head}${el}</div>`;
      }).join('');
      // The shared title row lays the two cells out on a grid, whose columns keep the ratio.
      const cols = headed ? `; --pane-cols: minmax(0, ${c.layout.a}fr) minmax(0, ${c.layout.b}fr)` : '';
      return `<div class="lat-panes" data-panes="${dir}"${noRule || ''}${headed ? ' data-heads' : ''} style="${style}${cols}">${inner}</div>`;
    },
  );
}

module.exports = {
  installPanes, installPaneSplit, embed, parseLayout, paneParts, paneForm, paneHeadHtml,
  HOST_CLASS, RATIO_MIN, RATIO_MAX, RATIO_STEP,
};
