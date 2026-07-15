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

	// Merge order preserved via a Map keyed by id; workspace first, then per-deck overrides. `full` is
	// implicit + un-removable (prepended below), so a workspace that mis-defines an `id: full` lens is
	// filtered here — otherwise it would land in `merged` and `full` would appear TWICE (the emit side
	// filters it in emitRegistryDelta too; this keeps parse symmetric).
	const merged = new Map<string, Partial<LensDef>>();
	if (!defaultsOff && workspace) for (const d of workspace.lenses) if (d.id !== FULL_LENS_ID) merged.set(d.id, { ...d });
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

/** True when a lens is a PRISTINE copy of a workspace default — same shape (base / label / single /
 *  hidden / order), NOT approved. A pristine inherited lens is left OUT of the deck source (it's
 *  re-inherited at read), so a deck the author never touched stays clean — no `lenses:` block. Exported
 *  so the UI can tell an untouched INHERITED starter apart from one the author has made their own (the
 *  Lenses panel badges the former "Starter"). */
export function isPristineInherited(lens: LensDef, def: LensDef | undefined): boolean {
	return (
		!!def &&
		!lens.approved &&
		lens.base === def.base &&
		lens.label === def.label &&
		!!lens.single === !!def.single &&
		!!lens.hidden === !!def.hidden &&
		(lens.order ?? null) === (def.order ?? null)
	);
}

/** Emit a MATERIALIZED lens in the delta. Like emitInline, but for a lens that overrides an inherited
 *  workspace default it must also record fields the deck CLEARED — an omitted boolean would re-inherit
 *  the workspace value on the next read (parse merges `{...wsDef, ...deckDef}`), silently resurrecting a
 *  `single`/`hidden` the author turned off (e.g. promoting a staged view to readers). So when the
 *  workspace sets `single`/`hidden` true and this lens clears it, write the explicit `false`.
 *  (`order` is a baseline the deck can re-number but not clear-to-inherit; no shipped workspace default
 *  carries `order`, and the UI only ever assigns one — never clears it — so no explicit-clear is needed.
 *  `label`/`base` are always emitted, so they can't silently re-inherit; `approved` is never on a wsDef.) */
function emitInlineDelta(d: LensDef, wsDef: LensDef | undefined): string {
	const parts = [`label: ${JSON.stringify(d.label)}`, `base: ${d.base}`];
	if (d.single) parts.push('single: true');
	else if (wsDef?.single) parts.push('single: false');
	if (d.hidden) parts.push('hidden: true');
	else if (wsDef?.hidden) parts.push('hidden: false');
	if (d.order != null) parts.push(`order: ${d.order}`);
	if (d.approved) parts.push(`approved: ${JSON.stringify(d.approved)}`);
	return `  ${d.id}: { ${parts.join(', ')} }`;
}

/** Emit only the deck's DELTA from the workspace default lenses — the shape a deck writes when its reader
 *  views are INHERITED from a workspace setting (not materialized per-deck). Rules:
 *   - a pristine inherited default → NOT emitted (invisible in source; re-inherited at read);
 *   - an approved / modified / custom (non-default) lens → emitted as a full def (portable + self-contained);
 *   - a workspace default the deck REMOVED (absent from `reg`) → emitted as `{ drop: true }` so it does not
 *     silently re-inherit on the next read.
 *  This is what keeps an untouched deck's source empty while still letting the author approve, edit, or
 *  drop an inherited view. `parseLensRegistry(…, workspace)` round-trips the result back to `reg`.
 *
 *  `materialize` FORCES a pristine inherited lens to be emitted anyway when its id is in the set — used
 *  for the "tagging counts as touching" rule: once the author tags slides into an inherited view, the
 *  Studio passes that view's id here so its def is written to the deck (it's no longer a disposable
 *  inherited starter, so it survives the workspace setting being turned off). See tags.ts `taggedLensIds`. */
