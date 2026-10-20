// A deck that holds a function-plot fence warms the previews' draw host before its first render
// (docs/src/lib/render-engine.ts `PLOT_FENCE_WORDS`). The words are a copy of the plugin's fence names, so this pins them.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLOT_FENCE_WORDS } from './render-engine';

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../lib/plugins/function-plot/function-plot.manifest.json'), 'utf8')) as {
	contributes: { fences: Record<string, { aliases?: Array<{ name: string }> }> };
};

describe('the plot warm-up words', () => {
	it('are exactly the plugin\'s fence names and aliases', () => {
		const names = Object.entries(manifest.contributes.fences).flatMap(([name, f]) => [name, ...(f.aliases ?? []).map((a) => a.name)]);
		expect([...PLOT_FENCE_WORDS].sort()).toEqual(names.sort());
	});
});
