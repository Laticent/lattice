/**
 * Calco — rendered slides to office documents you can edit. A reader turns a laid-out slide
 * into text frames and hides that text for a clean background photo; writers turn the
 * result into an OpenDocument (.odp) or PowerPoint (.pptx) file with real text boxes, or a
 * picture-per-slide file when the text does not need to move.
 * Design: engineering/decisions/2026-10-06-calco-office-export-library.md.
 */
export type { FaceUse, FontHost, FontMetrics } from './fonts';
export { embeddingAllowed, faceFamilyName, faceFor, facesUsed, nearestFace, pinFeatures, prepareFonts, readFontMetrics, uniqueFaceNames } from './fonts';
export type { PlacedBox } from './layout';
export { applyTransform, placeFrame, spacingMultiple } from './layout';
export { buildOdp, ODP_MIMETYPE, odpPageSize, odpZipOptions, writeOdp, xmlEscape } from './odp';

export type { EmbeddingPlan, PptxGenJSClass, PptxGenJSLike } from './pptx';
export { buildPptx, embedPptxFonts, PPTX_MIMETYPE, planEmbedding, pptxFaceName, pptxPageSize, writePptx } from './pptx';
export type { ReadOptions, ReadResult } from './reader';
export { readSlide, restoreSlide } from './reader';
export { canEmbedAsEot, familyNameOf, renameFace, toEot } from './sfnt';
export type * from './types';
