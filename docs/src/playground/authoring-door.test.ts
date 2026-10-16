// The lint core has ONE door (authoring-door.js). Its loadAuthoring() switches the lint core's boundary
// parser to the deck's plugin admission before handing it over, so a reader that reached the lint core
// any other way would bypass that switch and could parse on a stale grammar. In the browser the lint
// core is esm/lint.js, reached through lint-core-source.js; in vitest it is authoring-core.generated.js.
// Tests may import the generated file directly.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { setLintBoundaryOff } from './lint-boundary-state.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir: string, out: string[] = []): string[] {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) walk(p, out);
		else if (/\.(ts|tsx|js|mjs|astro)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
	}
	return out;
}

describe('the lint door', () => {
	it('is the only way into the lint core outside tests, in the browser and in vitest', () => {
		// Each way in, and the one module allowed to use it.
		const ways: [RegExp, string][] = [
			[/(?:from\s*|import\s*\(\s*|import\s+)['"][^'"]*authoring-core\.generated\.js['"]/, 'playground/lint-core-source.vitest.js'],
			[/(?:from\s*|import\s*\(\s*|import\s+)['"][^'"]*lint-core-source(?:\.vitest)?\.js['"]/, 'playground/authoring-door.js'],
			[/['"`][^'"`]*esm\/lint\.js['"`]/, 'playground/lint-core-source.js'],
		];
		// Code only: the modules that explain the door name these files in their comments.
		const code = new Map(
			walk(SRC).map((f) => [
				path.relative(SRC, f).split(path.sep).join('/'),
				fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, '$1'),
			]),
		);
		for (const [way, allowed] of ways) {
			const offenders = [...code].filter(([rel, src]) => rel !== allowed && way.test(src)).map(([rel]) => rel);
			expect(offenders, `${way} — import @/playground/authoring-door.js and call loadAuthoring() instead`).toEqual([]);
		}
	});

	it('switches the lint core as it loads, and follows every later change', async () => {
		const generated = await import('./authoring-core.generated.js');
		const g0 = generated.boundaryRulesGeneration();
		setLintBoundaryOff(['math']); // recorded: the door has not loaded yet
		expect(generated.boundaryRulesGeneration(), 'nothing reaches the lint core before the door').toBe(g0);
		const door = await import('./authoring-door.js');
		expect(() => door.authoring(), 'a synchronous read before the load throws, not guesses').toThrow(/has not loaded/);
		const core = await door.loadAuthoring();
		expect(core.lintCore).toBe(generated.lintCore);
		expect(door.authoring()).toBe(core);
		expect(generated.boundaryRulesGeneration(), 'the door applied the recorded set as it loaded').toBe(g0 + 1);
		setLintBoundaryOff([]);
		expect(generated.boundaryRulesGeneration(), 'a later change reaches the loaded copy').toBe(g0 + 2);
	});

	it('has no top-level await, which makes Rolldown split the Studio startup into 57 more chunks', () => {
		// Comments and string literals stripped, the door says `await` nowhere at all.
		const code = fs
			.readFileSync(path.join(SRC, 'playground/authoring-door.js'), 'utf8')
			.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
			.replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
		expect(code).not.toMatch(/\bawait\b/);
	});
});
