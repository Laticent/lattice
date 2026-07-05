/**
 * Split-panel family DOM transform — HTML string rewrite for the two layouts
 * in the family: split-panel (featured left panel + supporting right zone) and
 * split-compare (frame + options + verdict). Each extracts a left-panel header
 * and pairs it with right-panel content; the CSS targets the .panel-left /
 * .panel-right wrappers (split-compare uses .compare-left / .compare-right).
 *
 * split-panel carries the variant set that used to be five separate components:
 *   default     — featured heading + findings list (was split-brief)
 *   .metric     — light-left polarity, hero-number feature (was split-metric)
 *   .pullquote  — pull-quote feature (was split-statement)
 *   .steps      — numbered step-timeline right zone (was split-steps)
 *   .watermark  — accent panel + letterform watermark + meta footer (was split-list)
 * The DOM these emit is one shape (panel-left / panel-right); the variant CSS
 * supplies the distinct finish. See engineering/decisions/2026-06-07-split-
 * family-analysis.md.
 *
 * Runs in the engine render path so the preview
 * preview and the export pipeline see identical DOM without a runtime <script>.
 *
 * Sibling implementations:
 *   - lattice-emulator.js — post-process per-slide transform
 *   - lattice-runtime.js  — DOM fallback for web export
 */

const { parseTopLevelLis, extractFirstList } = require('./html-lists');
const { mapSections } = require('./section-walk');
const { liftSlotLabel } = require('./slot-label-lift');

const SPLIT_LAYOUTS = ['split-panel', 'split-compare'];

// split-panel variant tokens that change the left-feature assembly. Right-zone
// differences (findings vs numbered steps) are pure CSS, keyed on the variant.
const PANEL_VARIANTS = ['metric', 'pullquote', 'steps', 'watermark'];

// Idempotent: lifts each top-level <li> of the first <ul>/<ol> in `html`
// via liftSlotLabel. Used by the right-panel rebuild paths so the engine
// works whether or not the slotLabelLift Marpit plugin has already run —
// the emulator and runtime contexts skip that plugin.
function liftFirstListItems(html) {
  const listResult = extractFirstList(html);
  if (!listResult) return html;
  const openTagEnd = html.indexOf('>', listResult.start) + 1;
  const openTag    = html.slice(listResult.start, openTagEnd);
  const closeTag   = html[listResult.start + 1] === 'o' ? '</ol>' : '</ul>';
  const items      = parseTopLevelLis(listResult.inner);
  const lifted     = items.map(item => `<li>${liftSlotLabel(item)}</li>`).join('');
  return html.slice(0, listResult.start) + openTag + lifted + closeTag + html.slice(listResult.end);
}

// ---------------------------------------------------------------------------
// Primitive extractors — each removes the first matching element from html
// and returns { matched, html }.
// ---------------------------------------------------------------------------

function extractHeader(html) {
  const m = html.match(/^(\s*<header[^>]*>[\s\S]*?<\/header>\s*)/);
  return m ? { matched: m[1], html: html.slice(m[0].length) } : { matched: '', html };
}

function extractCodeP(html) {
  let codeText = '';
  const out = html.replace(/<p[^>]*>\s*<code[^>]*>([^<]+)<\/code>\s*<\/p>/, (_m, t) => {
    codeText = t;
    return '';
  });
  return { codeText, html: out };
}

function extractH2(html) {
  let el = '';
  const out = html.replace(/<h2[^>]*>[\s\S]*?<\/h2>/, (m) => { el = m; return ''; });
  return { el, html: out };
}

function extractFirstP(html) {
  let el = '';
  const out = html.replace(/<p[^>]*>[\s\S]*?<\/p>/, (m) => { el = m; return ''; });
  return { el, html: out };
}

function extractFirstBlockquote(html) {
  let el = '';
  const out = html.replace(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/, (m) => { el = m; return ''; });
  return { el, html: out };
}

// ---------------------------------------------------------------------------
// split-panel — one transform, three left-assembly modes; the right zone is
// always the lifted list. The variant CSS supplies the per-variant finish.
// ---------------------------------------------------------------------------

