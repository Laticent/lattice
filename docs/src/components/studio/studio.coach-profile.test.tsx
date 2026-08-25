// The pin a comment in StudioShell.tsx used to CLAIM existed.
//
// It said: "Mirrors lib/authoring/deck-profiles.js PROFILES; a pinned test asserts the
// two lists stay in step, because a profile the engine grades but the panel cannot name
// is one a human can never correct." No such test existed — deleting the `teaching`
// entry from the dropdown (the one profile the whole feature exists for) left the suite
// green. An independent review caught the comment asserting a gate that wasn't there.
//
// This is that gate. It reads the engine's own PROFILE_NAMES rather than restating the
// list, so adding a profile to the engine and forgetting the panel fails here.
import { describe, expect, it } from 'vitest';
import { PROFILE_NAMES, PROFILES } from '../../../../lib/authoring/deck-profiles.js';
import { DECK_PROFILE_CHOICES } from './StudioShell';

describe('the Coach profile control mirrors the engine', () => {
	it('offers exactly the profiles the engine grades', () => {
		expect(DECK_PROFILE_CHOICES.map(([key]: [string, string]) => key).sort()).toEqual([...PROFILE_NAMES].sort());
	});

	it('labels each one the way the engine labels it', () => {
		for (const [key, label] of DECK_PROFILE_CHOICES) {
			expect(label).toBe(PROFILES[key as keyof typeof PROFILES].label);
		}
	});
});
