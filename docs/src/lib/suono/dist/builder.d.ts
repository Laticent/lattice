import type { Bytes, Sequence, SequenceItemStart, SequenceStateEvent, Stage } from './types';
export interface SequenceBuilder<T> {
    /** The ordered items to play (opaque to Suono). Required. */
    items(items: readonly T[]): this;
    /** Produce one item's audio bytes (your synth / byte source; may return null → skip). Required. */
    produce(fn: (item: T, ctx: {
        signal: AbortSignal;
        index: number;
    }) => Promise<Bytes | null>): this;
    /** Cache/dedup identity for an item. */
    key(fn: (item: T) => string): this;
    /** "Breath" after an item, in ms (`next` = following item or null; `index` = position). */
    gap(fn: (item: T, next: T | null, index: number) => number): this;
    /** How many `produce()` calls to keep in flight (default 3). */
    concurrency(n: number): this;
    /** Max byte-cache entries, FIFO (default 200). */
    cacheLimit(n: number): this;
    /** Per-item synth watchdog in ms (default 20000). */
    produceTimeout(ms: number): this;
    /** Fired at each clip's real start with its measured span + index (→ Cadenza `reader.align`). */
    onItemStart(fn: (e: SequenceItemStart) => void): this;
    /** Lifecycle notifications. */
    onState(fn: (e: SequenceStateEvent) => void): this;
    /** Compile to a Sequence bound to the stage. === `stage.sequence(collectedOptions)`.
     *  Throws if `items` / `produce` were never set (both are required by `SequenceOptions`). */
    build(): Sequence;
    /** `build()` then `play()`; returns the Sequence so the caller can `pause`/`stop`/`warm`. */
    play(): Sequence;
}
/** Open a fluent sequence builder bound to `stage`. Chain the setters then emit — e.g.
 *  `sequence(createStage()).items(sentences).produce(fetchTts).gap(gapFn).onItemStart(align).play()`.
 *  Equivalent to `stage.sequence({ items, produce, … })`; the builder is a proven pass-through. */
export declare function sequence<T>(stage: Stage): SequenceBuilder<T>;
