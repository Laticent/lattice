// The lint core has ONE door (authoring-door.js). It switches the lint core's boundary parser to the
// deck's plugin admission as the module evaluates, so a reader that imported the generated file
// directly would bypass that switch and could parse on a stale grammar. Tests may import it directly.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { setLintBoundaryOff } from './lint-boundary-state.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED = new Set(['playground/authoring-door.js']);

function walk(dir: string, out: string[] = []): string[] {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) walk(p, out);
		else if (/\.(ts|tsx|js|mjs|astro)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
	}
	return out;
}

describe('the lint door', () => {
	it('is the only importer of authoring-core.generated.js outside tests', () => {
		const importer = /(?:from\s*|import\s*\(\s*|import\s+)['"][^'"]*authoring-core\.generated\.js['"]/;
		const offenders = walk(SRC)
			.map((f) => path.relative(SRC, f).split(path.sep).join('/'))
			.filter((rel) => !ALLOWED.has(rel) && importer.test(fs.readFileSync(path.join(SRC, rel), 'utf8')));
		expect(offenders, 'import @/playground/authoring-door.js instead').toEqual([]);
	});

	it('switches the lint core as it loads, and follows every later change', async () => {
		const generated = await import('./authoring-core.generated.js');
		const g0 = generated.boundaryRulesGeneration();
		setLintBoundaryOff(['math']); // recorded: the door has not loaded yet
		expect(generated.boundaryRulesGeneration(), 'nothing reaches the lint core before the door').toBe(g0);
		const door = await import('./authoring-door.js');
		expect(door.lintCore).toBe(generated.lintCore);
		expect(generated.boundaryRulesGeneration(), 'the door applied the recorded set as it loaded').toBe(g0 + 1);
		setLintBoundaryOff([]);
		expect(generated.boundaryRulesGeneration(), 'a later change reaches the loaded copy').toBe(g0 + 2);
	});
});
