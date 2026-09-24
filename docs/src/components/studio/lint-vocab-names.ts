// The lint vocab's register VALUE lists (`guardsNames`, `cardsNames`, the spectrum
// family, …) packed into ONE string for the Studio page, and unpacked in the island.
//
// Why a string: Astro serializes an island prop array as `[1,[[0,"a"],[0,"b"]]]`, and
// in HTML every quote is `&quot;` — about 17 bytes of wrapper per value. The Studio
// ships ~90 of these values in its HTML, whose size docs/route-budget.json watches
// (`studio` htmlRaw). As one `key:a b c;key:…` string they cost one wrapper in all.
//
// The format needs every value to be a plain token (no space, `;` or `:`). Every
// register value is kebab-case; the round-trip test holds that against the live
// vocab, so a value that breaks it fails a test instead of splitting wrong.

/** Every `*Names` array in `vocab`, packed as `key:a b c;key:d e`. */
export function packVocabNames(vocab: Record<string, unknown>): string {
	return Object.entries(vocab)
		.filter(([k, x]) => k.endsWith('Names') && Array.isArray(x))
		.map(([k, x]) => `${k}:${(x as unknown[]).map(String).join(' ')}`)
		.join(';');
}

/** Inverse of `packVocabNames` — `{ key: [values] }`. An empty list stays empty. */
export function unpackVocabNames(packed: string | null | undefined): Record<string, string[]> {
	const out: Record<string, string[]> = {};
	for (const entry of String(packed ?? '').split(';')) {
		const at = entry.indexOf(':');
		if (at <= 0) continue;
		const values = entry.slice(at + 1);
		out[entry.slice(0, at)] = values ? values.split(' ') : [];
	}
	return out;
}

/**
 * The island-side half: a lint vocab as the page shipped it (`packedNames` string) →
 * the shape every consumer reads (`guardsNames: [...]`, …). A vocab with no
 * `packedNames` passes through unchanged, so a test or caller handing a plain vocab
 * needs nothing.
 */
export function withUnpackedNames<T extends Record<string, unknown> | null | undefined>(vocab: T): T {
	if (!vocab || typeof vocab.packedNames !== 'string') return vocab;
	const { packedNames, ...rest } = vocab;
	return { ...rest, ...unpackVocabNames(packedNames) } as unknown as T;
}