function applyPanel(inner, variant) {
  if (inner.includes('class="panel-left"')) return inner;
  const { matched: header, html: r0 } = extractHeader(inner);

  let leftInner;
  let rest;

  if (variant === 'pullquote') {
    // pull-quote feature: blockquote + optional inline-code cite.
    const { el: bq,       html: r1 } = extractFirstBlockquote(r0);
    const { codeText,     html: r2 } = extractCodeP(r1);
    const cite = codeText ? `<cite>${codeText}</cite>` : '';
    leftInner = `${bq}${cite}`;
    rest = r2;
  } else if (variant === 'watermark') {
    // accent panel: first-letter watermark glyph + code-eyebrow + h5 + h2;
    // everything after goes to the right panel.
    const h2Match    = r0.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    const h5Match    = r0.match(/<h5[^>]*>[\s\S]*?<\/h5>/);
    const codePMatch = r0.match(/<p[^>]*>\s*<code[^>]*>[^<]+<\/code>\s*<\/p>/);
    const h2    = h2Match ? h2Match[0] : '';
    const h5    = h5Match ? h5Match[0] : '';
    const codeP = codePMatch ? codePMatch[0] : '';
    const h2Text = h2Match ? h2Match[1].replace(/<[^>]+>/g, '').trim() : '';
    const watermarkLetter = h2Text ? h2Text[0] : 'S';
    let rr = r0;
    if (h2)    rr = rr.replace(h2,    '');
    if (h5)    rr = rr.replace(h5,    '');
    if (codeP) rr = rr.replace(codeP, '');
    leftInner = `<div class="watermark">${watermarkLetter}</div>${codeP}${h5}${h2}`;
    rest = rr;
  } else {
    // default (heading) + metric (hero number) + steps (phase) all share this
    // shape: code-eyebrow + h2 + lede paragraph. The variant CSS restyles the
    // h2 (number vs heading) and the eyebrow (phase watermark vs mono label).
    const { codeText, html: r1 } = extractCodeP(r0);
    const { el: h2,   html: r2 } = extractH2(r1);
    const { el: introP, html: r3 } = extractFirstP(r2);
    const eyebrow = codeText ? `<span class="panel-eyebrow">${codeText}</span>` : '';
    leftInner = `${eyebrow}${h2}${introP}`;
    rest = r3;
  }

  return header +
    `<div class="panel-left">${leftInner}</div>` +
    `<div class="panel-right">${liftFirstListItems(rest.trim())}</div>`;
}

// ---------------------------------------------------------------------------
// split-compare — the one structurally-distinct member: frame + heading +
// context on the left; a 2-option grid + a verdict card on the right.
// ---------------------------------------------------------------------------

function applyCompare(inner) {
  if (inner.includes('class="compare-left"')) return inner;
  const { matched: header, html: r0 } = extractHeader(inner);
  const { codeText, html: r1 }        = extractCodeP(r0);
  const { el: h2,   html: r2 }        = extractH2(r1);
  const { el: introP, html: r3 }      = extractFirstP(r2);
  const { el: bq,   html: r4 }        = extractFirstBlockquote(r3);
  const frameLabel = codeText ? `<span class="frame-label">${codeText}</span>` : '';

  let optionDivs = '';
  const listResult = extractFirstList(r4);
  if (listResult) {
    const items = parseTopLevelLis(listResult.inner);
    optionDivs = items.map((item, i) => {
      const cls = i === 1 ? 'option preferred' : 'option';
      return `<div class="${cls}">${liftSlotLabel(item)}</div>`;
    }).join('');
  }

  const verdictHtml = bq ? `<div class="verdict">${bq}</div>` : '';
  return header +
    `<div class="compare-left">${frameLabel}${h2}${introP}</div>` +
    `<div class="compare-right"><div class="options">${optionDivs}</div>${verdictHtml}</div>`;
}

// ---------------------------------------------------------------------------
// Section dispatcher
// ---------------------------------------------------------------------------

function transformSplitSection(innerHtml, cls) {
  const tokens = cls.trim().split(/\s+/);
  if (tokens.includes('split-compare')) return applyCompare(innerHtml);
  if (tokens.includes('split-panel')) {
    const variant = PANEL_VARIANTS.find(v => tokens.includes(v)) || '';
    return applyPanel(innerHtml, variant);
  }
  return innerHtml;
}

/**
 * Walk every `<section>` in Marpit's rendered HTML output and rewrite
 * split-* family slides in place. Non-split sections pass through unchanged.
 */
function applyToRenderedHtml(html) {
  return mapSections(html, (_openTag, cls, inner) => {
    const isSplit = SPLIT_LAYOUTS.some(l => cls.trim().split(/\s+/).includes(l));
    return isSplit ? transformSplitSection(inner, cls) : null;
  });
}

module.exports = {
  SPLIT_LAYOUTS,
  PANEL_VARIANTS,
  applyToRenderedHtml,
  // Exposed for unit tests
  transformSplitSection,
  applyPanel,
  applyCompare,
};
