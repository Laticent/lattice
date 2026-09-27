import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ROT-GUARD for `vite-cjs-lib-dev.mjs`: a browser source in `docs/src` takes a CommonJS file
 * under `lib/` by DEFAULT import only.
 *
 * The dev-server shim offers `default` and nothing else, so a named import off a CJS leaf
 * (`import { fromBase64 } from '…/lib/core/base64-utf8.js'`) throws "does not provide an export
 * named …" the moment the module loads on `npm run dev`. `astro build` interops it fine, so the
 * built-site smoke job never sees it. It happened three times: the Studio island (#2119), the
 * webpage export's diagram bake, which then shipped raw Mermaid source, and the whole Compose
 * view (`state-marks.js`, `fence-languages.js`).
 *
 * Tests are exempt: vitest runs under Node, where a named import off CJS works.
 */

const DOCS_SRC = path.resolve(import.meta.dirname, '..');
const REPO = path.resolve(DOCS_SRC, '..', '..');
const LIB = `${path.join(REPO, 'lib')}${path.sep}`;

function sources(dir: string, out: string[] = []): string[] {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) sources(p, out);
		else if (/\.(?:[cm]?js|tsx?|astro)$/.test(e.name) && !/\.(?:test|spec)\./.test(e.name)) out.push(p);
	}
	return out;
}

/** The same test the shim applies: assigns `module.exports` and speaks no ESM. */
function isCjs(file: string): boolean {
	const src = fs.readFileSync(file, 'utf8');
	return /^\s*module\.exports\s*=/m.test(src) && !/^\s*(?:export|import)\s/m.test(src);
}

// `import X from`, `import { a } from`, `import X, { a } from`, `import * as X from` — one
// statement, possibly spanning lines. `import type` is erased before the browser sees it.
const IMPORT = /^import\s+(?!type\s)([^'";]*?)\s+from\s+['"]([^'"]+)['"]/gm;

describe('docs/src imports CommonJS lib/ files by default import only', () => {
	it('has no named or namespace import off a CJS leaf', () => {
		const offenders: string[] = [];
		let checked = 0;
		for (const file of sources(DOCS_SRC)) {
			const src = fs.readFileSync(file, 'utf8');
			for (const m of src.matchAll(IMPORT)) {
				const target = path.resolve(path.dirname(file), m[2]);
				if (!target.startsWith(LIB) || !target.endsWith('.js') || !fs.existsSync(target) || !isCjs(target)) continue;
				checked++;
				const clause = m[1].trim();
				if (!/^[A-Za-z_$][\w$]*$/.test(clause)) offenders.push(`${path.relative(REPO, file)}: import ${clause} from '${m[2]}'`);
			}
		}
		// The scan has to be finding something, or the pass means nothing.
		expect(checked).toBeGreaterThan(10);
		expect(offenders, 'use `import x from …` then `const { a } = x;`').toEqual([]);
	});
});
