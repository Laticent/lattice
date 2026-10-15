// Code formatting in the Studio: the formatter's browser half (lib/authoring/code-format/,
// engineering/decisions/2026-10-15-code-plugin.md §6 and §9).
//
// Formatting is an AUTHORING step: it rewrites the deck's source in the editor, where the author
// sees it, through the same planner and formatters as `lattice fmt`. The render never formats, so
// the editor, the preview, `focus=`/`mark=` and the line-range lint all count the same lines.
// Two callers, both in Editor.tsx: the "Format code" command (every block a formatter reads, except
// `format=off`) and format-on-blur (only the blocks whose record, or the deck's `code:` default,
// says `format`).
//
// The formatters live beside the engine in the content-hashed `playground/v/<hash>/fmt/` dir (built
// by tools/build-code-format.js), and each loads only when a block in its language is formatted: a
// session that never formats fetches nothing, not even this module's entry.
//
// NEVER REJECTS, and is bounded: a formatter that fails, or a fetch that stalls, comes back as a
// reason the caller can show, never as a changed block.
import { engineBase } from './engine-base';

const LOAD_TIMEOUT_MS = 10_000;

/** The same cheap test the planner makes (lib/authoring/code-format/plan.mjs `wantsFormat`). */
const WANTS_FORMAT = [/`@code\{[^`\n]*\bformat\b/, /^code:[^\n]*\bformat\b/m];
export function wantsFormat(markdown: string): boolean {
	return WANTS_FORMAT.some((re) => re.test(markdown));
}

/** One edit, in character offsets of the source that was formatted. */
export type FormatChange = { from: number; to: number; insert: string };
/** A block left as written, and why. `line` is 1-based, the block's first line. */
export type FormatSkip = { lang: string; line: number; error: string };
export type FormatResult = { changes: FormatChange[]; skipped: FormatSkip[]; failed?: string };

type FormatModule = {
	formatMarkdown: (
		markdown: string,
		env: { wasmUrl: (file: string) => string },
		options: { all?: boolean },
	) => Promise<{ markdown: string; changes: FormatChange[]; skipped: FormatSkip[] }>;
};

const modules = new Map<string, Promise<FormatModule | null>>();

function loadModule(dir: string): Promise<FormatModule | null> {
	const existing = modules.get(dir);
	if (existing) return existing;
	const p = Promise.race([
		import(/* @vite-ignore */ `${dir}browser.mjs`) as Promise<FormatModule>,
		new Promise<null>((resolve) => setTimeout(() => resolve(null), LOAD_TIMEOUT_MS)),
	])
		.catch(() => null)
		.then((m) => {
			if (!m) modules.delete(dir); // a failed load is retryable on the next format
			return m;
		});
	modules.set(dir, p);
	return p;
}

/**
 * The changes that format `markdown`'s code blocks, and the blocks left alone with why.
 * @param all  every block a formatter reads (the command); otherwise only the blocks that ask
 * @param base the formatter directory; defaults to the engine's `fmt/` beside it
 */
export async function formatCode(markdown: string, { all = false, base }: { all?: boolean; base?: string | null } = {}): Promise<FormatResult> {
	const none: FormatResult = { changes: [], skipped: [] };
	if (typeof window === 'undefined' || (!all && !wantsFormat(markdown))) return none;
	const engine = engineBase();
	const dir = base ?? (engine === null ? null : `${engine}fmt/`);
	if (!dir) return { ...none, failed: 'the formatter is not available on this page' };
	const mod = await loadModule(dir);
	if (!mod) return { ...none, failed: 'the formatter did not load; try again' };
	try {
		const out = await Promise.race([
			mod.formatMarkdown(markdown, { wasmUrl: (file) => new URL(file, new URL(dir, window.location.href)).href }, { all }),
			new Promise<null>((resolve) => setTimeout(() => resolve(null), LOAD_TIMEOUT_MS)),
		]);
		if (!out) return { ...none, failed: 'the formatter took too long; try again' };
		return { changes: out.changes, skipped: out.skipped };
	} catch (e) {
		return { ...none, failed: String((e as Error)?.message || e) };
	}
}

/** Test seam — drop the memoized module so a spec can re-exercise the load. */
export function __resetCodeFormatCache(): void {
	modules.clear();
}
