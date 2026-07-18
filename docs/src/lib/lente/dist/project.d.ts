import { type LensDef, type LensProjection, type LensRegistry, type LensSlide } from './types';
/** The ordered slide subset for a lens, each paired with its original author index. A PREDICATE FILTER
 *  over the author-ordered array — so pairs are unique and monotonic in `index`, and number-keyed
 *  captions stay correct even under reordering (the invariant locked in ./project.test.ts). An unknown
 *  lens id, or `full`, returns the whole deck. Does NOT enforce approval — that is the reader path
 *  below; this is the author-preview / internal projection. Always non-empty inputs => valid output. */
export declare function lensPairs(slides: string[], reg: LensRegistry, lensId: string): LensSlide[];
export declare function lensSlides(slides: string[], reg: LensRegistry, lensId: string): string[];
export declare function lensIndices(slides: string[], reg: LensRegistry, lensId: string): number[];
/** The content hash bound at Approve. Covers the lens's RESOLVED membership + the member slide bodies +
 *  the base — i.e. exactly what a reader would see. Any later edit, reorder, or hand-forgery changes
 *  the digest, so the lens de-approves itself at read (§6.2). Deliberately does NOT bind the component
 *  catalog version: a reader's tag-driven view must stay stable across reclassification (§4). */
export declare function approvalHash(slides: string[], reg: LensRegistry, lensId: string): string;
/** Reader-eligibility. `full` is always eligible; any other lens must carry an `approved` hash that
 *  MATCHES the current content, must not be hidden, and must have at least one member. Returns the
 *  precise reason when ineligible so the reader UI can fail CLOSED and visibly (never silent-to-full). */
export declare function lensEligibility(slides: string[], reg: LensRegistry, lensId: string): LensProjection;
/** The lenses a READER may actually pick: `full`, plus every lens that is eligible right now. */
export declare function readerLenses(slides: string[], reg: LensRegistry): LensDef[];
