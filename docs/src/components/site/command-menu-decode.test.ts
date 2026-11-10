import { describe, expect, it } from 'vitest';
import { decodeEntities } from './CommandMenu';

// A Pagefind excerpt is shown in the ⌘K menu AND spoken as the row's description, so its entities
// must be decoded, or VoiceOver reads "don&#39;t" aloud.
describe('decodeEntities', () => {
	it('decodes named and numeric entities', () => {
		expect(decodeEntities('don&#39;t &amp; won&#x27;t &lt;b&gt; &quot;x&quot;')).toBe('don\'t & won\'t <b> "x"');
	});
	it('leaves unknown names and plain text alone', () => {
		expect(decodeEntities('&bogus; A & B')).toBe('&bogus; A & B');
	});
});
