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
 * Parse the leading block into its ordered flat [key, value] pairs PLUS any NESTED
 * blocks — a bare `key:` header followed by more-indented `child: value` lines (e.g.
 * `finish-override:`, the deck author's finish tuning). Nested blocks are captured as
 * their raw child lines and re-emitted VERBATIM, so an unrelated edit (setting `size:`,
 * stamping a class) round-trips the block untouched instead of flattening it into stray
 * scalars that would corrupt the source. A bare header with no indented children is
 * just an empty flat scalar. `finish:` etc. stay flat.
 */
function parseFm(source: string): { pairs: [string, string][]; blocks: [string, string[]][] } {
	const m = FM_RE.exec(String(source ?? ''));
	if (!m) return { pairs: [], blocks: [] };
	const pairs: [string, string][] = [];
	const blocks: [string, string[]][] = [];
	const lines = m[1].split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const head = lines[i].match(/^(\s*)([A-Za-z][\w-]*):[ \t]*$/); // bare `key:` — no value
		if (head) {
			const base = head[1].length;
			const child: string[] = [];
			while (i + 1 < lines.length) {
				const next = lines[i + 1];
				if (!next.trim()) { i++; continue; } // blank lines don't end the block
				if ((next.match(/^(\s*)/)?.[1] ?? '').length <= base) break; // dedent → block ends
				child.push(next); // captured verbatim (indentation + any inline comment)
				i++;
			}
			if (child.length) { blocks.push([head[2], child]); continue; }
			pairs.push([head[2], '']); // a bare header with no children is an empty scalar
			continue;
		}
		const kv = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(lines[i].trim());
		if (kv) pairs.push([kv[1], unquote(kv[2])]);
	}
	return { pairs, blocks };
}

/** Re-emit a front-matter block from flat pairs + nested blocks (verbatim child lines),
 *  or the bare body when nothing remains. Nested blocks trail the flat keys. */
function emitFm(pairs: [string, string][], blocks: [string, string[]][], body: string): string {
	const lines = pairs.map(([k, v]) => `${k}: ${quoteIfNeeded(v)}`);
	for (const [k, child] of blocks) {
		lines.push(`${k}:`);
		for (const c of child) lines.push(c);
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

/**
 * Parse the deck's `finish-override:` block into a PARTIAL recipe — a map of layer →
 * `{ attr: rawStringValue }`, nested one level under each layer key to mirror the recipe
 * shape (`backdrop: { strength: 0.4, clearance: off }`, `wash: { intensity: 5 }`, …).
 * Values stay raw strings; `mergeFinishOverride` deep-merges them onto the finish's
 * recipe and `coerceRecipe` parses/clamps them. Returns {} when the block is absent.
 * Only layer keys that carry indented children become entries — a bare `finish-override:`
 * (or a stray scalar under it) yields nothing.
 */
export function parseFinishOverride(source: string): Record<string, Record<string, string>> {
	const block = parseFm(source).blocks.find(([k]) => k === 'finish-override');
	if (!block) return {};
	const out: Record<string, Record<string, string>> = {};
	let cur: Record<string, string> | null = null;
	let layerIndent = -1;
	for (const raw of block[1]) {
		const indent = (raw.match(/^(\s*)/)?.[1] ?? '').length;
		const header = raw.match(/^\s*([A-Za-z][\w-]*):[ \t]*$/); // a layer header (no value)
		if (header) { cur = {}; out[header[1]] = cur; layerIndent = indent; continue; }
		const kv = raw.match(/^\s*([A-Za-z][\w-]*):\s*(.+)$/);
		if (kv && cur && indent > layerIndent) cur[kv[1]] = unquote(kv[2].replace(/\s+#.*$/, ''));
	}
	// Drop any layer header that carried no attrs (an empty `backdrop:` under the override).
	for (const k of Object.keys(out)) if (!Object.keys(out[k]).length) delete out[k];
	return out;
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
	const { pairs: all, blocks } = parseFm(source);
	const pairs = all.filter(([k]) => k !== key);
	if (value !== null) pairs.push([key, value]);
	// Nested blocks (e.g. `finish-override:`) round-trip untouched when a flat key changes.
	return emitFm(pairs, blocks, body);
}
