// The front-matter `lenses:` registry — the deck's lens catalog (labels, order, base, approval).
// Lente is the SOLE writer of this block: it parses and re-emits ONE canonical inline-flow-map shape
// (modeled on the engine's existing `parseFinishOverride`), with a parse(emit(x)) round-trip proven in
// ./registry.test.ts. Boundary honesty (design doc §8): the block still flows through the host's
// generic front-matter reader on unrelated edits, which is lossless only for this canonical shape —
// so Lente emits only the canonical shape and never a form the generic reader would mangle.

import { FULL_LENS_ID, type LensBase, type LensDef, type LensRegistry, type WorkspaceLensConfig } from './types';

// Capture greedily and trim in code — a `\s*(.+?)\s*$` shape backtracks polynomially on trailing
// whitespace (CodeQL js/polynomial-redos); a single greedy group does not.
const DEFAULT_SCALAR_RE = /^\s*lens-default:(.*)$/;
const DEFAULTS_OFF_RE = /^\s*lens-defaults:\s*off\s*$/;
const HEADER_RE = /^\s*lenses:\s*$/;
const CHILD_RE = /^(\s+)([A-Za-z0-9_-]+):\s*\{(.*)\}\s*$/;
const INDENTED_RE = /^\s+\S/;

/** A parsed lens entry plus the per-deck override verbs (`drop`) the merge consumes. */
type ParsedEntry = { def: Partial<LensDef> & { id: string }; drop: boolean };

/** Unquote a scalar. A double-quoted value is a JSON string (emitInline writes labels with
 *  JSON.stringify), so parse it as one — reversing every escape (`\"`, `\n`, `\t`, `\\`), not just
 *  the two the naive version handled. Falls back gracefully on a malformed literal. */
