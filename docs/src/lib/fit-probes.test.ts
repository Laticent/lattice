// docs/src/lib/fit-probes.mjs: the fit probes a live measuring frame loads as a file, since the docs
// site's policy forbids eval and a preview frame inherits it.
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { FIT_PROBES_GLOBAL, fitProbesSource, fitProbesUrl, previewSlides } from './fit-probes.mjs';

const require = createRequire(import.meta.url);
const fitMeasure = require('../../../lib/core/fit-measure.js');
const mods = {
	fitMeasure,
	overflowProbe: require('../../../lib/core/overflow-probe.js'),
	tableReflowFit: require('../../../lib/core/table-reflow-fit.js'),
};
const EVAL = /new Function\(|(?:^|[^.\w$])Function\(|(?:^|[^.\w$])eval\(/;

describe('fit probes file', () => {
	it('sets one frozen global holding every probe as a function', () => {
		const window: Record<string, unknown> = {};
		vm.runInNewContext(fitProbesSource(mods), { window });
		const P = window[FIT_PROBES_GLOBAL] as Record<string, unknown>;
		expect(Object.isFrozen(P)).toBe(true);
		for (const k of ['verdict', 'measure', 'overflow', 'foldable', 'probe', 'cc', 'slides', 'forceReflow']) expect(typeof P[k], k).toBe('function');
		// The page cannot swap the probes out from under the host.
		expect(() => Object.defineProperty(window, FIT_PROBES_GLOBAL, { value: {} })).toThrow();
	});

	it('evaluates no string itself, and the verdict takes its probes as functions', () => {
		expect(fitProbesSource(mods)).not.toMatch(EVAL);
		expect(fitMeasure.FIT_VERDICT_SRC).not.toMatch(/probeSrc|ccSrc|Function\(/);
	});

	it('refuses a missing probe source instead of writing a file that defines nothing', () => {
		expect(() => fitProbesSource({ ...mods, tableReflowFit: {} })).toThrow(/no source for forceReflow/);
	});

	it('sits beside the runtime, whatever query the runtime URL carries', () => {
		expect(fitProbesUrl('/playground/v/abc/lattice-runtime.js?x=1#y')).toBe('/playground/v/abc/lattice-fit-probes.js');
	});

	it('finds top-level slides only', () => {
		const top = { parentElement: { closest: () => null } };
		const nested = { parentElement: { closest: () => ({}) } };
		expect(previewSlides({ querySelectorAll: () => [top, nested] } as unknown as Document)).toEqual([top]);
	});
});
