/**
 * Calco — rendered slides to office documents you can edit. A reader turns a laid-out slide
 * into text frames and hides that text for a clean background photo; writers turn the
 * result into an OpenDocument (.odp) or PowerPoint (.pptx) file with real text boxes, or a
 * picture-per-slide file when the text does not need to move. Plain boxes and rules can
 * come out of the picture too, as native shapes grouped with their text (shapes.ts).
 * Design: engineering/decisions/2026-10-06-calco-office-export-library.md.
 */
export type { FaceUse, FontHost, FontMetrics } from './fonts.js';
export { embeddingAllowed, faceFamilyName, faceFor, facesUsed, nearestFace, pinFeatures, prepareFonts, readFontMetrics, uniqueFaceNames } from './fonts.js';
export type { PlacedBox } from './layout.js';
export { applyTransform, placeFrame, spacingMultiple } from './layout.js';
export { buildOdp, ODP_MIMETYPE, odpPageSize, odpZipOptions, writeOdp, xmlEscape } from './odp.js';

export type { EmbeddingPlan, PptxGenJSClass, PptxGenJSLike } from './pptx.js';
export { buildPptx, embedPptxFonts, groupShapes, PPTX_MIMETYPE, planEmbedding, pptxFaceName, pptxPageSize, tidyPptxPackage, writePptx, xmlSafe } from './pptx.js';
export type { ReadOptions, ReadResult } from './reader.js';
export { readSlide, restoreSlide } from './reader.js';
export { canEmbedAsEot, familyNameOf, renameFace, toEot } from './sfnt.js';
export type { Drawn, DrawnGroup, Insets, PathCmd, ShapeGeometry } from './shapes.js';
export { drawOrder, labelInsets, shapeGeometry } from './shapes.js';
export type * from './types.js';
