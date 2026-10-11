// The front-matter VALUE LISTS: every fixed-vocabulary register's words, from the lint vocab where the
// engine publishes one and from STATIC_VALUES otherwise. Shared by the Studio's editor completion
// (components/studio/editor-complete.ts re-exports them) and the docs front-matter reference.

import { MOTION_SPEED_ENTRIES, MOTION_STYLE_ENTRIES } from './motion-catalog';

export const VOCAB_VALUE_FIELDS: Record<string, string> = {
	cards: 'cardsNames',
	fit: 'fitNames',
	claim: 'claimNames',
	corners: 'cornersNames',
	mode: 'modeNames',
	'color-mode': 'colorModeNames',
	split: 'splitNames',
	spectrum: 'spectrumNames',
	'spectrum-edge': 'spectrumEdgeNames',
	'spectrum-card': 'spectrumCardNames',
	'spectrum-card-edge': 'spectrumCardEdgeNames',
	'spectrum-trim': 'spectrumTrimNames',
	rule: 'ruleNames',
	eyebrow: 'eyebrowNames',
	headline: 'headlineNames',
	lift: 'liftNames',
	backdrop: 'backdropNames',
	tag: 'tagNames',
	spark: 'sparkNames',
	venue: 'venueNames',
	'chart-finish': 'chartFinishNames',
	preset: 'presetNames',
	delivery: 'deliveryNames',
	'inline-code': 'inlineCodeNames',
	stamp: 'stampStyleNames',
	tone: 'toneStyleNames',
};

// Keys with a small fixed vocabulary that the lint vocab does not carry. Each list is the
// values its reader accepts: motion-style / motion-speed come from the Inspector's own
// catalog, and `player-motion` offers only `off` because resolve-motion.mjs reads nothing
// else (omitting the key follows `motion:`).
const ON_OFF = ['on', 'off'];
const TRUE_FALSE = ['true', 'false'];
const STATIC_VALUES: Record<string, string[]> = {
	motion: ON_OFF,
	'motion-style': MOTION_STYLE_ENTRIES.map((e) => e.name),
	'motion-speed': MOTION_SPEED_ENTRIES.map((e) => e.name),
	'player-motion': ['off'],
	paginate: TRUE_FALSE,
	glossary: ['auto', 'off'],
	validate: ON_OFF,
	'logo-on': ['all', 'title'],
	'logo-style': ['auto', 'brand'],
	present: TRUE_FALSE,
	read: TRUE_FALSE,
	fluid: TRUE_FALSE,
	player: TRUE_FALSE,
};

/**
 * The key → value-list map the editor completes against: every fixed-vocabulary register,
 * from the lint vocab where the engine publishes one and from STATIC_VALUES otherwise.
 * Exported so the Editor builds it once per vocab and a test can assert coverage.
 */
export function registerValueLists(vocab: Record<string, unknown> | null | undefined): Record<string, string[]> {
	const out: Record<string, string[]> = { ...STATIC_VALUES };
	for (const [key, field] of Object.entries(VOCAB_VALUE_FIELDS)) {
		const names = vocab?.[field];
		if (Array.isArray(names) && names.length) out[key] = names.map(String);
	}
	return out;
}
