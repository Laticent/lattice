import { describe, expect, it } from 'vitest';
import { editorChrome } from './editor-chrome.js';

// Both editors (the Studio's editor-theme.ts and the Playground's editor.js) build their content box from
// editorChrome, so the ligature switch lives here once (#3222 follow-up p2).
describe('editorChrome', () => {
	it('turns font ligatures off in the content box, so `<!--` reads as typed', () => {
		const theme = editorChrome({ fontSize: '13px', padding: '0', lineHeight: '1.6' }) as Record<string, Record<string, string>>;
		expect(theme['.cm-content'].fontVariantLigatures).toBe('none');
	});
});
