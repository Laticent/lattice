// The Studio component catalog, served as a static asset instead of inlined into the
// page's island props (2026-08-17 loading audit §5, §9.3). Prerendered by `astro build`
// to `dist/studio/component-catalog.json`; StudioShell fetches it after hydration.
import { buildStudioCatalog } from '@/lib/studio-catalog.mjs';

export const prerender = true;

export function GET() {
	return new Response(JSON.stringify(buildStudioCatalog()), {
		headers: { 'content-type': 'application/json; charset=utf-8' },
	});
}
