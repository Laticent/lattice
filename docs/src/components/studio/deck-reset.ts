// Deck settings' reset (engineering/decisions/2026-11-15-one-side-pane.md §3e): undo THIS VISIT's deck
// settings, and nothing else. The front matter is shared: the editor, a collaborator in Live, the
// command palette and other panes write it too, so restoring the whole block as the pane found it
// would roll their edits back with ours (found by the checker on #3222). Instead the Studio records
// which top-level keys the pane's own writes changed (`touchedKeys`), and the reset puts back only
// those keys' entries from the baseline (`revertKeys`). Pure string work, no DOM.

import { frontMatterBlock, innerFrontMatter, stripFrontMatter } from '../../lib/front-matter';

type Entry = { key: string | null; lines: string[] };

// A column-0 `key:` line (the key may be quoted) opens an entry; an indented line, a blank line or a
// column-0 `- item` (YAML lets a list sit flush under its key) continues it. Anything else at column 0
// (a comment) is its own keyless entry.
const KEY = /^(["']?)([A-Za-z_$][\w$.-]*)\1[ \t]*:/;

/** The top-level entries of a front-matter body, in order. */
export function fmEntries(inner: string): Entry[] {
	const out: Entry[] = [];
	if (!inner) return out;
	for (const line of inner.split(/\r?\n/)) {
		const m = KEY.exec(line);
		const last = out[out.length - 1];
		if (m) out.push({ key: m[2], lines: [line] });
		else if (last?.key && (line === '' || /^[ \t]/.test(line) || /^-(?:[ \t]|$)/.test(line))) last.lines.push(line);
		else out.push({ key: null, lines: [line] });
	}
	return out;
}

/** The line ending a source's front matter uses, so a rebuilt block keeps it. */
const eolOf = (source: string) => (/\r\n/.test(frontMatterBlock(source)) ? '\r\n' : '\n');

/** Each key's text in a source's front matter (a repeated key's entries joined, so any change shows). */
function entryMap(source: string): Map<string, string> {
	const map = new Map<string, string>();
	for (const e of fmEntries(innerFrontMatter(source))) {
		if (!e.key) continue;
		const text = e.lines.join('\n');
		const had = map.get(e.key);
		map.set(e.key, had === undefined ? text : `${had}\n${text}`);
	}
	return map;
}

/** The keys whose entry differs between two sources: added, removed or changed. */
export function touchedKeys(before: string, after: string): string[] {
	const a = entryMap(before);
	const b = entryMap(after);
	return [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k));
}

/** Whether any of `keys` reads differently now than in `baseline`. */
export function keysDiffer(current: string, baseline: string, keys: Iterable<string>): boolean {
	const now = entryMap(current);
	const was = entryMap(baseline);
	for (const k of keys) if (now.get(k) !== was.get(k)) return true;
	return false;
}

/**
 * `current` with each of `keys` put back as it reads in `baseline`: an entry the baseline had takes its
 * place (or is appended, when the visit removed it), and an entry the baseline did not have is removed.
 * Every other entry, comment and the body stay byte for byte.
 */
export function revertKeys(current: string, baseline: string, keys: Iterable<string>): string {
	const want = new Set(keys);
	if (want.size === 0) return current;
	const base = entryMap(baseline);
	const eol = eolOf(frontMatterBlock(current) ? current : baseline);
	// Each output entry, tagged with its key so a key the visit removed can go back where it was.
	const out: { key: string | null; text: string }[] = [];
	const placed = new Set<string>();
	for (const e of fmEntries(innerFrontMatter(current))) {
		if (e.key && want.has(e.key)) {
			if (placed.has(e.key)) continue;
			placed.add(e.key);
			const was = base.get(e.key);
			if (was !== undefined) out.push({ key: e.key, text: was });
			continue;
		}
		out.push({ key: e.key, text: e.lines.join('\n') });
	}
	// A key the visit removed returns before the first key that followed it in the baseline, else last.
	const order = fmEntries(innerFrontMatter(baseline)).map((e) => e.key);
	for (const k of want) {
		const was = base.get(k);
		if (placed.has(k) || was === undefined) continue;
		const after = order.slice(order.indexOf(k) + 1).find((n) => n && out.some((o) => o.key === n));
		const at = after ? out.findIndex((o) => o.key === after) : -1;
		out.splice(at < 0 ? out.length : at, 0, { key: k, text: was });
		placed.add(k);
	}
	const inner = out.map((o) => o.text).join('\n').split('\n').join(eol);
	const block = frontMatterBlock(current);
	const body = stripFrontMatter(current);
	if (!block) {
		// The visit removed the whole block: bring it back in the baseline's own shape (its delimiters and
		// the blank lines after it), holding only the restored keys.
		const was = frontMatterBlock(baseline);
		if (!inner.trim() || !was) return current;
		const start = was.indexOf('\n') + 1;
		return was.slice(0, start) + inner + was.slice(start + innerFrontMatter(baseline).length) + body;
	}
	// The pane created the block and the reset empties it: the deck had none, so drop it.
	if (!inner.trim() && !frontMatterBlock(baseline)) return body;
	// Swap the inner text only, keeping this block's own delimiters and the blank lines after it.
	const start = block.indexOf('\n') + 1;
	return block.slice(0, start) + inner + block.slice(start + innerFrontMatter(current).length) + body;
}
