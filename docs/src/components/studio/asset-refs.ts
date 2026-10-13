// Find and rewrite `asset:<name>` references in a deck's markdown, leaving code alone. Pure: no storage, no DOM.
// Decision note: engineering/decisions/2026-10-12-library-media-assets.md §Editing a photo's metadata.
//
// WHY CODE IS LEFT ALONE. A deck that teaches the syntax shows `asset:hero` inside a fenced block or an inline
// code span. That text is documentation, and rewriting it to a new name would change what the slide says. Only a
// reference that renders — prose, an image, a front-matter value — is a reference.

const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/;

/** Run `fn` over every part of `source` that is not code: a fenced block (``` or ~~~, closed by a fence of the same
 *  mark and at least the same length, or the end of the file) and an inline code span are passed through untouched. */
export function mapOutsideCode(source: string, fn: (prose: string) => string): string {
	const lines = source.split('\n');
	const out: string[] = [];
	let fence: { mark: string; len: number } | null = null;
	let prose: string[] = [];
	const flush = () => {
		if (!prose.length) return;
		out.push(...mapInlineCode(prose.join('\n'), fn).split('\n'));
		prose = [];
	};
	for (const line of lines) {
		if (fence) {
			out.push(line);
			const close = FENCE_OPEN.exec(line);
			if (close && close[2][0] === fence.mark && close[2].length >= fence.len && close[3].trim() === '') fence = null;
			continue;
		}
		const open = FENCE_OPEN.exec(line);
		// A backtick fence's info string may not contain a backtick (that would be an inline span, not a fence).
		if (open && !(open[2][0] === '`' && open[3].includes('`'))) {
			flush();
			out.push(line);
			fence = { mark: open[2][0], len: open[2].length };
			continue;
		}
		prose.push(line);
	}
	flush();
	return out.join('\n');
}

/** Inline code spans: a run of N backticks closes at the next run of exactly N. An unmatched run is plain text. */
function mapInlineCode(text: string, fn: (prose: string) => string): string {
	const re = /(`+)(?!`)([\s\S]*?)(?<!`)\1(?!`)/g;
	let out = '';
	let last = 0;
	for (let m = re.exec(text); m; m = re.exec(text)) {
		out += fn(text.slice(last, m.index)) + m[0];
		last = m.index + m[0].length;
	}
	return out + fn(text.slice(last));
}

/** `source` with every `asset:<from>` that renders rewritten to `asset:<to>`. Whole names only (`asset:hero-2` is
 *  untouched when renaming `hero`), case-insensitive like the grammar, and never inside code. */
export function renameAssetRefsOutsideCode(source: string, from: string, to: string): string {
	if (!/asset:/i.test(source)) return source;
	const want = from.toLowerCase();
	// A whole name only: not `asset:hero-2`, and not `asset:hero.jpg`, which the grammar does not accept as a reference
	// (lib/core/remote-ref.js `assetName`) and a deck that wrote it shows the stand-in either way.
	const ref = /\basset:([A-Za-z0-9][A-Za-z0-9_-]*)(?![A-Za-z0-9_-]|\.[A-Za-z0-9])/gi;
	return mapOutsideCode(source, (prose) => prose.replace(ref, (whole, name: string) => (name.toLowerCase() === want ? `asset:${to}` : whole)));
}

/** Does `source` write `asset:<name>` anywhere that renders? The same test the rewrite uses, so a count of decks that
 *  "still use the old name" is exactly the decks the rewrite would change. */
export function usesAssetOutsideCode(source: string, name: string): boolean {
	return renameAssetRefsOutsideCode(source, name, `${name}-x`) !== source;
}

/** How many of `sources` write `asset:<name>` anywhere that renders. */
export function decksUsingOutsideCode(name: string, sources: readonly string[]): number {
	return sources.filter((s) => usesAssetOutsideCode(s, name)).length;
}
