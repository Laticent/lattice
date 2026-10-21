import fs from 'node:fs';
import path from 'node:path';

/**
 * DEV-SERVER PARITY for the CommonJS modules in `lib/` that an ESM module imports.
 *
 * Vite's dev server assumes every SOURCE file is ESM — its CommonJS→ESM interop runs
 * in the dep optimizer (node_modules only) and in the Rollup build, never on a source
 * file fetched over `/@fs`. So `lib/core/front-matter-key.js` (CJS) is served verbatim,
 * and `lib/core/resolve-motion.mjs`'s `import frontMatterKey from './front-matter-key.js'`
 * dies with "does not provide an export named 'default'" — which takes the whole Studio
 * island down with it (#2119). The production build is Rollup, which interops a DEFAULT
 * import off a CJS file fine, so CI's built-site smoke job never sees this.
 *
 * `optimizeDeps.include` does not fix it: measured, the optimizer does not redirect a
 * RELATIVE import that resolves outside the Vite root, so the raw `/@fs` request stands.
 * `@rollup/plugin-commonjs` would, at the cost of a new docs dependency for a dev-only
 * paper cut; this is the same interop in fifteen lines, applied to nothing else.
 *
 * DELIBERATELY NARROW. It handles the one shape that actually occurs — a leaf module
 * that assigns `module.exports` and requires nothing itself — plus ONE extension: a module
 * whose every `require(` names a sibling leaf of that same shape (`./x` in the same folder,
 * itself require-free), which is inlined at the call site. That is `remote-ref.js` reading
 * its URL table from `media-sources.js`. It REFUSES anything else with its own `require(`,
 * because faithfully resolving a require graph is the job of the real plugin, not of a shim. A refusal fails exactly the way today fails, loudly, at
 * the import site: better than a shim that silently half-loads a module.
 *
 * `apply: 'serve'` scopes it to the dev server. The built site never sees this plugin,
 * so it cannot mask a build-time interop problem.
 */
const REQUIRE = /\brequire\s*\(/;
const REQUIRE_SIBLING = /\brequire\(\s*(['"])\.\/([A-Za-z0-9_.-]+?)(?:\.js)?\1\s*\)/g;
const IS_CJS_LEAF = (src) => /^\s*module\.exports\s*=/m.test(src) && !REQUIRE.test(src) && !/^\s*(?:export|import)\s/m.test(src);
const wrapModule = (src) => `(() => {\nconst module = { exports: {} };\nconst exports = module.exports;\n${src}\nreturn module.exports;\n})()`;

/**
 * Inline every `require('./sibling')` in `src` with that sibling's body, or return null when any
 * `require(` is not exactly that shape (a sibling that is missing, ESM, or requires something).
 */
export function inlineSiblingLeaves(src, dir) {
	let refused = false;
	const out = src.replace(REQUIRE_SIBLING, (_whole, _q, name) => {
		let sibling;
		try {
			sibling = fs.readFileSync(path.join(dir, `${name}.js`), 'utf8');
		} catch {
			refused = true;
			return '';
		}
		if (!IS_CJS_LEAF(sibling)) refused = true;
		return wrapModule(sibling);
	});
	return refused || REQUIRE.test(out) ? null : out;
}

export default function viteCjsLibDev(repoRoot) {
	// Vite ids use POSIX separators on every platform, so compare in that shape rather than
	// with `path.sep` — on Windows the raw comparison silently never matches and the plugin
	// would be inert exactly where it is needed.
	const libDir = `${path.join(repoRoot, 'lib').split(path.sep).join('/')}/`;
	return {
		name: 'lattice:cjs-lib-dev',
		apply: 'serve',
		enforce: 'pre',
		load(id) {
			const file = id.split('?')[0].split(path.sep).join('/');
			if (!file.startsWith(libDir) || !file.endsWith('.js')) return null;
			let src;
			try {
				src = fs.readFileSync(file, 'utf8');
			} catch {
				return null;
			}
			if (!/^\s*module\.exports\s*=/m.test(src)) return null;
			if (REQUIRE.test(src)) {
				const inlined = inlineSiblingLeaves(src, path.dirname(file));
				if (inlined === null) return null;
				src = inlined;
			}
			// REFUSE anything that already speaks ESM. The `module.exports` match is a regex,
			// so it can fire on a template literal or a block comment inside a module that is
			// really ESM — and wrapping one of those would append a SECOND `export default`
			// and fail to parse. No file under `lib/` trips this today; the guard is here so
			// that if one ever does, it fails the way it fails now (loudly, at the import
			// site) instead of in the parser.
			if (/^\s*(?:export|import)\s/m.test(src)) return null;
			// The CJS preamble a browser has no globals for, then the module body
			// verbatim, then the interop export shape Rollup and Node both produce:
			// `default` is `module.exports`. Named exports are deliberately NOT
			// re-emitted — `resolve-pace.mjs`'s header records that Rollup will not
			// resolve those off a CJS file, so offering them in dev only would let a
			// named import pass here and fail `astro build`.
			return `const module = { exports: {} };\nconst exports = module.exports;\n${src}\nexport default module.exports;\n`;
		},
	};
}
