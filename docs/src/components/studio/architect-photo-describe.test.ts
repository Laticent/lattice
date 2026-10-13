import { describe, expect, it } from 'vitest';
import { languageFor } from './studio-language';
import { buildPhotoDescriptionPrompt, cleanPhotoDescription, suggestPhotoDescription } from './suggest-photo-description';

// The call itself needs a connected cloud model, so its states (no key, a model that cannot read images, a reply) are
// driven on the real Studio with OpenRouter mocked (docs/e2e/library-image-metadata.spec.ts). What is pure and
// testable here is the prompt and the cleaner that turns a reply into something safe to put in a field.
describe('buildPhotoDescriptionPrompt', () => {
	it('sends the picture as an image part, with a system contract that forbids guessing', () => {
		const msgs = buildPhotoDescriptionPrompt('data:image/jpeg;base64,AAAA');
		expect(msgs[0].role).toBe('system');
		expect(msgs[0].content).toMatch(/Never guess names, places, brands or text you cannot read/);
		expect(msgs[0].content).toMatch(/at most 20 words/);
		const parts = msgs[1].content as unknown as { type: string; image_url?: { url: string } }[];
		expect(parts.map((p) => p.type)).toEqual(['text', 'image_url']);
		expect(parts[1].image_url?.url).toBe('data:image/jpeg;base64,AAAA');
	});
});

describe('what a Suggest call sends', () => {
	it('is the thumbnail, one fixed instruction and the language, with no standing instructions of the author', () => {
		localStorage.setItem('lattice-studio-instructions', 'ALWAYS WRITE IN PIRATE VOICE, SECRET HOUSE STYLE');
		const msgs = buildPhotoDescriptionPrompt('data:image/jpeg;base64,AAAA', 'fr');
		const sent = JSON.stringify(msgs);
		expect(sent).not.toMatch(/PIRATE|STANDING INSTRUCTIONS/);
		expect(msgs).toHaveLength(2);
		expect(String(msgs[0].content)).toContain(`Write the sentence in ${languageFor('fr').label}.`);
		expect(msgs[1].content).toHaveLength(2);
	});
});

describe('cleanPhotoDescription', () => {
	it('takes the reply down to one capitalized sentence in the field', () => {
		expect(cleanPhotoDescription('  "a team on a roof at sunset"\n')).toBe('A team on a roof at sunset');
		expect(cleanPhotoDescription('Photo of two people at a workbench.')).toBe('Two people at a workbench.');
		expect(cleanPhotoDescription('An image of a red door')).toBe('A red door');
	});

	it('keeps it within the description limit, cut by characters', () => {
		const out = cleanPhotoDescription('word '.repeat(80));
		expect(Array.from(out).length).toBeLessThanOrEqual(140);
	});

	it('gives nothing for an empty or invisible-only reply, and strips hidden characters from a real one', () => {
		expect(cleanPhotoDescription('')).toBe('');
		expect(cleanPhotoDescription('​‮  \n')).toBe('');
		expect(cleanPhotoDescription('A door‮​')).toBe('A door');
	});
});

describe('suggestPhotoDescription', () => {
	it('declines anything that is not an image data URL, without asking a model', async () => {
		for (const bad of ['', 'https://x.test/a.jpg', 'data:text/html;base64,AAAA', 'javascript:alert(1)']) {
			expect(await suggestPhotoDescription(bad)).toEqual({ status: 'nochange' });
		}
	});
});
