/**
 * The Playground injects the dagre layout engine only for a deck with a graph chart the
 * browser pass draws: a state chart's default variant (`data-sc-model`) or any flowchart
 * (`data-fc-model`). renderDeck decides it from the sanitized sections and hands buildSrcdoc
 * the answer, so a check keyed on an attribute the charts no longer write would drop the
 * engine silently: the charts would lay out on the grid with nothing to say why.
 */

import { describe, expect, it } from 'vitest';
import { renderDeck } from './deck-render.js';

function blankFrame() {
	let srcdoc = '';
	const frame = {
		contentDocument: null,
		contentWindow: {},
		get srcdoc() {
			return srcdoc;
		},
		set srcdoc(v: string) {
			srcdoc = v;
		},
	};
	return frame as unknown as HTMLIFrameElement & { srcdoc: string };
}

const DAGRE = '/lattice-dagre-min.js';
const base = { css: '', mode: 'light', geom: { w: 1280, h: 720 }, runtimeUrl: '/r.js', dagreUrl: DAGRE, sig: 'indaco|light|1280x720' };
const write = (html: string) => {
	const frame = blankFrame();
	renderDeck({ ...base, frame, html, state: { frameSig: '', lastSections: null } });
	return frame.srcdoc;
};

describe('renderDeck injects dagre for a drawn graph chart, and only then', () => {
	it('a v2 state chart', () => {
		expect(write('<section><figure class="state-chart-figure" data-sc-model="{}"></figure></section>')).toContain(DAGRE);
	});

	it('a flowchart', () => {
		expect(write('<section><figure class="flowchart-figure" data-fc-model="{}"></figure></section>')).toContain(DAGRE);
	});

	it('a virtual filmstrip whose chart is outside the first window: the WHOLE deck decides', () => {
		const plain = Array.from({ length: 12 }, (_, i) => `<section><h1>Slide ${i + 1}</h1></section>`).join('');
		const frame = blankFrame();
		const html = `${plain}<section><figure class="state-chart-figure" data-sc-model="{}"></figure></section>`;
		renderDeck({ ...base, frame, html, virtual: true, state: { frameSig: '', lastSections: null } });
		expect(frame.srcdoc).not.toContain('data-sc-model');
		expect(frame.srcdoc).toContain(DAGRE);
	});

	it('a deck with neither', () => {
		expect(write('<section><h1>Plain</h1></section>')).not.toContain(DAGRE);
	});
});
