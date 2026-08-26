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
import { declaredProfile, PROFILE_NAMES, PROFILES, withProfile } from '../../../../lib/authoring/deck-profiles.js';
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

// THE ADOPTION PATH, pinned at the seam the Coach button drives.
//
// Profiles are declared-only and nothing is inferred — correct, and measured (inference
// made 40 of 46 decks WORSE than abstaining). But the Coach's control was a session-only
// LENS that never wrote front matter, so the register could be discovered and never kept:
// reload, and the score reverts; the CLI and anyone the deck is shared with never see the
// choice at all. Measured consequence — strip the declaration from the two decks that
// reported the original bug and they score Style 55 and 54, rank 1 of 198, exactly the
// position they were in before the change. The whole recovery was two lines of front
// matter a human happened to add.
//
// `applyProfileToSource` in coach-core reaches `withProfile` in the shared kernel. The
// kernel transform has its own unit tests; what this pins is that the panel and the kernel
// agree about EVERY profile the dropdown can offer — so a profile the control can select
// but the writer cannot persist fails here rather than in a user's front matter.
describe('the Coach can persist every profile it offers', () => {
	const deck = '---\nmarp: true\ntheme: indaco\n---\n\n<!-- _class: title -->\n\n# A deck\n\nA framing line.\n';

	it('writes a declaration the engine reads back, for each dropdown entry', () => {
		for (const [key] of DECK_PROFILE_CHOICES) {
			const next = withProfile(deck, key);
			expect(next).not.toBe(deck);
			expect(declaredProfile(next)).toBe(key);
		}
	});

	it('replaces rather than stacks, so keeping twice leaves one declaration', () => {
		const once = withProfile(deck, 'teaching');
		const twice = withProfile(once, 'mission');
		expect(twice.match(/^profile:/gm)?.length).toBe(1);
		expect(declaredProfile(twice)).toBe('mission');
	});

	it('is a no-op for a name the dropdown cannot produce, so a bad call cannot strand a deck', () => {
		for (const bad of ['', 'nonsense', '__proto__', 'constructor']) {
			expect(withProfile(deck, bad)).toBe(deck);
		}
	});
});
