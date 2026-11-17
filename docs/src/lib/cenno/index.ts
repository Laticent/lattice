// Cenno — a small sign that appears beside a thing and points to it. See README.md.
//
// The core imports nothing outside this folder and has no dependencies: geometry (place.ts),
// measuring the page (measure.ts), the card lifecycle and layer (cenno.ts), interaction (intent.ts),
// the optional card anatomy (card.ts) and the stylesheet (styles.ts).

export type { CardPart, CardParts } from './card.js';
export { buildCard, CARD_PARTS, markPart } from './card.js';
export type { Cenno, CennoCard, CennoOptions, Content, OpenOptions } from './cenno.js';
export { createCenno } from './cenno.js';
export type { AttachOptions, Intent } from './intent.js';
export { attach } from './intent.js';
export type { Anchor, AnchorRect } from './measure.js';
export { anchorRect, pinchScale, viewBounds, visiblePart } from './measure.js';
export type { Align, Placement, PlaceOptions, Rect, Side } from './place.js';
export { intersects, place } from './place.js';
export { CENNO_CSS } from './styles.js';
