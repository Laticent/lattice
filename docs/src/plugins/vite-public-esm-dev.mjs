import fs from 'node:fs';
import path from 'node:path';

/**
 * DEV-SERVER PARITY for an ESM module under `public/` that the site loads with a runtime `import()`.
 *
 * The site loads the engine with `import(url)` on a URL `sync:playground` staged under
 * `public/playground/v/<hash>/esm/` (src/lib/load-engine.ts). On the dev server, Vite's import
 * analysis rewrites every dynamic import whose specifier is not a literal into
 * `import(__vite__injectQuery(url, 'import'))`, so the browser asks for
 * `/playground/v/<hash>/esm/engine.js?import`. Vite's public-file middleware steps aside for any
 * `?import` request, and the transform middleware then refuses the file with "This file is in
 * /public … should not be imported from source code" and a 500. The engine never loads, so the
 * Studio never paints a preview. The built site has no `?import` rewrite, so CI never sees this.
 *
 * The fix drops the `import` marker from a request whose path names a real JS file under
 * `public/`, so Vite's own public-file middleware serves it verbatim: the same bytes the built
 * site serves. The engine's own static imports between its chunks carry no marker and were
 * already served this way.
 *
 * NARROW ON PURPOSE. It touches only `.js`/`.mjs` requests that resolve to a file inside the
 * public directory, and it never transforms anything. `apply: 'serve'` keeps it out of
 * `astro build`, so it cannot change what the build emits.
 */
export default function vitePublicEsmDev() {
	return {
		name: 'lattice:public-esm-dev',
		apply: 'serve',
		configureServer(server) {
			const publicDir = server.config.publicDir;
			if (!publicDir) return;
			const root = path.resolve(publicDir);
			// Registered directly (not returned), so it runs BEFORE Vite's internal middlewares.
			server.middlewares.use((req, _res, next) => {
				const url = req.url;
				if (!url?.includes('?')) return next();
				const q = url.indexOf('?');
				const pathname = url.slice(0, q);
				if (!/\.m?js$/.test(pathname)) return next();
				const params = new URLSearchParams(url.slice(q + 1));
				if (!params.has('import')) return next();
				let file;
				try {
					file = path.resolve(root, `.${decodeURIComponent(pathname)}`);
				} catch {
					return next();
				}
				if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file)) return next();
				params.delete('import');
				const rest = params.toString();
				req.url = rest ? `${pathname}?${rest}` : pathname;
				next();
			});
		},
	};
}
