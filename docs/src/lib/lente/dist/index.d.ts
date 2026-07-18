export { sha256Hex } from './hash';
export { approvalHash, lensEligibility, lensIndices, lensPairs, lensSlides, readerLenses } from './project';
export { emitRegistry, emitRegistryDelta, isPristineInherited, parseLensRegistry, upsertLensRegistry } from './registry';
export { catalogFromComponents, suggestMembership } from './suggest';
export { applyTag, parseSlideTags, taggedLensIds } from './tags';
export type { ComponentCatalog, ComponentInfo, Diagnostic, DiagnosticLevel, LensBase, LensDef, LensProjection, LensRegistry, LensSlide, SlideTags, Suggestion, WorkspaceLensConfig, } from './types';
export { FULL_LENS_ID } from './types';
export { rebaseLensTags, unknownLensTokens, validateRegistry } from './validate';
