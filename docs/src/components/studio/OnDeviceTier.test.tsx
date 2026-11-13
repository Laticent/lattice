import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./architect', () => ({ loadUniversalModel: vi.fn(), setStudioTier: vi.fn(), summonWebLLM: vi.fn() }));

import type { ArchitectStatus } from './architect';
import { OnDeviceTier } from './OnDeviceTier';

// The on-device chat models on a LITE device (engineering/decisions/2026-11-12-device-capability-tiers.md §4.2): the two
// downloads stay listed, disabled, with the reason; the browser's built-in model, which downloads nothing, stays usable.
// The tier is set on <html> by hand, so the runner's own machine never decides (HARD RULE #32).

const status = { promptApi: 'available', webgpu: true, webllmReady: false, universalReady: false, readiness: null } as unknown as ArchitectStatus;

afterEach(() => document.documentElement.removeAttribute('data-device-tier'));

describe('OnDeviceTier and the device tier', () => {
	it('on LITE disables the WebLLM and Transformers.js downloads and says why; the built-in model stays usable', () => {
		document.documentElement.setAttribute('data-device-tier', 'lite');
		render(<OnDeviceTier status={status} />);
		expect(screen.getAllByText(/^Off in Lite mode/)).toHaveLength(2);
		expect(screen.getByRole('button', { name: 'Get ~1GB' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Get ~350MB' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Use' })).toBeEnabled();
	});

	it('on FULL offers both downloads', () => {
		document.documentElement.setAttribute('data-device-tier', 'full');
		render(<OnDeviceTier status={status} />);
		expect(screen.queryByText(/^Off in Lite mode/)).toBeNull();
		expect(screen.getByRole('button', { name: 'Get ~1GB' })).toBeEnabled();
		expect(screen.getByRole('button', { name: 'Get ~350MB' })).toBeEnabled();
	});
});
