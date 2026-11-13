// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AGENDA_AXES, agendaOptions, agendaValue, parseAgenda } from './agenda';

describe('agenda (the `agenda:` register)', () => {
	it('mirrors the engine register: every axis, word and order', async () => {
		const kernel = await import('../../../../lib/core/resolve-agenda.js');
		const axes: readonly { axis: string; names: readonly string[] }[] = kernel.AGENDA_REGISTER.AXES;
		expect(AGENDA_AXES.map((a) => [a.axis, [...a.names]])).toEqual(axes.map((a) => [a.axis, [...a.names]]));
	});

	it('reads one word per axis, any order; ignores the unknown and a second word on an axis', () => {
		expect(parseAgenda('no-pages checks')).toEqual({ style: 'checks', pages: 'no-pages' });
		expect(parseAgenda('rail circles checks')).toEqual({ style: 'circles' });
		expect(parseAgenda('')).toEqual({});
	});

	it('writes axis order and drops every default word, so an all-default agenda has no line', () => {
		expect(agendaValue({ pages: 'no-pages', style: 'circles' })).toBe('circles no-pages');
		expect(agendaValue({ style: 'ledger', pages: 'pages' })).toBe('');
	});

	it('offers each axis its non-default words', () => {
		expect(agendaOptions('style')).toEqual(['circles', 'checks']);
		expect(agendaOptions('pages')).toEqual(['no-pages']);
	});
});
