import { type LensDef, type LensProjection, type LensRegistry, type LensSlide } from './types';
export interface LensView {
    /** Set the registry — either a parsed `LensRegistry` or the raw front-matter `lenses:` text
     *  (parsed with `parseLensRegistry`). Default: the implicit full-only registry. */
    registry(reg: LensRegistry | string): this;
    /** Set the lens id to project. Default: `full` (the whole deck, the safe default). */
    pick(lensId: string): this;
    /** Reader projection, fail-CLOSED: `{status:'ok',pairs}` or `{status:'unavailable',reason}`.
     *  === `lensEligibility(slides, registry, lensId)`. */
    project(): LensProjection;
    /** The shown slides in author order (author-preview; does NOT enforce approval).
     *  === `lensSlides(slides, registry, lensId)`. */
    slides(): string[];
    /** Each shown slide paired with its ORIGINAL author index. === `lensPairs(…)`. */
    pairs(): LensSlide[];
    /** The original author indices of the shown slides. === `lensIndices(…)`. */
    indices(): number[];
    /** The lenses a reader may actually pick (full + every eligible lens). Ignores `.pick()`.
     *  === `readerLenses(slides, registry)`. */
    pickable(): LensDef[];
    /** The content hash bound at Approve for the current triple. === `approvalHash(…)`. */
    hash(): string;
}
/** Open a fluent read-path view over `slides`. Chain `.registry(…).pick(id)` then a terminal —
 *  e.g. `lens(slides).registry(frontMatter).pick('brief').project()`. Every terminal is the plain
 *  `./project` function applied to the collected triple, so the builder is provably a pass-through
 *  (guarded by builder.test.ts's parity assertions) and adds no new behavior or boundary crossing. */
export declare function lens(slides: string[]): LensView;
