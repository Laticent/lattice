import type { ComponentCatalog, ComponentInfo, LensRegistry, Suggestion } from './types';
/** Propose membership for every registered lens that has a built-in heuristic. Returns the tag WRITES
 *  (diffs from each lens's base) for the review grid — pure, no AI, no persistence. */
export declare function suggestMembership(slides: string[], reg: LensRegistry, catalog: ComponentCatalog): Suggestion[];
/** Build a ComponentCatalog from the shape of `dist/docs/components.json` (an array of entries with
 *  `name`/`bucket`/`function`/`form`) — a host-side convenience; the core stays catalog-injection-only. */
export declare function catalogFromComponents(components: Array<{
    name: string;
} & ComponentInfo>): ComponentCatalog;
