// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { formatCodeNotice, runFormatCode } from './studio-commands';

describe('runFormatCode', () => {
	it('says the editor is still loading when it is not built yet, instead of doing nothing', () => {
		const notify = vi.fn();
		runFormatCode(null, notify);
		runFormatCode(undefined, notify);
		expect(notify).toHaveBeenCalledTimes(2);
		expect(notify).toHaveBeenCalledWith('The editor is still loading. Try again in a moment.');
	});

	it('reports what the editor did once it has', async () => {
		const notify = vi.fn();
		const result = { changes: [{}, {}], skipped: [] };
		runFormatCode({ formatCode: () => Promise.resolve(result) }, notify);
		await Promise.resolve();
		await Promise.resolve();
		expect(notify).toHaveBeenCalledWith(formatCodeNotice(result));
		expect(notify).toHaveBeenCalledWith('Formatted 2 code blocks.');
	});
});
