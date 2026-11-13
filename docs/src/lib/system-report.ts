// The System diagnostic panel's content, as a PURE function: the device profile plus the few extra
// facts the panel shows (storage, network, preferences) in, display rows and a plain-text report out.
// The panel (SystemOverlay.tsx) only reads the browser and draws these rows, so everything a person
// reads is unit-tested here without a browser (HARD RULE #32). Design:
// engineering/decisions/2026-11-12-device-capability-tiers.md §5.

import { type DeviceSignals, FEATURE_LABEL, isSoftwareRenderer, type Profile, REQUIRED_FEATURES, shortRenderer, type Tier } from './device-profile';

export type RowStatus = 'ok' | 'warn' | 'bad' | 'unknown';

export interface ReportRow {
	section: 'Tier' | 'Device' | 'Storage & network' | 'Preferences' | 'Required features';
	label: string;
	value: string;
	/** The full value, when `value` is shortened for the panel. The copied report uses it. */
	detail?: string;
	status: RowStatus;
}

export interface ReportInput {
	profile: Profile;
	signals: DeviceSignals;
	/** Where a pinned tier came from, when one was pinned (`?tier=`). */
	pinned: Tier | null;
	/** Human-readable browser name and version, e.g. "Chrome 153". */
	browser: string;
	storage: { usage: number; quota: number } | null;
	network: { effectiveType?: string; saveData?: boolean } | null;
	reducedMotion: boolean;
	reducedData: boolean;
	/** Where the app's GPU rank stands (device-tier.ts). Omitted: ranked when `signals.gpuTier` is set, else not measured yet. */
	gpuRank?: 'pending' | 'ranked' | 'unknown' | 'none';
}

/**
 * The GPU rank row's words when there is no rank: the row always shows, so a missing rank is never mistaken for a missing
 * feature. `unknown` covers every way detect-gpu can answer without a tier (a chip newer than its tables, a Mac's masked
 * "Apple GPU", Save-Data, a failed table fetch), so its words claim none of those causes in particular (the card grader's
 * finding: "not in its tables" was false for the other three).
 */
const GPU_RANK_WHY: Record<'pending' | 'unknown' | 'none', string> = {
	pending: 'Not measured yet',
	unknown: "Unknown: detect-gpu couldn't rank this chip",
	none: 'Not ranked: no WebGL',
};

export const TIER_LABEL: Record<Tier, string> = { full: 'Full', lite: 'Lite', unsupported: 'Unsupported' };

/** "Chrome 153" from UA-CH brands when present, else from the UA string. For people only; nothing decides on it. */
export function browserName(ua: string, brands?: readonly { brand: string; version: string }[]): string {
	const real = brands?.find((b) => !/Not.?A.?Brand|Chromium/i.test(b.brand));
	if (real) return `${real.brand.replace(/^Google /, '')} ${real.version}`;
	const rules: [RegExp, string, string?][] = [
		// Every iOS browser is WebKit underneath and names itself with its own token, with no `Version/`, `Chrome/` or
		// `Firefox/` for the rules below to find (the owner's iPhone read "Unknown browser" in both, 2026-11-13).
		[/EdgiOS\/(\d+)/, 'Edge', ' (iOS)'],
		[/CriOS\/(\d+)/, 'Chrome', ' (iOS)'],
		[/FxiOS\/(\d+)/, 'Firefox', ' (iOS)'],
		[/Edg\/(\d+)/, 'Edge'],
		[/Firefox\/(\d+)/, 'Firefox'],
		[/Chrome\/(\d+)/, 'Chrome'],
		[/Version\/(\d+(?:\.\d+)?).*Safari\//, 'Safari'],
	];
	for (const [re, name, suffix = ''] of rules) {
		const m = ua.match(re);
		if (m) return `${name} ${m[1]}${suffix}`;
	}
	return 'Unknown browser';
}

/** Bytes as a short human string (base 1024, one decimal above KB). */
export function formatSize(bytes: number): string {
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let v = bytes;
	let i = 0;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}
	return i === 0 ? `${v} B` : `${v.toFixed(1)} ${units[i]}`;
}

const tierStatus = (t: Tier): RowStatus => (t === 'full' ? 'ok' : t === 'lite' ? 'warn' : 'bad');
const reasonStatus = (profile: Profile, code: string): RowStatus => {
	const r = profile.reasons.find((x) => x.code.endsWith(`:${code}`));
	return r ? (r.kind === 'weak' ? 'warn' : 'bad') : 'ok';
};

