const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// THE LIBRARIES' PUBLISHED TYPES, AS A `nodenext` CONSUMER SEES THEM.
//
// Each workspace library publishes `types: ./dist/index.d.ts`, built from its TypeScript source.
// Under `moduleResolution: nodenext`, a relative import in an ES module must name its file
// (`./track.js`), so a source written `from './track'` fails the CONSUMER'S typecheck with TS2835 —
// and `skipLibCheck` cannot help, because it skips only `.d.ts` files. `@laticent/ltt` was fixed
// in #2347; Cadenza, Suono, Lente and Vetrina shared the pattern, and the step-2 PR fixed them
// (issue #2360; the publish path itself is followups.d/2360-p3-publish-workspace-libraries.md).
//
// So this does what a consumer does: `npm pack` each package, unpack it into a scratch
// node_modules, and run `tsc` over a file that imports it under nodenext. Cadenza's one dependency,
// `@laticent/ltt`, is packed and unpacked beside it, as an install would place it.

const ROOT = path.join(__dirname, '..', '..', '..');
const LIB = path.join(ROOT, 'docs', 'src', 'lib');
const TSC = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
/** Each package, and every entry it publishes: `.` and its subpaths. All nine publish
 *  (engineering/decisions/2026-10-07-first-npm-release.md). Peers a consumer brings are placed
 *  beside them from the repo's own install: React's types for Vetrina's `./react`, and
 *  `trystero` (with its `@trystero-p2p` scope, where its types live) for Tavola's
 *  `./trystero` adapter. */
const PACKAGES = {
	ltt: ['.'],
	cadenza: ['.'],
	suono: ['.'],
	lente: ['.'],
	vetrina: ['.', './react'],
	segno: ['.', './values', './read'],
	trama: ['.', './radial'],
	calco: ['.'],
	tavola: ['.', './trystero'],
};
const PEER_TYPES = ['@types/react', 'csstype', 'trystero', '@trystero-p2p'];
// A consumer's own strict settings. `skipLibCheck` skips only `.d.ts`, so while `types` pointed at
// the `.ts` source a consumer compiled our source under these and got 904 errors inside our
// packages (engineering/decisions/2026-10-08-library-trio-before-publish.md, X-1). With `types` on
// the built `dist/*.d.ts`, their settings stop reaching our code.
const STRICTEST = { noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, noPropertyAccessFromIndexSignature: true };

function pack(dir, into) {
	const out = execFileSync('npm', ['pack', '--silent', '--pack-destination', into], { cwd: dir, encoding: 'utf8' });
	return path.join(into, out.trim().split('\n').pop());
}

test('every library typechecks in a nodenext consumer, from its packed tarball', { timeout: 180000 }, () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nodenext-'));
	try {
		const consumer = path.join(tmp, 'consumer');
		fs.mkdirSync(path.join(consumer, 'node_modules', '@laticent'), { recursive: true });
		const imports = [];
		for (const name of Object.keys(PACKAGES)) {
			const tgz = pack(path.join(LIB, name), tmp);
			const dest = path.join(consumer, 'node_modules', '@laticent', name);
			fs.mkdirSync(dest, { recursive: true });
			execFileSync('tar', ['-xzf', tgz, '-C', dest, '--strip-components=1']);
			for (const entry of PACKAGES[name]) {
				const id = `${name}${entry === '.' ? '' : entry.replace(/\W/g, '_')}`;
				const spec = entry === '.' ? `@laticent/${name}` : `@laticent/${name}/${entry.slice(2)}`;
				imports.push(`import * as ${id} from '${spec}';`, `export const ${id}Keys = Object.keys(${id});`);
			}
		}
		for (const dep of PEER_TYPES) fs.cpSync(path.join(ROOT, 'node_modules', dep), path.join(consumer, 'node_modules', dep), { recursive: true });
		fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }));
		fs.writeFileSync(path.join(consumer, 'index.ts'), `${imports.join('\n')}\n`);
		fs.writeFileSync(
			path.join(consumer, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: { module: 'nodenext', moduleResolution: 'nodenext', target: 'es2022', lib: ['es2022', 'dom'], strict: true, ...STRICTEST, noEmit: true, skipLibCheck: true, types: [] },
				files: ['index.ts'],
			}),
		);
		let output = '';
		try {
			output = execFileSync(process.execPath, [TSC, '-p', consumer], { encoding: 'utf8' });
		} catch (e) {
			output = `${e.stdout || ''}${e.stderr || ''}`;
		}
		assert.equal(output.trim(), '', `a nodenext consumer cannot typecheck the published libraries:\n${output.split('\n').slice(0, 30).join('\n')}`);
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
});
