// The front-matter VALUE LISTS: every fixed-vocabulary register's words, from the lint vocab where the
// engine publishes one and from the engine's settings table otherwise. Shared by the Studio's editor
// completion (components/studio/editor-complete.ts re-exports them) and the docs front-matter
// reference, so the reference page reads the same lists without importing the editor.

import sizes from '../../../lib/core/sizes.js';
import { OFFERED_SETTINGS } from './front-matter-keys';

// The front-matter keys whose VALUE vocabulary the engine publishes in the lint vocab
// (lib/authoring/lint.js `buildVocab`) — key → vocab field, read off the engine's table
// (lib/core/deck-settings.js `vocab`). Reading the engine's own list means the editor can
// never offer a value the linter then flags, or miss one it accepts. `theme:` is completed
// from the deck's palettes (built-in AND saved, 1c below), `pace:` from its own catalog (1e),
// `finish:` from the built-in and saved finishes (3).
const OWN_VALUE_SOURCES = new Set(['theme', 'pace', 'finish']);
export const VOCAB_VALUE_FIELDS: Record<string, string> = Object.fromEntries(
	OFFERED_SETTINGS.filter((r) => r.vocab && !OWN_VALUE_SOURCES.has(r.key)).map((r) => [r.key, r.vocab as string]),
);

// Keys whose value list the table holds itself (`values`, or `complete` where the reader is
// looser than a closed list — `validate:` takes any falsey word). These were STATIC_VALUES, a
// list only the editor knew; they moved into the engine so the linter warns on the same set the
// editor offers. Plugin registers (`icon:`, `avatar:`) carry their axes' words, and `size:`
// offers the engine's size registry, aliases included, since the registry accepts both.
const STATIC_VALUES: Record<string, string[]> = {
	...Object.fromEntries(OFFERED_SETTINGS.filter((r) => !r.vocab && (r.values || r.complete)).map((r) => [r.key, [...((r.complete || r.values) as readonly string[])]])),
	size: Object.keys(sizes.SIZES),
};

/**
 * The key → value-list map the editor completes against: every fixed-vocabulary register,
 * from the lint vocab where the engine publishes one and from the table otherwise.
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
