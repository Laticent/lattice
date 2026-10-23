// A deck that holds a figure a sandboxed draw frame draws warms the previews' draw host before its first render
// (docs/src/lib/render-engine.ts, from the patterns the registry build writes: lib/plugins/draw-warm.generated.mjs). The patterns are
// built from each plugin's declared fences and aliases, so this pins that they say so for EVERY plugin that declares `draw`, not for two named ones.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DRAW_KINDS } from '../../../lib/plugins/draw-kinds.generated.mjs';
import { DRAW_WARM } from '../../../lib/plugins/draw-warm.generated.mjs';

const PLUGINS = path.join(__dirname, '../../../lib/plugins');
const manifestOf = (name: string) => {
	const dir = fs.readdirSync(PLUGINS).find((d) => fs.existsSync(path.join(PLUGINS, d, `${name}.manifest.json`)));
	if (!dir) throw new Error(`no manifest for ${name}`);
	return JSON.parse(fs.readFileSync(path.join(PLUGINS, dir, `${name}.manifest.json`), 'utf8')) as {
		draw?: unknown;
		contributes: { fences: Record<string, { aliases?: Array<{ name: string }> }> };
	};
};

describe('the draw warm-up patterns', () => {
	it('cover exactly the plugins that declare draw', () => {
		expect(Object.keys(DRAW_WARM).sort()).toEqual([...DRAW_KINDS].sort());
		for (const kind of DRAW_KINDS) expect(manifestOf(kind).draw).toBeTruthy();
	});

	it("match each plugin's fence names and aliases at the start of a line, and not prose that names them", () => {
		for (const kind of DRAW_KINDS) {
			const re = new RegExp((DRAW_WARM as Record<string, string>)[kind], 'm');
			const m = manifestOf(kind);
			const names = Object.entries(m.contributes.fences).flatMap(([name, f]) => [name, ...(f.aliases ?? []).map((a) => a.name)]);
			expect(names.length).toBeGreaterThan(0);
			for (const name of names) {
				expect(re.test(`# A slide\n\n\`\`\`${name}\nbody\n\`\`\`\n`), `${kind}: fence ${name}`).toBe(true);
				expect(re.test(`a sentence that mentions ${name} in prose`), `${kind}: prose ${name}`).toBe(false);
			}
		}
	});
});
