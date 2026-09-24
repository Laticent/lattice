// The staleness hash's INPUT, defined once (engineering/ltt.md §Staleness).
//
// A segment's hash is SHA-256 over the UTF-8 bytes of `segmentHashInput(text, inputs)`. This file
// builds that string and nothing else: a digest needs `node:crypto` in Node and `crypto.subtle` in
// a browser, and this package imports neither, so each producer digests with its own. What they
// must agree on is the string, and that lives here, where the Studio (browser) and the export
// pipeline (Node) both reach it. A second hasher per runtime is how two producers come to disagree
// and flag every segment stale forever.

/** JSON with every object's keys sorted, at every depth, so two producers that build the same value
 *  in a different key order write the same string. Arrays keep their order: order is data there. */
export function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(',')}]`;
	if (value && typeof value === 'object') {
		const rec = value as Record<string, unknown>;
		const keys = Object.keys(rec)
			.filter((k) => rec[k] !== undefined)
			.sort();
		return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(rec[k])}`).join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}

/**
 * The string a segment's hash is taken over: `canonicalJson([text, inputs])`.
 *
 * `text` is the narration the segment's track was built from — exactly the string handed to
 * `buildTrack` — and for a tour stretch the producer appends the storyboard steps it spans (§4.5 of
 * the decision note). `inputs` is the file's `inputs` object.
 */
export function segmentHashInput(text: string, inputs: object): string {
	return canonicalJson([String(text), inputs]);
}
