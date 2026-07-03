import { describe, expect, it } from 'vitest';
import { createArchitectModel } from './architect-model.js';

// Policy B — tier precedence. The Studio opts into `explicitTierWins`: a deliberate
// on-device pick outranks the connected cloud. The Drawing Board (default) keeps the
// cloud-always-wins order so a loaded local model stays dormant under a connection.
// We drive pickBackend through the public `availability().generation` using the test
// hooks (__setOpenRouter / __setUniversal) — no real backends, no network.

const readyOpenRouter = { name: 'openrouter', ready: () => true } as never;
const readyUniversal = { name: 'universal', ready: () => true } as never;

function model(explicitTierWins: boolean) {
	const m = createArchitectModel({ getSettings: () => ({}), explicitTierWins }) as {
		availability: () => { generation: string };
		setTier: (n: string) => void;
		__setOpenRouter: (b: unknown) => void;
		__setUniversal: (b: unknown) => void;
	};
	m.__setOpenRouter(readyOpenRouter);
	m.__setUniversal(readyUniversal);
	return m;
}

describe('architect-model — tier precedence (Policy B opt-in)', () => {
	it('default: the connected cloud wins even when a local tier is loaded + explicitly picked (Drawing Board behavior)', () => {
		const m = model(false);
		m.setTier('universal');
		expect(m.availability().generation).toBe('openrouter');
	});

	it('explicitTierWins: an explicit on-device pick outranks the connected cloud (Studio)', () => {
		const m = model(true);
		m.setTier('universal');
		expect(m.availability().generation).toBe('universal');
	});

	it('explicitTierWins: cloud is still the default active tier until a tier is explicitly picked', () => {
		const m = model(true);
		// tierPref starts at 'auto' — no explicit on-device pick yet.
		expect(m.availability().generation).toBe('openrouter');
	});

	it('explicitTierWins: switching back to auto resumes the cloud (the "Use Cloud" path)', () => {
		const m = model(true);
		m.setTier('universal');
		expect(m.availability().generation).toBe('universal');
		m.setTier('auto');
		expect(m.availability().generation).toBe('openrouter');
	});

	it('explicit pick only wins when that tier is actually ready', () => {
		const m = createArchitectModel({ getSettings: () => ({}), explicitTierWins: true }) as {
			availability: () => { generation: string };
			setTier: (n: string) => void;
			__setOpenRouter: (b: unknown) => void;
		};
		m.__setOpenRouter(readyOpenRouter);
		// universal NOT injected (not ready) — an explicit 'universal' pick can't win.
		m.setTier('universal');
		expect(m.availability().generation).toBe('openrouter');
	});
});
