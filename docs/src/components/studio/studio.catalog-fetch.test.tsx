import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudioShell from './StudioShell';

// The component catalog is FETCHED after hydration rather than inlined into the island's
// props (2026-08-17 loading audit §5, §9.3). That trade bought a 56% smaller HTML document
// and paid for it with a network dependency on the Studio's boot — a dependency that had
// NO test at all until the trio's checker pointed out that the whole path, including the
// retry added for it, was uncovered.
//
// What matters here is the DEGRADED state, because it is silent and wide: an empty catalog
// does not throw. It removes the Add-slide launcher entirely, empties the per-slide
// drawer's variant controls, and makes the Coach's density/bucket findings vanish so it
// reports a BETTER grade than the truth. Offline is a supported state (this is an installed
// PWA), so "failed once, degraded forever" is not acceptable.

vi.mock('@/components/DeckPreview', () => ({
	default: ({ 'aria-label': label }: { 'aria-label'?: string }) => <div data-testid="deck-preview">{label}</div>,
}));

const options = { themeBase: '/themes/', engineUrl: '/e.js', runtimeUrl: '/r.js' } as never;
const CATALOG_URL = '/studio/component-catalog.json';

/** One catalog entry, trimmed to the fields the shell actually reads. */
const entry = (name: string) => ({
	name,
	bucket: 'statement',
	function: 'assert',
	form: 'prose',
	substance: 'text',
	tags: [],
	purpose: '',
	description: '',
	summary: '',
	slots: [],
	skeleton: `<!-- _class: ${name} -->\n\n# Title`,
	variants: [],
	effectiveVariants: [],
	familyModifiers: [],
});

const realFetch = globalThis.fetch;
beforeEach(() => {
	localStorage.clear();
	vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
	vi.useRealTimers();
	globalThis.fetch = realFetch;
	vi.restoreAllMocks();
	localStorage.clear();
});

describe('StudioShell — the fetched component catalog', () => {
	it('does not fetch at all when the catalog is passed directly (the unit-test path)', () => {
		const spy = vi.fn();
		globalThis.fetch = spy as never;
		render(<StudioShell options={options} components={[entry('title')] as never} catalogUrl={CATALOG_URL} />);
		expect(spy).not.toHaveBeenCalled();
	});

	it('fetches the catalog when only a URL is given', async () => {
		const spy = vi.fn(async () => new Response(JSON.stringify([entry('title')]), { status: 200 }));
		globalThis.fetch = spy as never;
		render(<StudioShell options={options} catalogUrl={CATALOG_URL} />);
		await waitFor(() => expect(spy).toHaveBeenCalledWith(CATALOG_URL));
	});

	it('RETRIES after a rejected fetch instead of degrading for the tab lifetime', async () => {
		const spy = vi
			.fn()
			.mockRejectedValueOnce(new TypeError('offline'))
			.mockResolvedValue(new Response(JSON.stringify([entry('title')]), { status: 200 }));
		globalThis.fetch = spy as never;
		render(<StudioShell options={options} catalogUrl={CATALOG_URL} />);
		await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
		// Backoff is 1s on the first failure.
		await vi.advanceTimersByTimeAsync(1100);
		await waitFor(() => expect(spy.mock.calls.length).toBeGreaterThan(1));
	});

	it('RETRIES on a non-ok response (a stale deploy 404s the versionless asset)', async () => {
		const spy = vi
			.fn()
			.mockResolvedValueOnce(new Response('nope', { status: 404 }))
			.mockResolvedValue(new Response(JSON.stringify([entry('title')]), { status: 200 }));
		globalThis.fetch = spy as never;
		render(<StudioShell options={options} catalogUrl={CATALOG_URL} />);
		await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
		await vi.advanceTimersByTimeAsync(1100);
		await waitFor(() => expect(spy.mock.calls.length).toBeGreaterThan(1));
	});

	it('gives up after a bounded number of attempts rather than hammering a dead network', async () => {
		const spy = vi.fn().mockRejectedValue(new TypeError('offline'));
		globalThis.fetch = spy as never;
		render(<StudioShell options={options} catalogUrl={CATALOG_URL} />);
		// Drive to CONVERGENCE rather than assuming a schedule. Each cycle is timer → state →
		// re-render → effect → fetch → rejection → next timer, so a fixed advance can sample
		// mid-cycle and read one call short. Loop until the count stops moving; the property
		// under test is that it stops at all.
		let previous = -1;
		let settled = spy.mock.calls.length;
		for (let i = 0; i < 20 && settled !== previous; i++) {
			previous = settled;
			await vi.advanceTimersByTimeAsync(30_000);
			settled = spy.mock.calls.length;
		}
		expect(settled).toBe(previous); // converged — retries are bounded
		// …and bounded SMALL. An unbounded retry on a dead network would run away here.
		expect(settled).toBeLessThanOrEqual(5);
	});

	it('still renders the Studio while the catalog is absent — degraded, not broken', async () => {
		globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('offline')) as never;
		render(<StudioShell options={options} catalogUrl={CATALOG_URL} />);
		// The shell is usable with no catalog at all; only catalog-fed affordances are missing.
		await waitFor(() => expect(screen.getByTestId('deck-preview')).toBeInTheDocument());
	});
});
