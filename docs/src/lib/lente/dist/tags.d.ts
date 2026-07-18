import type { LensBase, SlideTags } from './types';
/** Char ranges [start, end) of fenced code blocks (``` or ~~~), so a `_lens`/`_class` example
 *  DOCUMENTED inside a fence is not mistaken for a real directive. Handles CRLF and an unterminated
 *  fence (runs to EOF). */
export declare function fenceRanges(src: string): Array<[number, number]>;
/** Find the first `<!-- _<key>: … -->` HTML comment OUTSIDE any fenced code block, by plain string
 *  scanning. Only whitespace may precede the marker inside the comment. Returns the comment's span and
 *  its `body` (text between the marker and `-->`), or null. */
export declare function findDirectiveComment(src: string, key: 'lens' | 'class', ranges?: Array<[number, number]>): {
    start: number;
    end: number;
    body: string;
} | null;
/** Every non-fenced `<!-- _<key>: … -->` body in document order. */
export declare function allDirectiveBodies(src: string, key: 'lens' | 'class'): string[];
/** Parse the include/exclude tokens off a slide's first non-fenced `_lens` comment. `id`/`+id`
 *  include; `-id` exclude. A `_lens` shown inside a code fence (documentation) is ignored. */
export declare function parseSlideTags(slideSrc: string): SlideTags;
/** The set of lens ids the deck has AUTHORED a membership tag for — any include (`+id`) or exclude
 *  (`-id`) token across all slides. This is "the author has ACTED on this view," which is distinct from
 *  a view merely HAVING members (a `base:all` view has every slide as a member with no tags at all). The
 *  Studio uses it to MATERIALIZE an inherited view once the author tags into it — so that in-progress
 *  membership survives the workspace default-views setting being turned off — and to clear its "Starter"
 *  badge once it's been worked on. */
export declare function taggedLensIds(slides: string[]): Set<string>;
/** Set (or clear) this slide's membership in one lens, emitting the SHORTEST correct tag for the
 *  lens's base: a `base:none` lens carries an include token only when a member; a `base:all` lens
 *  carries a `-id` exclude token only when NOT a member. Pure — returns new slide source. */
export declare function applyTag(slideSrc: string, lensId: string, member: boolean, base: LensBase): string;
