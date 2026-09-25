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
 *     > The slide's Key Insight — always the HOST's, never pane 2's.
 *
 * How it renders (engineering/decisions/2026-09-25-panes-two-components-one-slide.md):
 *
 *   1. `extract()` (here) carves each marked slide: the host keeps everything
 *      before the first marker plus the trailing coda run (blockquote / below-note /
 *      comments), and the pane region becomes one placeholder element.
 *   2. The engine renders each pane's markdown AS AN ORDINARY ONE-SLIDE DECK of its
 *      component, through a parser built for the PANE's box — so every transform sees
 *      a normal whole section, and `data-family` / `data-orientation` describe the pane.
 *   3. `embed()` (here) lifts that section's `.cell-stage` into a `<lat-pane>` element
 *      carrying the pane's class list and stamps, and drops it into the placeholder.
 *
 * Component CSS reaches the pane because the CSS build widens each component rule's
 * root compound from `section` to `:is(section, lat-pane)` (tools/build-css.js).
 * `lat-pane` is a custom element, so `:is(section, lat-pane)` carries exactly the
 * specificity `section` did, and nothing that counts slides (`section`) counts a pane.
 */


/** The 25–75 range in 5% steps: past 75/25 the narrow pane is too thin to read. */
const RATIO_MIN = 25;
const RATIO_MAX = 75;
const RATIO_STEP = 5;

/** Components that ARE the whole slide — a pane can't host them (sovereign frames). */
const WHOLE_SLIDE = new Set([
  'title', 'divider', 'closing', 'topic', 'premise',
  'split-panel', 'split-compare', 'compare-code', 'scene',
]);

/** Whole-slide components that DO have a pane form: rendered as this component
 *  instead, with lib/forms/cell/pane/pane.css drawing the pane-specific part. */
const PANE_FORM = { image: 'content' };

const PANE_RE = /^<!--\s*pane:\s*([a-z][\w-]*)\s*-->\s*$/;
const PANES_RE = /^<!--\s*panes:\s*(.*?)\s*-->\s*$/;
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;
const HR_RE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;

/**
 * Parse `<!-- panes: … -->`. Returns { direction, a, b, error? }. An invalid ratio
 * falls back to 50/50 and reports why, so the linter can coach the author.
 */
function parseLayout(spec) {
  const out = { direction: 'side', a: 50, b: 50 };
  if (!spec) return out;
  for (const word of spec.split(/\s+/)) {
    if (word === 'stack' || word === 'side') out.direction = word;
    else if (/^\d+\/\d+$/.test(word)) {
      const [a, b] = word.split('/').map(Number);
      const ok = a + b === 100 && a >= RATIO_MIN && a <= RATIO_MAX && a % RATIO_STEP === 0;
      if (ok) Object.assign(out, { a, b });
      else out.error = `panes ratio ${word}: use ${RATIO_STEP}% steps from ${RATIO_MIN}/${RATIO_MAX} to ${RATIO_MAX}/${RATIO_MIN}`;
    }
  }
  return out;
}

/** Split `body` into slide chunks on top-level thematic breaks, fence-aware. */
function splitSlides(lines) {
  const chunks = [[]];
  const breaks = [];
  let fence = null;
  lines.forEach((line, i) => {
    const f = line.match(FENCE_RE);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
    }
    // A `---` right under a paragraph line is a setext heading, not a slide break.
    const prevBlank = i === 0 || lines[i - 1].trim() === '';
    if (!fence && HR_RE.test(line) && prevBlank) {
      breaks.push(line);
      chunks.push([]);
      return;
    }
    chunks[chunks.length - 1].push(line);
  });
  return { chunks, breaks };
}

