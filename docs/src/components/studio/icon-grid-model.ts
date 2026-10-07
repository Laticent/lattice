// The icon GRID's model: what it lists, what a search keeps, and what a pick inserts. Pure, so the
// rules are tested without a DOM (icon-grid-model.test.ts). The grid itself is IconGrid.tsx.
//
// Everything it lists comes from the icons plugin's DATA script (names, categories, drawings), which
// loads only when the grid opens (engineering/decisions/2026-09-29-inline-icons.md § 17). Aliases come
// from the lint core's completion words ("also db"), which the editor has usually loaded already.

export type IconShape = [string, Record<string, string | number>];
export type IconsData = { category?: Record<string, string>; icons?: Record<string, IconShape[]> };
export type IconEntry = { name: string; category: string; aliases: string[] };

/** One entry per drawn icon, in the data's own order (the curation's category order). */
export function iconEntries(data: IconsData | null | undefined, aliasInfo: ReadonlyMap<string, string> = new Map()): IconEntry[] {
	const icons = data?.icons ?? {};
	return Object.keys(icons).map((name) => ({
		name,
		category: data?.category?.[name] ?? 'other',
		// lint-core's info reads "also db, database" for a name with aliases.
		aliases: (aliasInfo.get(name) ?? '')
			.replace(/^also\s+/i, '')
			.split(/,\s*/)
			.map((a) => a.trim().toLowerCase())
			.filter((a) => a && !a.includes(' ')),
	}));
}

/** The entries a search keeps: every word of the query must start a name part or an alias. */
export function filterIcons(entries: readonly IconEntry[], query: string): IconEntry[] {
	const words = query.toLowerCase().trim().split(/[\s,]+/).filter(Boolean);
	if (!words.length) return [...entries];
	return entries.filter((e) => {
		const keys = [e.name, ...e.name.split('-'), ...e.aliases, e.category];
		return words.every((w) => keys.some((k) => k.startsWith(w)));
	});
}

/** Entries grouped by category, in first-seen order. */
export function groupByCategory(entries: readonly IconEntry[]): Array<{ category: string; items: IconEntry[] }> {
	const groups = new Map<string, IconEntry[]>();
	for (const e of entries) {
		const g = groups.get(e.category);
		if (g) g.push(e);
		else groups.set(e.category, [e]);
	}
	return [...groups].map(([category, items]) => ({ category, items }));
}

/** An edit at the caret: delete `back` characters before it, then insert `text`. */
export type CaretEdit = { back: number; text: string };

/**
 * What a pick inserts, given the caret's line before and after it.
 *  - Inside a half-typed icon (`^{da`, the caret after it): the name replaces what was typed, and a
 *    `}` closes it unless one already follows.
 *  - Inside a record in an inline code span (`{S3, ` in a pill, a chart node's `{…}`): `icon=name`,
 *    with a comma when the record already holds something.
 *  - Inside an open inline code span (an odd number of unescaped backticks before the caret):
 *    `^{name}`.
 *  - Anywhere else: `` `^{name}` ``, the whole span.
 */
export function iconInsertion(before: string, name: string, after = ''): CaretEdit {
	const ticks = [...before.matchAll(/(?<!\\)`/g)];
	const inCode = ticks.length % 2 === 1;
	const codeStart = inCode ? (ticks.at(-1)?.index ?? -1) : before.length;
	// A half-typed icon in this span: `^{` and then only name characters up to the caret.
	const partial = inCode ? /\^\{([a-z0-9-]*)$/i.exec(before.slice(codeStart)) : null;
	if (partial) {
		const closed = /^[a-z0-9-]*\}/i.test(after);
		return { back: partial[1].length, text: closed ? name : `${name}}` };
	}
	// The innermost `{` left open since the span began, and not a spark's `~{` or an icon's own `^{`.
	let depth = 0;
	let open = -1;
	for (let i = before.length - 1; i > codeStart; i--) {
		const c = before[i];
		if (c === '}') depth++;
		else if (c === '{') {
			if (depth === 0) {
				open = i;
				break;
			}
			depth--;
		}
	}
	if (inCode && open > codeStart && !/[~^]$/.test(before.slice(0, open))) {
		const inside = before.slice(open + 1);
		// `{` → nothing; `{S3, ` → nothing; `{S3,` → a space; `{S3` → a comma and a space.
		const sep = !inside.trim() || /,\s+$/.test(inside) ? '' : /,$/.test(inside) ? ' ' : ', ';
		return { back: 0, text: `${sep}icon=${name}` };
	}
	return { back: 0, text: inCode ? `^{${name}}` : `\`^{${name}}\`` };
}
