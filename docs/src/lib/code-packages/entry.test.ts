// The door's front step (entry.ts): with no code package it loads nothing and renders exactly as the
// engine does; the first package loads the door, and the door takes over the render.
import { describe, expect, it, vi } from 'vitest';
import { codePackagesStamp, renderWithCodePackages, setCodePackages } from './entry';

const code = 'function t(s){return s.html}\nexport { t as default };\n';

describe('the code-package door loads on the first package', () => {
	it('before any package: the engine render, without the door flag, and no stamp', async () => {
		const seen: unknown[] = [];
		const PG = {
			render: (_s: string, _t: string, o?: Record<string, unknown>) => {
				seen.push(o);
				return { html: '<section></section>' };
			},
		};
		await setCodePackages([]);
		const out = await renderWithCodePackages(PG, '# x', 'indaco', { codeStatus: true, baseUrl: 'b/' });
		expect(out.html).toBe('<section></section>');
		expect(seen).toEqual([{ baseUrl: 'b/' }]);
		expect(codePackagesStamp()).toBe('');
	});

	it('a package loads the door, which stamps it and takes the render', async () => {
		await setCodePackages([{ name: 'acme', code }]);
		expect(codePackagesStamp()).toMatch(/^\/\* lattice code packages: acme@[0-9a-f]{16}- \*\/$/);
		const opts: unknown[] = [];
		const PG = {
			render: (_s: string, _t: string, o?: Record<string, unknown>) => {
				opts.push(o);
				return { html: '<section></section>' };
			},
		};
		await renderWithCodePackages(PG, '# x', 'indaco', undefined);
		// The door's first render carries the capture hook: the door, not the front step, rendered.
		expect(typeof (opts[0] as { codePackages?: unknown }).codePackages).toBe('function');
		await setCodePackages([]);
		expect(codePackagesStamp()).toBe('');
	});

	it('a removal made while the door is loading wins over the list before it', async () => {
		// A fresh module, so the door has not loaded yet: the Library held a package, then dropped
		// it before the door's chunk arrived (the checker's race, PR #2411).
		vi.resetModules();
		const fresh = await import('./entry');
		const first = fresh.setCodePackages([{ name: 'acme', code }]);
		const second = fresh.setCodePackages([]);
		await Promise.all([first, second]);
		expect(fresh.codePackagesStamp()).toBe('');
	});
});
