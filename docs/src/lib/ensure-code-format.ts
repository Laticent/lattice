// Code formatting above the render: the code-format plugin's browser half
// (lib/plugins/code-format/, engineering/decisions/2026-10-15-code-plugin.md §6).
//
// A deck whose `@code{format}` record, or `code: format` default, asks for it has
// those blocks pretty-printed in its SOURCE before the synchronous render, exactly
// as the CLI's bake does, through the same planner and formatters — so the preview
// shows the formatted code the export prints. The formatters live beside the
// engine in the content-hashed `playground/v/<hash>/fmt/` dir (built by
// tools/build-code-format.js), and each loads only when a block in its language
// asks: a deck that formats nothing fetches nothing, not even this module's entry.
//
// NEVER REJECTS, and is bounded: a formatter that fails, or a fetch that stalls,
// leaves the source as written. The render behind this await must not wait on the
// network for longer than a fence grammar may (ensure-hljs-language.ts).
import { engineBase } from './engine-base';

const LOAD_TIMEOUT_MS = 10_000;

/** The same cheap test the plugin's `detect` makes (lib/plugins/code-format/shared/detect.mjs). */
const WANTS_FORMAT = [/`@code\{[^`\n]*\bformat\b/, /^code:[^\n]*\bformat\b/m];
export function wantsFormat(markdown: string): boolean {
	return WANTS_FORMAT.some((re) => re.test(markdown));
}

type FormatModule = {
	formatMarkdown: (markdown: string, env: { wasmUrl: (file: string) => string }) => Promise<{ markdown: string; skipped: Array<{ lang: string; line: number; error: string }> }>;
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
			if (!m) modules.delete(dir); // a failed load is retryable on the next render
			return m;
		});
	modules.set(dir, p);
	return p;
}

/**
 * The deck's source with every block that asks formatted, or the source unchanged.
 * @param base the formatter directory; defaults to the engine's `fmt/` beside it
 */
export async function formatDeckSource(markdown: string, base?: string | null): Promise<string> {
	if (typeof window === 'undefined' || !wantsFormat(markdown)) return markdown;
	const engine = engineBase();
	const dir = base ?? (engine === null ? null : `${engine}fmt/`);
	if (!dir) return markdown;
	const mod = await loadModule(dir);
	if (!mod) return markdown;
	try {
		const out = await Promise.race([
			mod.formatMarkdown(markdown, { wasmUrl: (file) => new URL(file, new URL(dir, window.location.href)).href }),
			new Promise<null>((resolve) => setTimeout(() => resolve(null), LOAD_TIMEOUT_MS)),
		]);
		return out ? out.markdown : markdown;
	} catch {
		return markdown;
	}
}

/** Test seam — drop the memoized module so a spec can re-exercise the load. */
export function __resetCodeFormatCache(): void {
	modules.clear();
}
