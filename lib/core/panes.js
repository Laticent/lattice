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
 * Which component may go in a pane, and what it renders AS there, is each manifest's
 * `pane` field, baked into lib/forms/cell/pane/pane-catalog.generated.js. The carve warns
 * and never refuses (the lint posture): an opted-out component renders as `content`.
 */

const { isComponentToken } = require('./resolve-component');
const spec = require('./pane-spec');
const { PANE_RE, PANES_RE, RATIO_MIN, RATIO_MAX, RATIO_STEP, WIDE_MIN, parseLayout } = spec;
const CODA_CATALOG = require('../forms/cell/coda/coda-catalog.generated.js');

/** The class the carve puts on a host section. It names no component, and it keeps
 *  the default `content` off the host, whose descendant rules would reach both panes. */
const HOST_CLASS = 'lat-pane-host';

/** Each component's `pane` manifest field — `fit`, its pane `form`, and `stack: false` (tools/build-stage-catalog.js). */
const PANE_CATALOG = require('../forms/cell/pane/pane-catalog.generated.js');

/** `half` · `wide` · `none`. A component with no row — an installed package — is `half`. */
function paneFit(cls) {
  return spec.specOf(PANE_CATALOG, cls).fit;
}

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
const isComment = (tokens, b) =>
  tokens[b.start].type === 'html_block' && /^\s*<!--[\s\S]*-->\s*$/.test(tokens[b.start].content);

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
    const m = t.content.trim().match(PANE_RE);
    if (m) markers.push({ k, cls: m[1] });
    const l = t.content.trim().match(PANES_RE);
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
  const cls = markers.slice(0, 2).map((m) => (paneFit(m.cls) === 'none' ? 'content' : m.cls));
  markers.slice(0, 2).forEach((m, i) => {
    const w = spec.paneFitWarning(spec.specOf(PANE_CATALOG, m.cls), m.cls, layout, i);
    if (w) warnings.push(w);
  });
  // The trailing coda belongs to the SLIDE — unless pane B's component claims that
  // element for its own anatomy (a quote's attribution, a chart's caption), in which
  // case it stays exactly where the component alone would keep it.
  const codaKey = paneForm(cls[1]);
  const claims = new Set((Object.hasOwn(CODA_CATALOG, codaKey) && CODA_CATALOG[codaKey].claims) || []);
  const coda = [];
  const last = pane[1];
  while (last.length > 1) {
    const b = last[last.length - 1];
    const peel = (isBlockquote(tokens, b) && !claims.has('blockquote'))
      || (isNoteParagraph(tokens, b) && !claims.has('trailing-paragraph'))
      || isComment(tokens, b) || isEmpty(tokens, b);
    if (!peel) break;
    coda.unshift(last.pop());
  }

  const source = (list) => list
    .filter((x) => tokens[x.start].map)
    .map((x) => lines.slice(tokens[x.start].map[0], tokens[x.start].map[1]).join('\n'))
    .join('\n\n');
  if (!env.latticePanes) env.latticePanes = [];
  const slot = `${nonce}-${env.latticePanes.length}`;
  env.latticePanes.push({
    slot, section, layout, warnings,
    panes: markers.slice(0, 2).map((m, index) => ({ index, cls: cls[index], authored: m.cls, markdown: source(pane[index]) })),
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
 * The markdown-it core rule. Pane specs land on `state.env.latticePanes` as
 * { slot, section, layout, warnings, panes: [{ index, cls, authored, markdown }] };
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
    if (state.inlineMode || !state.src.includes('pane:')) return;
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
      if (carved) markHost(open);
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
  const re = /<!--[\s\S]*?-->|<\/?div\b[^>]*>/g;
  re.lastIndex = start;
  let depth = 0;
  let m = re.exec(html);
  while (m) {
    const tag = m[0];
    if (!tag.startsWith('<!--') && !tag.endsWith('/>')) {
      depth += tag[1] === '/' ? -1 : 1;
      if (depth === 0) return re.lastIndex;
    }
    m = re.exec(html);
  }
  return -1;
}

/** Remove the `.cell-masthead` div (the pane's stand-in heading). A paragraph the masthead
 *  lifted beside the heading (a pill the pane opened with) is the pane's CONTENT: it comes
 *  back at the head of the body instead of leaving with the masthead. */
function dropMasthead(html) {
  const start = html.search(/<div class="cell-masthead[^"]*"/);
  if (start < 0) return html.replace(/<h2>​<\/h2>/g, '');
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
  return { cls: attr('class'), fam: attr('data-family'), ori: attr('data-orientation'), body: dropMasthead(inner) };
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
      const inner = c.panes.map((p) => {
        const { cls, fam, ori, body } = paneParts(p.html);
        const famAttr = fam ? ` data-family="${fam}"` : '';
        const oriAttr = ori ? ` data-orientation="${ori}"` : '';
        return `<lat-pane class="${cls || p.cls}" data-pane="${p.authored}"${famAttr}${oriAttr}>${body}</lat-pane>`;
      }).join('');
      return `<div class="lat-panes" data-panes="${dir}"${noRule || ''} style="${style}">${inner}</div>`;
    },
  );
}

module.exports = {
  installPanes, embed, parseLayout, paneParts, paneForm, paneFit,
  WIDE_MIN, HOST_CLASS, RATIO_MIN, RATIO_MAX, RATIO_STEP,
};
