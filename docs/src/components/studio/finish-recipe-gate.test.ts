import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateFinishCss, PRESET_RECIPES } from './finish-generate';

// HARD gate against recipe↔engine DRIFT (decision doc §"A subsumption that isn't
// gated will rot"). The faculty's "Start from preset" mirror (PRESET_RECIPES) and
// the rendered truth (lib/base/base.finish.css `section.finish-<name>`) are two
// expressions of the same five presets. Nothing else forces them to agree — retune a
// preset's CSS and the recipe silently diverges (or vice-versa). This test runs each
// recipe through the deterministic generator and asserts:
//   (1) the EMITTED `--fin-*` slot names are a SUBSET of the compositor's var(--fin-*)
//       reads in base.finish.css — so the generator can never emit a slot the engine
//       doesn't blend (a dead slot), and adding an engine slot stays visible here; and
//   (2) the per-preset LAYER STRUCTURE matches — which of wash/texture/mark/edge are
//       active (non-`none`), and the texture layer COUNT (grid = 2 repeating gradients,
//       everything else = 1) — between the generated recipe CSS and the preset's CSS.

// vitest runs with cwd = docs/; the engine CSS is the repo's lib/base/base.finish.css.
const baseFinishCss = readFileSync(resolve(process.cwd(), '../lib/base/base.finish.css'), 'utf8');

// Every distinct `--fin-*` custom property the compositor (base.finish.css) READS via
// var(). The generator's emitted slot names must be a subset of this.
function compositorReads(css: string): Set<string> {
	const out = new Set<string>();
	for (const m of css.matchAll(/var\((--fin-[a-z0-9-]+)/g)) out.add(m[1]);
	return out;
}

// Every `--fin-*` custom property the generator DECLARES (a `--fin-x:` declaration),
// across both faces of a generated rule.
function emittedSlots(css: string): Set<string> {
	const out = new Set<string>();
	for (const m of css.matchAll(/(--fin-[a-z0-9-]+)\s*:/g)) out.add(m[1]);
	return out;
}

// The RICH (screen) block of a generated rule — the part before the first @media.
const screenBlock = (css: string): string => css.slice(0, css.indexOf('@media print'));

// Pull the `section.finish-<name> { … }` declaration block out of base.finish.css.
function presetBlock(name: string): string {
	const re = new RegExp(`section\\.finish-${name}\\s*\\{([\\s\\S]*?)\\n\\}`);
	const m = re.exec(baseFinishCss);
	if (!m) throw new Error(`no section.finish-${name} block in base.finish.css`);
	return m[1];
}

// Read a slot's value out of a declaration block (first match), or '' if absent.
function slot(block: string, name: string): string {
	const m = new RegExp(`${name}\\s*:\\s*([\\s\\S]*?);`).exec(block);
	return (m?.[1] ?? '').trim();
}

// Is a field/edge layer ACTIVE (a real gradient, not the `none` no-op)?
const active = (v: string): boolean => v !== '' && v !== 'none';

// The texture layer COUNT — comma-separated background-image layers. A `grid` is two
// repeating-linear-gradients; the rest are one; `none` is zero. Counted by top-level
// commas (commas inside color-mix()/gradient parens don't separate layers).
function layerCount(v: string): number {
	if (!active(v)) return 0;
	let depth = 0;
	let count = 1;
	for (const ch of v) {
		if (ch === '(') depth++;
		else if (ch === ')') depth--;
		else if (ch === ',' && depth === 0) count++;
	}
	return count;
}

// The structural fingerprint of a finish: which layers are on + the texture count.
// An edge is active either as a background gradient (--fin-edge) OR as the `frame`
// type's solid inset-keyline box-shadow (--fin-frame) — the frame is drawn on the
// SECTION via box-shadow, not the ::after pseudo (the engine reserves ::after for
// the pagination marker), so its edge presence lives in the --fin-frame slot.
function structure(block: string) {
	return {
		wash: active(slot(block, '--fin-wash')),
		texture: active(slot(block, '--fin-texture')),
		mark: active(slot(block, '--fin-mark')) || slot(block, '--fin-mark-text').replace(/["']/g, '') !== '',
		edge: active(slot(block, '--fin-edge')) || active(slot(block, '--fin-frame')),
		textureLayers: layerCount(slot(block, '--fin-texture')),
	};
}

describe('finish recipe ↔ engine gate (no silent drift)', () => {
	it('every emitted --fin-* slot is read by the compositor (no dead/undriven slot)', () => {
		const reads = compositorReads(baseFinishCss);
		for (const name of Object.keys(PRESET_RECIPES)) {
			const emitted = emittedSlots(generateFinishCss(name, PRESET_RECIPES[name]));
			for (const s of emitted) {
				expect(reads.has(s), `generator emits ${s} but base.finish.css never reads var(${s}) — drift`).toBe(true);
			}
		}
	});

	for (const name of Object.keys(PRESET_RECIPES)) {
		it(`preset "${name}" recipe matches base.finish.css layer structure`, () => {
			const generated = structure(screenBlock(generateFinishCss(name, PRESET_RECIPES[name])));
			const engine = structure(presetBlock(name));
			expect(generated.wash, `${name}: wash active mismatch`).toBe(engine.wash);
			expect(generated.texture, `${name}: texture active mismatch`).toBe(engine.texture);
			expect(generated.mark, `${name}: mark active mismatch`).toBe(engine.mark);
			expect(generated.edge, `${name}: edge active mismatch`).toBe(engine.edge);
			expect(generated.textureLayers, `${name}: texture layer COUNT mismatch`).toBe(engine.textureLayers);
		});
	}
});
