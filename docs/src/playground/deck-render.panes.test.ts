import { describe, expect, it } from 'vitest';
import { paneComponentsSig } from './deck-render.js';

// The preview patches slides in place only while its content signature holds. The engine's sheet
// carries a pane twin of each component shown in a pane, so the signature must change when a deck
// gains a pane or a pane changes component — or the new pane renders with the old sheet.
describe('paneComponentsSig', () => {
	it('is empty for a deck with no pane', () => {
		expect(paneComponentsSig(['<section class="content"><p>x</p></section>'])).toBe('');
	});
	it('names each component shown in a pane, once, sorted', () => {
		const sec = '<section class="lat-pane-host"><lat-pane class="list form" data-pane="list"></lat-pane><lat-pane class="bar form chart-frame" data-pane="bar"></lat-pane></section>';
		expect(paneComponentsSig([sec, sec])).toBe('bar,chart-frame,form,list');
	});
	it('changes when a pane gains a modifier, which reaches its own rules', () => {
		expect(paneComponentsSig(['<lat-pane class="list form"></lat-pane>'])).not.toBe(paneComponentsSig(['<lat-pane class="list takeaway form"></lat-pane>']));
	});
	it('never reads a data-class', () => {
		expect(paneComponentsSig(['<lat-pane data-class="evil" class="list"></lat-pane>'])).toBe('list');
	});
	it('changes when a pane changes what it holds', () => {
		const a = '<lat-pane class="list form"></lat-pane><lat-pane class="bar form"></lat-pane>';
		const b = '<lat-pane class="table form"></lat-pane><lat-pane class="bar form"></lat-pane>';
		expect(paneComponentsSig([a])).not.toBe(paneComponentsSig([b]));
	});
});
