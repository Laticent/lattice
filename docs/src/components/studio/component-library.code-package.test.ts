// @vitest-environment node
// Editing an imported CODE package in a faculty keeps what makes it runnable: its transform AND its
// manifest's `"facts"` declaration (lib/packages/code-shape.mjs factsRefusal). The faculties save with
// an id and no package carry; keeping the transform alone dropped the declaration, so the edited
// component was refused on its next render and its export was refused on re-import (the checker,
// #2459). Reproduced first, then fixed.
import { expect, it, vi } from 'vitest';

const store = new Map<string, Record<string, unknown>>();
vi.mock('@/components/studio/library/asset-store.js', () => ({
	putAsset: vi.fn(async (a: Record<string, unknown>) => {
		const id = (a.id as string) ?? 'id-1';
		const r = { ...a, id };
		store.set(id, r);
		return r;
	}),
	getAsset: vi.fn(async (id: string) => store.get(id) ?? null),
	listAssets: vi.fn(async () => [...store.values()]),
	deleteAsset: vi.fn(async () => {}),
}));

const { saveStudioComponent } = await import('./component-library');
const { componentPackage } = await import('./package-zip');

it('a faculty edit of an imported code package keeps its transform and its facts declaration, and exports them', async () => {
	const transform = 'function t(s){return s.html}export{t as default};';
	const manifest = { name: 'tally', type: 'component', format: 1, facts: 1 };
	const first = await saveStudioComponent({ name: 'tally', css: 'section.tally{}', skeleton: '<!-- _class: tally -->', pkg: { manifest, files: { 'transform.js': transform } } });
	// The faculty's save: an id, the edited CSS, and no package carry.
	const edited = await saveStudioComponent({ id: first.id, name: 'tally', css: 'section.tally{color:red}', skeleton: '<!-- _class: tally -->', meta: {} });
	expect(edited.pkg?.files?.['transform.js']).toBe(transform);
	expect(edited.pkg?.manifest?.facts).toBe(1);
	const exported = JSON.parse(componentPackage(edited).files['tally.manifest.json'] as string);
	expect(exported.facts).toBe(1);
});