export function emitRegistryDelta(reg: LensRegistry, workspace: WorkspaceLensConfig, materialize?: Set<string>): string {
	const defs = new Map(workspace.lenses.filter((l) => l.id !== FULL_LENS_ID).map((l) => [l.id, l]));
	const lines: string[] = [];
	const present = new Set<string>();
	for (const lens of reg.lenses) {
		if (lens.id === FULL_LENS_ID) continue;
		present.add(lens.id);
		// A pristine inherited lens is normally left out (re-inherited at read) — UNLESS the deck has tagged
		// membership for it (`materialize`), in which case the author has acted on it and it's written out.
		if (isPristineInherited(lens, defs.get(lens.id)) && !materialize?.has(lens.id)) continue;
		lines.push(emitInlineDelta(lens, defs.get(lens.id)));
	}
	for (const id of defs.keys()) if (!present.has(id)) lines.push(`  ${id}: { drop: true }`);
	return lines.length ? `lenses:\n${lines.join('\n')}` : '';
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
 *  end (canonical placement, since the host's generic emitter relocates nested blocks anyway).
 *
 *  With a `workspace` config, the deck's reader views are INHERITED (not materialized per-deck): the
 *  block records only the deck's DELTA from those defaults (see `emitRegistryDelta`), so an untouched
 *  deck writes NO block at all — and `lens-default:` is emitted only when the deck overrides the
 *  workspace default. Without `workspace`, the whole registry is materialized (the pre-inheritance
 *  behavior). Either way `parseLensRegistry(result, workspace)` round-trips back to `reg`.
 *
 *  `materialize` (workspace mode only) forces the named pristine inherited lenses to be written out —
 *  the "tagging counts as touching" rule (see `emitRegistryDelta`). Callers pass the deck's
 *  `taggedLensIds` so a view the author tagged into is no longer disposable. */
export function upsertLensRegistry(frontMatter: string, reg: LensRegistry, workspace?: WorkspaceLensConfig, materialize?: Set<string>): string {
	const srcLines = String(frontMatter ?? '').split(/\r?\n/);
	const kept = stripRegistryLines(srcLines);
	// drop a trailing run of blank lines so we append cleanly
	while (kept.length && kept[kept.length - 1].trim() === '') kept.pop();
	const tail: string[] = [];
	const wsDefault = workspace?.default && workspace.default !== FULL_LENS_ID ? workspace.default : undefined;
	// Emit lens-default only when the deck's default DEVIATES from the inherited one. The inherited
	// default is the workspace's (when it sets a non-full one) else `full`. Critically this includes the
	// case where the deck default is `full` but the WORKSPACE default is non-full: `full` is then a real
	// deviation and must be written, or the reader would open in the scoped workspace view instead of the
	// whole deck (parse falls back to the workspace default when no scalar is present).
	if (reg.default && reg.default !== (wsDefault ?? FULL_LENS_ID)) tail.push(`lens-default: ${reg.default}`);
	let block = workspace ? emitRegistryDelta(reg, workspace, materialize) : emitRegistry(reg);
	// A tombstone (`id: { drop: true }`) already in the source must survive EVERY rewrite — including one
	// made while the workspace setting is OFF (`emitRegistry` has no workspace to reconstruct drops from)
	// or after the workspace defaults stopped including that id. Otherwise a dropped starter silently
	// re-inherits on the next `drop → toggle off → any lens write → toggle on` (a fail-closed defect the
	// red team caught, but it still breaks the "a dropped starter persists" promise). Re-attach any source
	// tombstone the emitter didn't already write (dedup: the ON-mode delta may have written it already).
	const present = new Set(reg.lenses.map((l) => l.id));
	for (const id of sourceDropIds(srcLines)) {
		if (present.has(id)) continue; // the deck materialized/re-added it — no longer dropped
		const line = `  ${id}: { drop: true }`;
		if (block.includes(line)) continue; // already reconstructed by emitRegistryDelta
		block = block ? `${block}\n${line}` : `lenses:\n${line}`;
	}
	if (block) tail.push(block);
	return [...kept, ...tail].join('\n');
}

/** The tombstoned lens ids (`id: { drop: true }`) present in a front-matter body, in document order,
 *  excluding the implicit `full`. Used to carry drops across a rewrite even when the workspace can't
 *  reconstruct them (see `upsertLensRegistry`). */
function sourceDropIds(lines: string[]): string[] {
	const ids: string[] = [];
	for (const { def, drop } of parseEntries(lines)) if (drop && def.id !== FULL_LENS_ID && !ids.includes(def.id)) ids.push(def.id);
	return ids;
}
