// One AXIS-REGISTER line as the Inspector reads and writes it (`logo-finish:`, `progress-rail:`):
// up to one word per axis, in any order, the first recognized word on each axis winning — the way
// lib/core/register-factory.js reads it. Shared so each register's Studio mirror is its word table
// and labels only; the parse and write live once (HARD RULE #15).

export type AxisTable<A extends string> = readonly { axis: A; names: readonly string[] }[];

/** The line's words, by axis. Unknown words and a second word on a filled axis are dropped. */
export function parseAxisLine<A extends string>(axes: AxisTable<A>, value: string): Partial<Record<A, string>> {
	const out: Partial<Record<A, string>> = {};
	for (const word of value.trim().toLowerCase().split(/[\s,[\]]+/).filter(Boolean)) {
		const hit = axes.find((a) => a.names.includes(word));
		if (hit && !out[hit.axis]) out[hit.axis] = word;
	}
	return out;
}

/** Words → the line's value in axis order, `''` when nothing is set (the caller then drops the key).
 *  `dropDefaults` also leaves out each axis's first word, the register's default. */
export function axisLineValue<A extends string>(axes: AxisTable<A>, words: Partial<Record<A, string>>, dropDefaults = false): string {
	return axes.map(({ axis, names }) => {
		const w = words[axis];
		return w && !(dropDefaults && w === names[0]) ? w : '';
	}).filter(Boolean).join(' ');
}