/** Group lines into blank-line-separated blocks (fence-aware). */
function blocks(lines) {
  const out = [];
  let cur = [];
  let fence = null;
  for (const line of lines) {
    const f = line.match(FENCE_RE);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
    }
    if (!fence && line.trim() === '') {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push(line);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Is this block part of the slide's trailing coda (Key Insight, below-note, comment)? */
function isCodaBlock(block) {
  if (block.every((l) => /^\s{0,3}>/.test(l))) return true;             // Key Insight
  if (/^\s*—\s/.test(block[0])) return true;                              // below-note
  if (block.every((l) => /^\s*<!--[\s\S]*-->\s*$/.test(l))) return true;  // notes/directives
  return false;
}

/**
 * Carve every slide that carries `<!-- pane: X -->` markers.
 * Returns { body, panes: [{ slot, cls, markdown }], layouts: [{ slot, direction, a, b, error? }] }.
 * A body without markers comes back unchanged (same string).
 */
function extract(body) {
  if (!/<!--\s*pane:/.test(body)) return { body, panes: [], layouts: [] };
  const { chunks, breaks } = splitSlides(body.split('\n'));
  const panes = [];
  const layouts = [];
  let slot = 0;
  const outChunks = chunks.map((lines) => {
    const markers = [];
    let fence = null;
    let layoutSpec = null;
    lines.forEach((line, i) => {
      const f = line.match(FENCE_RE);
      if (f) {
        if (!fence) fence = f[1][0];
        else if (f[1][0] === fence) fence = null;
      }
      if (fence) return;
      const m = line.match(PANE_RE);
      if (m) markers.push({ i, cls: m[1] });
      const l = line.match(PANES_RE);
      if (l) { layoutSpec = l[1]; lines[i] = ''; }
    });
    if (markers.length < 2) return lines.join('\n');
    // v1 is TWO panes; extra markers fold into the second pane's markdown untouched.
    const [first, second] = markers;
    const host = lines.slice(0, first.i);
    const paneA = lines.slice(first.i + 1, second.i);
    let paneB = lines.slice(second.i + 1);
    // The trailing coda run belongs to the HOST: peel blocks off the end of pane B.
    const bBlocks = blocks(paneB);
    const coda = [];
    while (bBlocks.length > 1 && isCodaBlock(bBlocks[bBlocks.length - 1])) coda.unshift(bBlocks.pop());
    paneB = bBlocks.map((b) => b.join('\n'));
    const layout = parseLayout(layoutSpec);
    const s = slot++;
    layouts.push({ slot: s, ...layout });
    panes.push({ slot: s, index: 0, cls: first.cls, markdown: paneA.join('\n') });
    panes.push({ slot: s, index: 1, cls: second.cls, markdown: paneB.join('\n\n') });
    // Mark the host as a panes slide: join onto an authored `_class`, or add one.
    const classAt = host.findIndex((l) => /^<!--\s*_class:/.test(l));
    if (classAt >= 0) host[classAt] = host[classAt].replace(/-->\s*$/, ' panes -->');
    else host.unshift('<!-- _class: panes -->');
    const placeholder =
      `<div class="lat-panes" data-panes="${layout.direction}" data-pane-slot="${s}"` +
      ` style="--pane-a: ${layout.a}; --pane-b: ${layout.b}"></div>`;
    return [...host, '', placeholder, '', ...coda.map((b) => b.join('\n')).join('\n\n').split('\n')].join('\n');
  });
  let out = outChunks[0];
  // Re-join with a blank line before each break, so it can never read as a setext underline.
  for (let i = 1; i < outChunks.length; i++) out += `\n\n${breaks[i - 1]}\n${outChunks[i]}`;
  return { body: out, panes, layouts };
}

/** Remove the `.cell-masthead` div (the pane's stand-in heading) by depth. */
function dropMasthead(html) {
  const start = html.search(/<div class="cell-masthead[^"]*"/);
  if (start < 0) return html.replace(/<h2>\u200b<\/h2>/g, '');
  const re = /<\/?div\b[^>]*>/g;
  re.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = re.exec(html))) {
    depth += m[0][1] === '/' ? -1 : 1;
    if (depth === 0) return html.slice(0, start) + html.slice(re.lastIndex);
  }
  return html;
}

/** Pull the first `<section …>` open tag's attributes and its `.cell-stage` element. */
function paneParts(sectionHtml) {
  const open = sectionHtml.match(/<section\b([^>]*)>/);
  const attrs = open ? open[1] : '';
  // `(?:^|\s)` so `class=` never matches inside `data-class=`.
  const attr = (name) => (attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`)) || [undefined, ''])[1];
  const cls = attr('class');
  const fam = attr('data-family');
  const ori = attr('data-orientation');
  // The stage is the first `.cell-stage` div; find its matching close by depth.
  const start = sectionHtml.search(/<div class="cell-stage[^"]*"/);
  let stage = '';
  if (start >= 0) {
    const re = /<\/?div\b[^>]*>/g;
    re.lastIndex = start;
    let depth = 0;
    let m;
    while ((m = re.exec(sectionHtml))) {
      depth += m[0][1] === '/' ? -1 : 1;
      if (depth === 0) { stage = sectionHtml.slice(start, re.lastIndex); break; }
    }
  } else {
    // A component that wraps no stage — take the section's inner HTML, minus its
    // masthead (the stand-in heading lives there; the HOST owns the title).
    const openEnd = open ? sectionHtml.indexOf(open[0]) + open[0].length : 0;
    const close = sectionHtml.lastIndexOf('</section>');
    // Its body sits directly under the section (`section.bar > .chart-body`), so it
    // sits directly under the pane: the component's child combinators still land.
    stage = dropMasthead(sectionHtml.slice(openEnd, close < 0 ? undefined : close));
  }
  return { cls, fam, ori, stage };
}

/** Replace each placeholder with its two rendered `<lat-pane>` elements. */
function embed(html, rendered) {
  return html.replace(
    /<div class="lat-panes" data-panes="(\w+)" data-pane-slot="(\d+)" style="([^"]*)"><\/div>/g,
    (whole, dir, slot, style) => {
      const pair = rendered.filter((r) => String(r.slot) === slot).sort((x, y) => x.index - y.index);
      if (pair.length !== 2) return whole;
      const inner = pair.map(({ html: sec, cls: authored }) => {
        const { cls, fam, ori, stage } = paneParts(sec);
        const famAttr = fam ? ` data-family="${fam}"` : '';
        const oriAttr = ori ? ` data-orientation="${ori}"` : '';
        return `<lat-pane class="${cls || authored}" data-pane="${authored}"${famAttr}${oriAttr}>${stage}</lat-pane>`;
      }).join('');
      return `<div class="lat-panes" data-panes="${dir}" style="${style}">${inner}</div>`;
    },
  );
}

module.exports = { extract, embed, parseLayout, WHOLE_SLIDE, PANE_FORM, RATIO_MIN, RATIO_MAX, RATIO_STEP };
