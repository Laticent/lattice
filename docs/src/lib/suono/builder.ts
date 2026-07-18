// Suono — the fluent (THIN) front door. Chain the SequenceOptions setters instead of assembling the
// bag, then `.build()` returns a Sequence bound to the stage (or `.play()` builds and plays it).
//
// This is PURE HOUSE-SYMMETRY, not new capability. Suono is a stateful runtime engine over a live
// AudioContext with no serializable data model — so unlike vetrina's `scene()`, cadenza's
// `narration()`, or lente's `lens()`, there is no isomorphism to anchor; the builder just gives the
// sibling libraries ONE uniform `verb(input).….build()` front door (discoverability + IDE
// autocomplete over the options). `.build()` is defined as `stage.sequence(collectedOptions)` — a
// parity test proves the pass-through. See the design ADR:
// engineering/decisions/2026-07-12-suono-audio-library.md

import type { Bytes, Sequence, SequenceItemStart, SequenceOptions, SequenceStateEvent, Stage } from './types';

export interface SequenceBuilder<T> {
	/** The ordered items to play (opaque to Suono). Required. */
	items(items: readonly T[]): this;
	/** Produce one item's audio bytes (your synth / byte source; may return null → skip). Required. */
	produce(fn: (item: T, ctx: { signal: AbortSignal; index: number }) => Promise<Bytes | null>): this;
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
export function sequence<T>(stage: Stage): SequenceBuilder<T> {
	const opts: Partial<SequenceOptions<T>> = {};

	const b: SequenceBuilder<T> = {
		items(items) {
			opts.items = items;
			return b;
		},
		produce(fn) {
			opts.produce = fn;
			return b;
		},
		key(fn) {
			opts.keyOf = fn;
			return b;
		},
		gap(fn) {
			opts.gapMs = fn;
			return b;
		},
		concurrency(n) {
			opts.concurrency = n;
			return b;
		},
		cacheLimit(n) {
			opts.cacheLimit = n;
			return b;
		},
		produceTimeout(ms) {
			opts.produceTimeoutMs = ms;
			return b;
		},
		onItemStart(fn) {
			opts.onItemStart = fn;
			return b;
		},
		onState(fn) {
			opts.onState = fn;
			return b;
		},
		build() {
			if (!opts.items || !opts.produce) {
				throw new Error('suono sequence(): .items(…) and .produce(…) are required before .build()/.play()');
			}
			return stage.sequence(opts as SequenceOptions<T>);
		},
		play() {
			const seq = b.build();
			seq.play();
			return seq;
		},
	};
	return b;
}
