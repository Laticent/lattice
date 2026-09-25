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
 * Component CSS reaches the pane because the CSS build widens each component rule's
 * root compound from `section` to `:is(section, lat-pane)` (tools/build-css.js).
 * `lat-pane` is a custom element, so `:is(section, lat-pane)` carries exactly the
 * specificity `section` did, and nothing that counts slides (`section`) counts a pane.
 */

const { isComponentToken } = require('./resolve-component');
const CODA_CATALOG = require('../forms/cell/coda/coda-catalog.generated.js');

/** The 25–75 range in 5% steps: past 75/25 the narrow pane is too thin to read. */
const RATIO_MIN = 25;
const RATIO_MAX = 75;
const RATIO_STEP = 5;

/** The class the carve puts on a host section. It names no component, and it keeps
 *  the default `content` off the host, whose descendant rules would reach both panes. */
const HOST_CLASS = 'lat-pane-host';

/** Components that ARE the whole slide — a pane can't host them (sovereign frames). */
const WHOLE_SLIDE = new Set([
  'title', 'divider', 'closing', 'topic', 'premise',
  'split-panel', 'split-compare', 'compare-code', 'scene',
]);

/** Whole-slide components that DO have a pane form: rendered as this component
 *  instead, with lib/forms/cell/pane/pane.css drawing the pane-specific part. */
const PANE_FORM = { image: 'content' };

const PANE_RE = /^<!--\s*pane:\s*([a-z][\w-]*)\s*-->$/;
const PANES_RE = /^<!--\s*panes:\s*([^<>]*?)\s*-->$/;

/**
 * Parse `<!-- panes: … -->`. Returns { direction, a, b, error? }. An invalid ratio
 * falls back to 50/50 and reports why, so the linter can coach the author.
 */
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
  const cls = (open.attrGet('class') || '').split(/\s+/).filter(Boolean)
    .filter((c) => !isComponentToken(c));
  open.attrSet('class', [...cls, HOST_CLASS].join(' '));
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
      layoutSpec = l[1];
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
  const cls = markers.slice(0, 2).map((m) => (WHOLE_SLIDE.has(m.cls) ? 'content' : m.cls));
  for (const m of markers.slice(0, 2)) {
    if (WHOLE_SLIDE.has(m.cls)) warnings.push(`panes: "${m.cls}" is a whole-slide layout and cannot go in a pane; rendered as content`);
  }
  // The trailing coda belongs to the SLIDE — unless pane B's component claims that
  // element for its own anatomy (a quote's attribution, a chart's caption), in which
  // case it stays exactly where the component alone would keep it.
  const claims = new Set(CODA_CATALOG[PANE_FORM[cls[1]] || cls[1]]?.claims || []);
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
 * Runs before the default-component rule, so the host never gains `content`.
 */
function installPanes(md) {
  md.core.ruler.before('lattice_default_component', 'lattice_panes', (state) => {
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

/** Remove the `.cell-masthead` div (the pane's stand-in heading). */
function dropMasthead(html) {
  const start = html.search(/<div class="cell-masthead[^"]*"/);
  if (start < 0) return html.replace(/<h2>​<\/h2>/g, '');
  const end = matchDiv(html, start);
  return end < 0 ? html : html.slice(0, start) + html.slice(end);
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
  installPanes, embed, parseLayout, paneParts,
  WHOLE_SLIDE, PANE_FORM, HOST_CLASS, RATIO_MIN, RATIO_MAX, RATIO_STEP,
};
