// The System panel's content. Pure inputs (a profile, signals, facts), so nothing here reads the
// runner's browser, machine or clock (HARD RULE #32).

import { describe, expect, it } from 'vitest';
import { classify, type DeviceSignals, REQUIRED_FEATURES } from './device-profile';
import { browserName, formatSize, type ReportInput, reportRows, reportText } from './system-report';

const ALL = Object.fromEntries(REQUIRED_FEATURES.map((f) => [f, true])) as DeviceSignals['features'];

function signals(over: Partial<DeviceSignals> = {}): DeviceSignals {
	return { features: { ...ALL }, renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)', gpuTier: null, memoryGB: 16, cores: 8, cpuScore: null, bootProbeSlow: false, ...over };
}

function input(s: DeviceSignals, over: Partial<ReportInput> = {}): ReportInput {
	return {
		profile: classify(s),
		signals: s,
		pinned: null,
		browser: 'Chrome 153',
		storage: { usage: 5 * 1024 * 1024, quota: 10 * 1024 ** 3 },
		network: { effectiveType: '4g', saveData: false },
		reducedMotion: false,
		reducedData: false,
		...over,
	};
}

const row = (rows: ReturnType<typeof reportRows>, label: string) => rows.filter((r) => r.label === label);

describe('reportRows', () => {
	it('a strong machine: Full, a reassuring reason, every device row', () => {
		const rows = reportRows(input(signals()));
		expect(row(rows, 'Tier')).toEqual([{ section: 'Tier', label: 'Tier', value: 'Full', status: 'ok' }]);
		expect(row(rows, 'Why')).toEqual([{ section: 'Tier', label: 'Why', value: 'Nothing on this device holds Lattice back.', status: 'ok' }]);
		expect(row(rows, 'Memory')[0]).toMatchObject({ value: '16 GB', status: 'ok' });
		expect(row(rows, 'Storage')[0].value).toBe('5.0 MB used of 10.0 GB');
		expect(row(rows, 'Speed test')[0]).toMatchObject({ value: 'Not run yet', status: 'unknown' });
	});

	it('a software renderer reads as Lite, says why, and marks the graphics row amber', () => {
		const sw = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';
		const rows = reportRows(input(signals({ renderer: sw })));
		expect(row(rows, 'Tier')[0]).toMatchObject({ value: 'Lite', status: 'warn' });
		expect(row(rows, 'Why')[0].value).toContain('draws in software');
		expect(row(rows, 'Why')[0].value).toBe('The browser draws in software (SwiftShader), with no graphics chip.');
		expect(row(rows, 'Graphics')[0]).toEqual({ section: 'Device', label: 'Graphics', value: 'SwiftShader (software)', detail: sw, status: 'warn' });
		expect(reportText(rows)).toContain(`  Graphics: ${sw}`);
	});

	it('unreported values are gray, never red', () => {
		const rows = reportRows(input(signals({ memoryGB: null, cores: null, renderer: '' }), { storage: null, network: null }));
		for (const label of ['Memory', 'CPU cores', 'Graphics', 'Storage', 'Network']) expect(row(rows, label)[0].status).toBe('unknown');
		expect(row(rows, 'Tier')[0].value).toBe('Full');
	});

	it('a missing feature: Unsupported, red reason, red feature row', () => {
		const rows = reportRows(input(signals({ features: { ...ALL, cssHas: false } })));
		expect(row(rows, 'Tier')[0]).toMatchObject({ value: 'Unsupported', status: 'bad' });
		expect(row(rows, 'CSS :has()')[0]).toMatchObject({ value: 'Missing', status: 'bad' });
		expect(row(rows, 'Web Workers')[0]).toMatchObject({ value: 'Supported', status: 'ok' });
	});

	it('a pinned Unsupported never sits next to a green reassurance: detection reads in gray', () => {
		const s = signals();
		const rows = reportRows(input(s, { profile: { ...classify(s), tier: 'unsupported' }, pinned: 'unsupported' }));
		expect(row(rows, 'Why')).toEqual([
			{ section: 'Tier', label: 'Why', value: 'Pinned for testing. Detection says Full.', status: 'unknown' },
			{ section: 'Tier', label: 'Why', value: 'Nothing on this device holds Lattice back.', status: 'unknown' },
		]);
	});

	it('a pinned tier says so, so a test screenshot is never mistaken for detection', () => {
		const s = signals();
		const rows = reportRows(input(s, { profile: { ...classify(s), tier: 'lite' }, pinned: 'lite' }));
		expect(row(rows, 'Tier')[0].value).toBe('Lite (pinned by ?tier=)');
	});

	it('Data Saver on a slow link is amber', () => {
		expect(row(reportRows(input(signals(), { network: { effectiveType: '2g', saveData: true } })), 'Network')[0]).toMatchObject({ value: '2g, Data Saver on', status: 'warn' });
	});

	it('a speed-test score that is a floor signal reads red', () => {
		expect(row(reportRows(input(signals({ cpuScore: 10 }))), 'Speed test')[0]).toMatchObject({ value: '10 units', status: 'bad' });
	});
});

describe('reportText', () => {
	it('is the rows as plain text, one header per section', () => {
		const text = reportText(reportRows(input(signals())));
		expect(text.split('\n').slice(0, 6)).toEqual(['Lattice system report', '', 'Tier:', '  Tier: Full', '  Why: Nothing on this device holds Lattice back.', '']);
		expect(text).toContain('Required features:\n  Web Workers: Supported');
	});
});

describe('browserName', () => {
	it.each([
		['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15', 'Safari 26.0'],
		['Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Firefox 140'],
		['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', 'Edge 153'],
		['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36', 'Chrome 153'],
		['curl/8.0', 'Unknown browser'],
	])('%s → %s', (ua, expected) => {
		expect(browserName(ua)).toBe(expected);
	});

	it('prefers UA-CH brands and skips the decoy brands', () => {
		const brands = [
			{ brand: 'Not)A;Brand', version: '99' },
			{ brand: 'Chromium', version: '153' },
			{ brand: 'Google Chrome', version: '153' },
		];
		expect(browserName('anything', brands)).toBe('Chrome 153');
	});
});

describe('formatSize', () => {
	it.each([
		[0, '0 B'],
		[1023, '1023 B'],
		[1024, '1.0 KB'],
		[1536, '1.5 KB'],
		[10 * 1024 ** 3, '10.0 GB'],
	])('%d → %s', (bytes, expected) => {
		expect(formatSize(bytes)).toBe(expected);
	});
});
