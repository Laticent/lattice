// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { type GpuRankDeps, rankGpu } from './gpu-rank';

// detect-gpu is stubbed: a test never loads its tables or fetches anything (HARD RULE #32, F6).

function lib(result: { tier: number; type: string } | Error) {
	const getGPUTier = vi.fn(async () => {
		if (result instanceof Error) throw result;
		return result;
	});
	const loadBenchmarks = vi.fn(async () => []);
	return { deps: { getGPUTier, loadBenchmarks } as unknown as GpuRankDeps, getGPUTier, loadBenchmarks };
}

describe('rankGpu', () => {
	it('passes our renderer string and our own table loader, so detect-gpu makes no context and fetches no CDN', async () => {
		const l = lib({ tier: 2, type: 'BENCHMARK' });
		expect(await rankGpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)', l.deps)).toBe(2);
		expect(l.getGPUTier).toHaveBeenCalledWith({ override: { renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)', loadBenchmarks: l.deps.loadBenchmarks } });
	});

	it("on an iPhone or iPad lets detect-gpu read the masked 'Apple GPU' itself, still with our loader", async () => {
		const l = lib({ tier: 3, type: 'BENCHMARK' });
		expect(await rankGpu('Apple GPU', { ...l.deps, appleMobile: true })).toBe(3);
		expect(l.getGPUTier).toHaveBeenCalledWith({ override: { loadBenchmarks: l.deps.loadBenchmarks } });
	});

	it("on a Mac never asks about 'Apple GPU': detect-gpu would make a context only to answer FALLBACK (review finding)", async () => {
		const l = lib({ tier: 1, type: 'FALLBACK' });
		expect(await rankGpu('Apple GPU', l.deps)).toBeNull();
		expect(l.getGPUTier).not.toHaveBeenCalled();
	});

	it('a blocklisted chip is tier 0', async () => {
		expect(await rankGpu('Some Old Chip', lib({ tier: 0, type: 'BLOCKLISTED' }).deps)).toBe(0);
	});

	it('an unknown GPU, no WebGL, a failure or a nonsense tier is null: unknown never lowers the tier', async () => {
		expect(await rankGpu('Brand New GPU 2027', lib({ tier: 1, type: 'FALLBACK' }).deps)).toBeNull();
		expect(await rankGpu('x', lib({ tier: 0, type: 'WEBGL_UNSUPPORTED' }).deps)).toBeNull();
		expect(await rankGpu('x', lib(new Error('table 404')).deps)).toBeNull();
		expect(await rankGpu('x', lib({ tier: 7, type: 'BENCHMARK' }).deps)).toBeNull();
		const l = lib({ tier: 2, type: 'BENCHMARK' });
		expect(await rankGpu(null, l.deps)).toBeNull();
		expect(l.getGPUTier).not.toHaveBeenCalled();
	});
});
