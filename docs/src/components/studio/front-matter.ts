// Deck front-matter — the leading `---` YAML-ish block that carries deck-level
// directives the engine honors (`size`, `paginate`, `header`, `footer`, `theme`).
// The Inspector writes these into the source so they are REAL: visible in the
// editor, carried into every export, and (for `size`) reflected in the preview.
//
// Deliberately tiny + line-based (not a YAML lib): the directives we set are
// flat `key: value` scalars. Pure — no DOM, no engine.

// Match a leading `---` block AND any fully-blank lines that follow it, so
// stripping the block leaves the body flush — WITHOUT eating a content line's own
// leading indentation (each consumed blank line must end in a newline).
const FM_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n(?:[ \t]*\r?\n)*)?/;

/** The raw leading front-matter block (incl. delimiters + trailing newline), or ''. */
export function frontMatterBlock(source: string): string {
	const m = FM_RE.exec(String(source ?? ''));
	return m ? m[0] : '';
}

/** The source with its leading front-matter block removed. */
export function stripFrontMatter(source: string): string {
	const src = String(source ?? '');
	const m = FM_RE.exec(src);
	return m ? src.slice(m[0].length) : src;
}

/**
 * Parse the leading block into its ordered flat [key, value] pairs PLUS the one
 * nested map we understand — `backdrop:` (Lattice's only nested front-matter key).
 * The nested axes are captured as a map (not flattened into stray `strength:` /
 * `clearance:` scalars, which would corrupt the block and break resolve-backdrop's
 * reader). `finish:` etc. stay flat. Mirrors deck-config.js's split, kept here so the
 * Studio's own writer round-trips a backdrop block instead of destroying it.
 */
function parseFm(source: string): { pairs: [string, string][]; backdrop: Record<string, string> | null } {
	const m = FM_RE.exec(String(source ?? ''));
	if (!m) return { pairs: [], backdrop: null };
	const pairs: [string, string][] = [];
	let backdrop: Record<string, string> | null = null;
	const lines = m[1].split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const head = lines[i].match(/^(\s*)backdrop:\s*$/);
		if (head) {
			backdrop = {};
			const base = head[1].length;
			while (i + 1 < lines.length) {
				const next = lines[i + 1];
				if (!next.trim()) { i++; continue; }
				if ((next.match(/^(\s*)/)?.[1] ?? '').length <= base) break; // dedent → block ends
				const kv = next.match(/^\s+([A-Za-z][\w-]*):\s*(.*)$/);
				if (kv) backdrop[kv[1]] = unquote(kv[2].replace(/\s+#.*$/, ''));
				i++;
			}
			continue;
		}
		const kv = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(lines[i].trim());
		// `backdrop` is EXCLUSIVELY the nested key (a bare header, handled above). A flat
		// `backdrop: <scalar>` is invalid syntax the engine ignores; drop it so stamping a
		// nested axis can't leave a duplicate `backdrop:` line behind.
		if (kv && kv[1] !== 'backdrop') pairs.push([kv[1], unquote(kv[2])]);
	}
	return { pairs, backdrop };
}

/** Re-emit a front-matter block from flat pairs + the nested `backdrop:` map, or the
 *  bare body when nothing remains. The backdrop block trails the flat keys. */
function emitFm(pairs: [string, string][], backdrop: Record<string, string> | null, body: string): string {
	const lines = pairs.map(([k, v]) => `${k}: ${quoteIfNeeded(v)}`);
	if (backdrop && Object.keys(backdrop).length) {
		lines.push('backdrop:');
		for (const [ax, v] of Object.entries(backdrop)) lines.push(`  ${ax}: ${v}`);
	}
	if (!lines.length) return body;
	return `---\n${lines.join('\n')}\n---\n\n${body.replace(/^(?:[ \t]*\r?\n)+/, '')}`;
}

function unquote(v: string): string {
	const t = v.trim();
	if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
	return t;
}
function quoteIfNeeded(v: string): string {
	return /^[\w:.\-/]+$/.test(v) ? v : `"${v.replace(/"/g, '\\"')}"`;
}

/** Read a single flat directive's value, or undefined if absent. */
export function getFrontMatter(source: string, key: string): string | undefined {
	const hit = parseFm(source).pairs.find(([k]) => k === key);
	return hit?.[1];
}

/** Read one nested `backdrop:` axis (e.g. `strength`, `clearance`), or undefined. */
export function getBackdropAxis(source: string, axis: string): string | undefined {
	return parseFm(source).backdrop?.[axis];
}

/**
 * Add space-separated class tokens to the deck's `class:` directive, deduped and
 * UNION-ed with whatever is already there — never a destructive replace. A deck
 * carrying `class: dark wide` keeps `dark wide`; the new tokens append after, in
 * order, skipping any already present. With no incoming tokens the source is
 * returned untouched. (Used to stamp a saved finish's `finish finish-<slug>` onto
 * the RENDER/ARTIFACT front matter without clobbering an author's own classes.)
 */
export function mergeClassTokens(source: string, tokens: string): string {
	const incoming = String(tokens || '').trim().split(/\s+/).filter(Boolean);
	if (!incoming.length) return source;
	const existing = (getFrontMatter(source, 'class') || '').trim().split(/\s+/).filter(Boolean);
	const seen = new Set(existing);
	const union = [...existing];
	for (const t of incoming) {
		if (!seen.has(t)) { seen.add(t); union.push(t); }
	}
	return setFrontMatter(source, 'class', union.join(' '));
}

/**
 * Set (or, with `value === null`, remove) a single front-matter directive,
 * preserving the rest of the block and the body. Creating the first directive
 * adds the block at the very top; removing the last one drops the block entirely.
 */
export function setFrontMatter(source: string, key: string, value: string | null): string {
	const body = stripFrontMatter(source);
	const { pairs: all, backdrop } = parseFm(source);
	const pairs = all.filter(([k]) => k !== key);
	if (value !== null) pairs.push([key, value]);
	// A nested `backdrop:` block round-trips untouched when any OTHER key changes.
	return emitFm(pairs, backdrop, body);
}

/**
 * Set (or, with `value === null`, clear) ONE axis of the nested `backdrop:` map —
 * `strength` / `clearance` — preserving the flat keys and the body. Removes the
 * `backdrop:` block when it empties. Used to stamp a saved finish's BAKED backdrop
 * onto the deck on Apply, where the author then tunes it (front matter / Deck-setup).
 */
export function setBackdropAxis(source: string, axis: string, value: string | null): string {
	const body = stripFrontMatter(source);
	const { pairs, backdrop } = parseFm(source);
	const map = { ...(backdrop || {}) };
	if (value === null) delete map[axis];
	else map[axis] = value;
	return emitFm(pairs, Object.keys(map).length ? map : null, body);
}
