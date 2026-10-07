// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import generated from '../../../../lib/motion/scenes.generated.js';
import { ART_MAX_BYTES } from './motion/limits';
import { posterFits, slideSkeleton } from './motion/skeleton';
import { listShippedScenes, shippedDrawing } from './shipped-scenes';

const rows = (generated as unknown as { MOTION_SCENES: { name: string; poster?: string; art?: string }[] }).MOTION_SCENES;

describe('the shipped motion library (lib/motion/)', () => {
	it('lists every generated scene: none is dropped by parseScene', async () => {
		const shipped = await listShippedScenes();
		expect(rows.length).toBeGreaterThan(0);
		expect(shipped.map((s) => s.name)).toEqual(rows.map((r) => r.name));
	});

	it('every drawing is already clean: the sanitizer the Library runs changes nothing', async () => {
		// A shipped drawing the sanitizer rewrites would render differently in the Library than
		// in the repo's own files, and the difference would be a reviewed file nobody can see.
		const shipped = await listShippedScenes();
		for (const s of shipped) {
			const row = rows.find((r) => r.name === s.name);
			expect(s.poster, `${s.name} poster`).toBe(row?.poster);
			expect(s.art, `${s.name} art`).toBe(row?.art);
		}
	});

	it('Insert writes a scene slide for each: heading, one-line poster, the anima fence', async () => {
		for (const s of await listShippedScenes()) {
			const art = shippedDrawing(s);
			expect(art, s.name).toBeTruthy();
			expect(posterFits({ label: s.label, description: s.description, art: art as string }), `${s.name} poster over ${ART_MAX_BYTES} bytes`).toBe(true);
			const md = slideSkeleton({ label: s.label, description: s.description, art: art as string, spec: s.spec });
			const lines = md.split('\n');
			expect(lines[0]).toBe('<!-- _class: scene -->');
			expect(lines).toContain(`## ${s.label}`);
			const svg = lines.find((l) => l.startsWith('<svg'));
			expect(svg, s.name).toBeTruthy();
			expect(svg).toContain(`<title>${s.label}</title>`);
			expect(md).toContain('```anima\n');
			const fence = /```anima\n([\s\S]*?)\n```/.exec(md)?.[1] ?? '';
			expect(JSON.parse(fence).source).toBe(s.spec.source);
		}
	});

	it('an svg scene inserts as a COPY: fresh ids, and the fence addresses the copy', async () => {
		const s = (await listShippedScenes()).find((x) => x.spec.source === 'svg');
		expect(s).toBeTruthy();
		if (!s || s.spec.source !== 'svg') return;
		const md = slideSkeleton({ label: s.label, description: s.description, art: shippedDrawing(s) as string, spec: s.spec });
		const fence = JSON.parse(/```anima\n([\s\S]*?)\n```/.exec(md)?.[1] ?? '{}');
		const ids = [...md.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
		for (const el of fence.elements) expect(ids).toContain(el.pathRef);
		// The shipped namespace is not reused, so two inserts never share an id.
		const shippedNs = /data-lattice-motion="([^"]+)"/.exec(s.art ?? '')?.[1];
		expect(shippedNs).toBeTruthy();
		expect(md).not.toContain(`id="${shippedNs}-`);
	});
});
