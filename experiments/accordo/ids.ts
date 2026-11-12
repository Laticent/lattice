/**
 * Replica ids for the bake-off. Random by default, as a real tab's would be. The correctness gate seeds them, because
 * ids break ties between concurrent inserts, so an unseeded run cannot reproduce its own placement count (HARD RULE #32).
 */
let next: (() => number) | null = null;

/** Seed every replica id minted from now on (mulberry32); `null` returns to random ids. */
export function seedIds(seed: number | null): void {
	if (seed === null) {
		next = null;
		return;
	}
	let a = seed >>> 0;
	next = () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return (t ^ (t >>> 14)) >>> 0;
	};
}

/** A 32-bit replica id from the seeded source, or null when ids are random. */
export const seededId = (): number | null => (next ? next() : null);