function stripQuotes(v: string): string {
	const t = v.trim();
	if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
		try { return JSON.parse(t) as string; } catch { return t.slice(1, -1); }
	}
	if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) {
		return t.slice(1, -1).replace(/\\(['\\])/g, '$1');
	}
	return t;
}

/** Split an inline-map body on TOP-LEVEL commas only (a comma inside quotes stays put — the fix for
 *  the host splitter's documented comma fragility, design doc §3.2). A backslash inside a quoted run
 *  escapes the next character, so an escaped quote (`\"`, which emitInline writes) does NOT close the
 *  string — otherwise a label with an odd number of quotes would swallow the following comma and
 *  corrupt every field after it. */
function splitTopLevel(body: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let quote = '';
	let cur = '';
	for (let i = 0; i < body.length; i++) {
		const ch = body[i];
		if (quote) {
			cur += ch;
			if (ch === '\\') { cur += body[++i] ?? ''; continue; } // keep the escaped char; never toggle on it
			if (ch === quote) quote = '';
			continue;
		}
		if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
		if (ch === '{' || ch === '[') depth++;
		if (ch === '}' || ch === ']') depth--;
		if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
		cur += ch;
	}
	if (cur.trim()) out.push(cur);
	return out;
}

function parseInlineMap(id: string, body: string): ParsedEntry {
	const def: Partial<LensDef> & { id: string } = { id };
	let drop = false;
	for (const pair of splitTopLevel(body)) {
		const idx = pair.indexOf(':');
		if (idx < 0) continue;
		const key = pair.slice(0, idx).trim();
		const raw = pair.slice(idx + 1).trim();
		switch (key) {
			case 'label': def.label = stripQuotes(raw); break;
			case 'base': def.base = raw === 'all' ? 'all' : 'none'; break;
			case 'single': def.single = raw === 'true'; break;
			case 'hidden': def.hidden = raw === 'true'; break;
			case 'order': { const n = Number(raw); if (Number.isFinite(n)) def.order = n; break; }
			case 'approved': def.approved = stripQuotes(raw); break;
			case 'drop': drop = raw === 'true'; break;
			default: break; // forward-compatible: ignore unknown keys
		}
	}
	return { def, drop };
}

/** Read every `id: { … }` child under the `lenses:` header. Returns entries in document order. */
function parseEntries(lines: string[]): ParsedEntry[] {
	const entries: ParsedEntry[] = [];
	let inBlock = false;
	for (const line of lines) {
		if (HEADER_RE.test(line)) { inBlock = true; continue; }
		if (!inBlock) continue;
		if (!INDENTED_RE.test(line)) { if (line.trim() === '') continue; break; } // block ends at first non-indented, non-blank line
		const m = CHILD_RE.exec(line);
		if (m) entries.push(parseInlineMap(m[2], m[3]));
		// a malformed child line is skipped (surfaced by validateRegistry), not fatal
	}
	return entries;
}

function completeDef(id: string, p: Partial<LensDef>): LensDef {
	const base: LensBase = p.base === 'all' ? 'all' : 'none';
	return {
		id,
		label: p.label ?? id,
		base,
		...(p.single ? { single: true } : {}),
		...(p.hidden ? { hidden: true } : {}),
		...(p.order != null ? { order: p.order } : {}),
		...(p.approved ? { approved: p.approved } : {}),
	};
}

const FULL_DEF: LensDef = { id: FULL_LENS_ID, label: 'Full deck', base: 'all' };

/** Parse the deck front matter (the text BETWEEN the `---` fences) into a resolved registry, merging
 *  workspace defaults unless the deck opts out with `lens-defaults: off`. Best-effort: a malformed
 *  child line is skipped, not thrown (validateRegistry reports it). The implicit `full` lens is always
 *  present at index 0 and can never be dropped. */
export function parseLensRegistry(frontMatter: string, workspace?: WorkspaceLensConfig): LensRegistry {
	const lines = String(frontMatter ?? '').split(/\r?\n/);
	const defaultsOff = lines.some((l) => DEFAULTS_OFF_RE.test(l));
	const defaultLine = lines.map((l) => DEFAULT_SCALAR_RE.exec(l)).find(Boolean);
	const deckDefault = defaultLine ? stripQuotes(defaultLine[1].trim()) : undefined;

	// Merge order preserved via a Map keyed by id; workspace first, then per-deck overrides.
	const merged = new Map<string, Partial<LensDef>>();
	if (!defaultsOff && workspace) for (const d of workspace.lenses) merged.set(d.id, { ...d });
	for (const { def, drop } of parseEntries(lines)) {
		if (def.id === FULL_LENS_ID) continue; // full is implicit and un-removable
		if (drop) { merged.delete(def.id); continue; }
		merged.set(def.id, { ...merged.get(def.id), ...def });
	}

	const defs = [...merged.entries()].map(([id, p]) => completeDef(id, p));
	// Stable sort by explicit order; entries without one keep their merge position (after ordered ones).
	defs.sort((a, b) => (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY));

	const lenses = [FULL_DEF, ...defs];
	const wantDefault = deckDefault ?? (!defaultsOff ? workspace?.default : undefined) ?? FULL_LENS_ID;
	const def = lenses.some((l) => l.id === wantDefault) ? wantDefault : FULL_LENS_ID;
	return { lenses, default: def };
}

function emitInline(d: LensDef): string {
	const parts = [`label: ${JSON.stringify(d.label)}`, `base: ${d.base}`];
	if (d.single) parts.push('single: true');
	if (d.hidden) parts.push('hidden: true');
	if (d.order != null) parts.push(`order: ${d.order}`);
	if (d.approved) parts.push(`approved: ${JSON.stringify(d.approved)}`);
	return `  ${d.id}: { ${parts.join(', ')} }`;
}

/** Emit the canonical `lenses:` block (excludes the implicit `full`). Empty registry => ''. */
export function emitRegistry(reg: LensRegistry): string {
	const body = reg.lenses.filter((l) => l.id !== FULL_LENS_ID).map(emitInline);
	return body.length ? `lenses:\n${body.join('\n')}` : '';
}

/** Strip an existing `lenses:` block (header + its indented children) and any `lens-default:` /
 *  `lens-defaults:` lines from a front-matter body, returning the surviving lines. */
function stripRegistryLines(lines: string[]): string[] {
	const out: string[] = [];
	let skipping = false;
	for (const line of lines) {
		if (HEADER_RE.test(line)) { skipping = true; continue; }
		if (skipping) {
			if (INDENTED_RE.test(line)) continue;
			if (line.trim() === '') continue;
			skipping = false;
		}
		if (DEFAULT_SCALAR_RE.test(line) || DEFAULTS_OFF_RE.test(line)) continue;
		out.push(line);
	}
	return out;
}

/** Rewrite a deck front matter so its lens registry matches `reg` — Lente as sole writer. Preserves
 *  every unrelated key; re-emits the `lens-default:` scalar and the canonical `lenses:` block at the
 *  end (canonical placement, since the host's generic emitter relocates nested blocks anyway). */
export function upsertLensRegistry(frontMatter: string, reg: LensRegistry): string {
	const kept = stripRegistryLines(String(frontMatter ?? '').split(/\r?\n/));
	// drop a trailing run of blank lines so we append cleanly
	while (kept.length && kept[kept.length - 1].trim() === '') kept.pop();
	const tail: string[] = [];
	if (reg.default && reg.default !== FULL_LENS_ID) tail.push(`lens-default: ${reg.default}`);
	const block = emitRegistry(reg);
	if (block) tail.push(block);
	return [...kept, ...tail].join('\n');
}
