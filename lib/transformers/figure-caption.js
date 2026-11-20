/**
 * lib/transformers/figure-caption.js — a figure layout's note becomes its CAPTION. Registered right after
 * mastheadLift, which builds the `.cell-stage` it moves into (lib/transformers/registry.js).
 *
 * The owner settled it (engineering/decisions/2026-11-20-coda-and-marp-parity.md, settled 2): on a layout whose
 * body is one figure, the coda's paragraph beat (a below-note or an annotation) IS the figure's caption, drawn
 * inside the figure's stage, while the key insight stays the slide's panel in the band below. The layout declares
 * it with `coda: { caption: true }` in its manifest.
 *
 * Charts do this in their own transform (lib/transformers/chart-frame.js `noteToCaption`), because a chart's caption
 * and legend reads were already written against the trailing paragraph. Every other `caption` layout (`diagram`,
 * `video`) comes here: AFTER the masthead lift has built `.cell-stage`, this moves the `.below-note` out of the
 * `.cell-coda` band to the end of the stage, as `<p class="figure-caption">`, and drops the band if that empties it.
 *
 * The coda kernel still harvests the paragraph first (lib/core/coda.js), so the published contract
 * (`authoring.blocks`), the deck lint and a split slide all see an ordinary below-note; only where it is drawn moves.
 * Both arms answer the same way (HARD RULE #1). Idempotent: a section with no note in its band is left alone.
 */

const { mapSections } = require('@laticent/markup');
const { topLevelElements, tagHasClass, CODA_CLASS } = require('../core/coda');

const CATALOG = require('../forms/cell/coda/coda-catalog.generated.js');

const CAPTION_CLASS = 'figure-caption';

/** Does this class list name a layout whose note is its figure caption (and that is not a chart, which captions itself)? */
function captionsFigure(cls) {
  const tokens = String(cls || '').trim().split(/\s+/);
  if (tokens.includes('chart-frame')) return false;
  return tokens.some((t) => Object.hasOwn(CATALOG, t) && CATALOG[t].caption === true);
}

const openTagOf = (html, el) => html.slice(el.start, html.indexOf('>', el.start) + 1);

/** The `<p>` inside a `.below-note` wrapper, re-classed as the caption; the annotation register rides along. */
function captionFrom(wrapHtml) {
  const open = wrapHtml.slice(0, wrapHtml.indexOf('>') + 1);
  const inner = wrapHtml.slice(open.length, wrapHtml.lastIndexOf('</div>'));
  const annotation = tagHasClass(open, 'is-annotation');
  const pOpen = inner.indexOf('<p');
  if (pOpen === -1) return null;
  const body = inner.slice(inner.indexOf('>', pOpen) + 1, inner.lastIndexOf('</p>'));
  return `<p class="${CAPTION_CLASS}${annotation ? ' is-annotation' : ''}">${body}</p>`;
}

/** The HTML-string arm: one section body. */
function moveInBody(inner) {
  const els = topLevelElements(inner);
  const stage = els.find((el) => el.tag === 'div' && tagHasClass(openTagOf(inner, el), 'cell-stage'));
  const cell = els.find((el) => el.tag === 'div' && tagHasClass(openTagOf(inner, el), CODA_CLASS));
  if (!stage || !cell) return inner;
  const cellHtml = inner.slice(cell.start, cell.end);
  const cellOpen = openTagOf(cellHtml, { start: 0 });
  const cellInner = cellHtml.slice(cellOpen.length, cellHtml.lastIndexOf('</div>'));
  const note = topLevelElements(cellInner).find((el) => el.tag === 'div' && tagHasClass(openTagOf(cellInner, el), 'below-note'));
  if (!note) return inner;
  const caption = captionFrom(cellInner.slice(note.start, note.end));
  if (!caption) return inner;
  const left = (cellInner.slice(0, note.start) + cellInner.slice(note.end)).trim();
  const newCell = left ? cellOpen + left + '</div>' : '';
  const stageClose = stage.end - '</div>'.length;
  // The stage comes before the band, so cut the band first and the stage offsets stay valid.
  const withoutCell = inner.slice(0, cell.start) + newCell + inner.slice(cell.end);
  return withoutCell.slice(0, stageClose) + caption + withoutCell.slice(stageClose);
}

function applyToHtml(html) {
  if (typeof html !== 'string' || html.indexOf(CODA_CLASS) === -1) return html;
  return mapSections(html, (_openTag, cls, inner) => (captionsFigure(cls) ? moveInBody(inner) : inner));
}

/** The live-DOM arm (the browser runtime, the VS Code preview). */
function applyToDom(root) {
  const doc = root?.ownerDocument ? root.ownerDocument : root;
  const scope = root && typeof root.querySelectorAll === 'function' ? root : doc;
  if (!scope || typeof scope.querySelectorAll !== 'function') return;
  for (const section of scope.querySelectorAll('section:not(section section)')) {
    if (!captionsFigure(section.className)) continue;
    const stage = section.querySelector(':scope > .cell-stage');
    const cell = section.querySelector(`:scope > .${CODA_CLASS}`);
    const note = cell?.querySelector(':scope > .below-note');
    const para = note?.querySelector(':scope > p');
    if (!stage || !para) continue;
    const caption = doc.createElement('p');
    caption.className = note.classList.contains('is-annotation') ? `${CAPTION_CLASS} is-annotation` : CAPTION_CLASS;
    while (para.firstChild) caption.appendChild(para.firstChild);
    stage.appendChild(caption);
    note.remove();
    if (!cell.children.length) cell.remove();
  }
}

module.exports = {
  name: 'figure-caption',
  selector: 'section',
  CAPTION_CLASS,
  captionsFigure,
  moveInBody,
  applyToHtml,
  applyToDom,
};
