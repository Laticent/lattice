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
 * The string a segment's hash is taken over: `canonicalJson([text, inputs])`, or
 * `canonicalJson([text, inputs, emphasis])` when the segment's narration carries emphasis.
 *
 * `text` is the narration the segment's track was built from — exactly the string handed to
 * `buildTrack` — and for a tour stretch the producer appends the storyboard steps it spans (§4.5 of
 * the decision note). `inputs` is the file's `inputs` object.
 *
 * `emphasis` is the segment's emphasis spans, one list per line, in line order. Emphasis changes
 * timing (a weighted word buys an extra hold), so a hash that missed it would call a re-timed
 * segment fresh. It belongs HERE and not in `inputs` because a span is a character range into one
 * line: it means nothing file-wide (LTT step 4 settled this, engineering/ltt.md §Staleness). An
 * absent or empty `emphasis` leaves the string exactly as it was, so no existing hash moves.
 */
export function segmentHashInput(text: string, inputs: object, emphasis?: readonly (readonly unknown[] | undefined)[]): string {
	const spans = emphasis?.some((line) => line?.length) ? emphasis.map((line) => line ?? []) : null;
	return canonicalJson(spans ? [String(text), inputs, spans] : [String(text), inputs]);
}
