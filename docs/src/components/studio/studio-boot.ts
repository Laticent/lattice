// The island's FIRST module: starts the engine download the moment the island's code is in.
//
// ES modules evaluate depth-first in import order, and none evaluates until the whole graph has
// been fetched. This file is the first import of `StudioIsland.tsx`, so it runs after the last
// island request lands and before React, CodeMirror and the 7,900-line shell begin their
// seconds of evaluation. Before this, the engine was requested when the preview mounted, behind
// all of that evaluation: the network sat idle for about two seconds on the phone profile and
// the first slide then waited a further round trip for the engine.
//
// It is NOT a `<link rel="modulepreload">` in the HTML. That form was measured and was slower:
// it competes with the island's own ~120 requests for the throttled link at the start of the load
// (engineering/decisions/2026-10-22-studio-startup-regression.md § Tried and measured). Starting
// here begins the download when the link is free. `ensureEngine` is a singleton keyed by URL, so
// the preview's later call joins this one.
import { ensureEngine } from '@/lib/load-engine';
import { createThemeFetcher } from '@/lib/theme-fetch';

// The page writes these URLs at build time as absolute paths on its own origin (`/playground/v/<hash>/...`). Text read
// back out of the DOM is checked rather than trusted: only a plain absolute path is used, so a value carrying markup, a
// scheme or a host is dropped and the shell loads that asset at mount, as before.
const PLAIN_PATH = /^\/[A-Za-z0-9._~\-/]*$/;
const plainPath = (u: unknown): string | undefined => (typeof u === 'string' && PLAIN_PATH.test(u) && !u.startsWith('//') ? u : undefined);

try {
	const el = document.querySelector('script[data-studio-boot]');
	const raw = JSON.parse(el?.textContent ?? '{}') as Record<string, unknown> | null;
	const engineUrl = plainPath(raw?.engineUrl);
	const themeBase = plainPath(raw?.themeBase);
	const runtimeUrl = plainPath(raw?.runtimeUrl);
	// A failure here is the preview's to report: its own `ensureEngine` call retries (the loader
	// un-caches a failed import) and shows the error state.
	if (engineUrl) void ensureEngine(engineUrl).catch(() => {});
	// The base theme sheet (about 1MB raw) is fetched into the fetcher's shared per-`themeBase` cache, the
	// one the preview's own fetcher reads, so the preview finds it already arrived. Fetched only:
	// registering it waits for the engine, and the preview does that.
	// The preview runtime (1.25MB, 447KB gzipped) is used only inside the preview frame, once the
	// engine has rendered. The page used to prefetch it from the HTML, where it shared the throttled
	// link with the island's own code. A prefetch hint keeps the lowest priority and the cache entry the frame's
	// `<script src>` reads.
	if (runtimeUrl) {
		const link = document.createElement('link');
		link.setAttribute('rel', 'prefetch');
		link.setAttribute('as', 'script');
		link.setAttribute('href', runtimeUrl);
		document.head.appendChild(link);
	}
	if (themeBase) void createThemeFetcher(themeBase).fetch('lattice').catch(() => {});
} catch {
	// Malformed boot data: the shell loads the engine at mount, as before.
}