export function reportRows(input: ReportInput): ReportRow[] {
	const { profile, signals: s } = input;
	const rows: ReportRow[] = [];

	let tierValue = TIER_LABEL[profile.tier];
	if (input.pinned) tierValue += ' (pinned by ?tier=)';
	else if (profile.tier !== profile.detected) tierValue += ` (detected: ${TIER_LABEL[profile.detected]})`;
	rows.push({ section: 'Tier', label: 'Tier', value: tierValue, status: tierStatus(profile.tier) });
	// Pinned, the tier is the URL's, not the device's: say so, and show what detection found in gray, so a pinned
	// "Unsupported" never sits next to a green "nothing holds Lattice back".
	if (input.pinned) rows.push({ section: 'Tier', label: 'Why', value: `Pinned for testing. Detection says ${TIER_LABEL[profile.detected]}.`, status: 'unknown' });
	if (profile.reasons.length === 0) rows.push({ section: 'Tier', label: 'Why', value: 'Nothing on this device holds Lattice back.', status: input.pinned ? 'unknown' : 'ok' });
	for (const r of profile.reasons) rows.push({ section: 'Tier', label: 'Why', value: r.text, status: input.pinned ? 'unknown' : r.kind === 'weak' ? 'warn' : 'bad' });

	rows.push({ section: 'Device', label: 'Browser', value: input.browser, status: 'unknown' });
	rows.push({
		section: 'Device',
		label: 'Graphics',
		value: s.renderer === null ? 'No WebGL' : s.renderer === '' ? 'Not reported' : `${shortRenderer(s.renderer)}${isSoftwareRenderer(s.renderer) ? ' (software)' : ''}`,
		...(s.renderer && shortRenderer(s.renderer) !== s.renderer ? { detail: s.renderer } : {}),
		status: s.renderer === '' ? 'unknown' : reasonStatus(profile, 'gpu'),
	});
	const rank = s.gpuTier !== null ? 'ranked' : (input.gpuRank ?? 'pending');
	rows.push(
		rank === 'ranked' && s.gpuTier !== null
			? { section: 'Device', label: 'GPU rank', value: `Tier ${s.gpuTier} of 3`, status: reasonStatus(profile, 'gpu') }
			: {
					section: 'Device',
					label: 'GPU rank',
					// A software renderer is not a chip to rank; it already counts as its own signal (the Graphics row).
					value: rank === 'unknown' && isSoftwareRenderer(s.renderer) ? 'Not ranked: software renderer' : GPU_RANK_WHY[rank === 'ranked' ? 'pending' : rank],
					status: 'unknown',
				},
	);
	rows.push({ section: 'Device', label: 'Memory', value: s.memoryGB === null ? 'Not reported by this browser' : `${s.memoryGB} GB`, status: s.memoryGB === null ? 'unknown' : reasonStatus(profile, 'memory') });
	rows.push({ section: 'Device', label: 'CPU cores', value: s.cores === null ? 'Not reported, or clamped by this browser' : String(s.cores), status: s.cores === null ? 'unknown' : reasonStatus(profile, 'cores') });
	rows.push({ section: 'Device', label: 'Speed test', value: s.cpuScore === null ? 'Not run yet' : `${s.cpuScore} units`, status: s.cpuScore === null ? 'unknown' : reasonStatus(profile, 'cpu') });

	rows.push({
		section: 'Storage & network',
		label: 'Storage',
		value: input.storage ? `${formatSize(input.storage.usage)} used of ${formatSize(input.storage.quota)}` : 'Not reported by this browser',
		status: 'unknown',
	});
	const net = input.network;
	rows.push({
		section: 'Storage & network',
		label: 'Network',
		value: net?.effectiveType ? `${net.effectiveType}${net.saveData ? ', Data Saver on' : ''}` : 'Not reported by this browser',
		status: net?.saveData || net?.effectiveType === '2g' || net?.effectiveType === 'slow-2g' ? 'warn' : 'unknown',
	});

	rows.push({ section: 'Preferences', label: 'Reduced motion', value: input.reducedMotion ? 'On' : 'Off', status: 'unknown' });
	rows.push({ section: 'Preferences', label: 'Reduced data', value: input.reducedData ? 'On' : 'Off', status: 'unknown' });

	for (const f of REQUIRED_FEATURES) {
		rows.push({ section: 'Required features', label: FEATURE_LABEL[f], value: s.features[f] ? 'Supported' : 'Missing', status: s.features[f] ? 'ok' : 'bad' });
	}
	return rows;
}

/** The whole panel as plain text, for "Copy report". */
export function reportText(rows: readonly ReportRow[]): string {
	const out: string[] = ['Lattice system report'];
	let section = '';
	for (const r of rows) {
		if (r.section !== section) {
			section = r.section;
			out.push('', `${section}:`);
		}
		out.push(`  ${r.label}: ${r.detail ?? r.value}`);
	}
	return out.join('\n');
}
