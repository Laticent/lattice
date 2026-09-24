// The `_class:` completion's modifier registry, served as a static asset rather than
// inlined into the Studio page (the route's HTML budget, docs/route-budget.json, and
// the loading audit's reason for serving the catalog the same way:
// engineering/decisions/2026-08-17-studio-dynamic-loading-audit.md §5). Prerendered by
// `astro build` to `dist/studio/modifier-vocab.json`; StudioShell fetches it beside the
// component catalog. Until it arrives, completion falls back to the flat universal list.
// See engineering/decisions/2026-09-24-positional-class-completion.md.
import { createRequire } from 'node:module';
import { join } from 'node:path';

export const prerender = true;

export function GET() {
	let body: { modifierGroups: unknown[]; exclusiveAxes: Record<string, string[]> } = { modifierGroups: [], exclusiveAxes: {} };
	try {
		const require = createRequire(import.meta.url);
		const { buildVocab } = require(join(process.cwd(), '..', 'lib/authoring', 'lint.js'));
		const v = buildVocab();
		body = { modifierGroups: v.modifierGroups || [], exclusiveAxes: v.exclusiveAxes || {} };
	} catch {
		// An empty registry degrades completion to the flat universal list; nothing breaks.
	}
	return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json; charset=utf-8' } });
}
