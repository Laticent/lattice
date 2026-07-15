import { describe, expect, it } from 'vitest';
// The chart narrators + slideToSpeech now live once in lib/core (HARD RULE #1) and
// reach the browser via the read-along-core bundle — the SAME module Present and the
// export import. The exhaustive behavior ORACLE is test/unit/core/chart-narration.test.js
// (node:test, run against the CJS source). This suite is the BROWSER-WIRING smoke test:
// it drives the generated bundle Present actually loads, so a stale/broken bundle (the
// narrators missing, or the freshness gate skipped) fails here rather than silently
// shipping thin captions. Keep it small — new narrator behavior is pinned in the oracle.
import {
	narrateChart,
	narrateDiagram,
	narrateFunnel,
	narrateJourneyWeighted,
	narrateQuadrant,
	narrateRadar,
	narrateStateChart,
	slideToSpeech,
} from '@/playground/read-along-core.generated.js';

describe('read-along-core bundle exposes the shared narration kernel', () => {
	it('slideToSpeech flattens a slide to readable prose', () => {
		expect(slideToSpeech('## Revenue is up\n\nWe grew 40% this quarter.')).toBe('Revenue is up. We grew 40% this quarter.');
	});

	it('narrateFunnel speaks the computed conversion %', () => {
		const out = narrateFunnel('<!-- _class: funnel -->\n\n## Stages.\n\n- A `100`\n- B `50`');
		expect(out).toContain('fifty percent');
	});

	it('narrateJourneyWeighted speaks each task volume share', () => {
		const md = ['<!-- _class: journey weighted -->', '', '## X.', '', '- Stage', '  - A `@me` `:3` `+9`', '  - B `@me` `:3` `+1`'].join('\n');
		expect(narrateJourneyWeighted(md)).toContain('ninety percent');
	});

	it('narrateRadar speaks the auto-fit scale', () => {
		const md = ['<!-- _class: radar -->', '', '## X.', '', '- Lattice', '  - Performance `9`'].join('\n');
		expect(narrateRadar(md)).toContain('scale of zero to ten');
	});

	it('narrateQuadrant speaks the auto-fit axis ranges', () => {
		const md = ['<!-- _class: quadrant -->', '', '## X.', '', '- Group', '  - Item `3, 70`'].join('\n');
		expect(narrateQuadrant(md)).toContain('The vertical axis runs zero to one hundred');
	});

	it('narrateStateChart infers start/terminal states', () => {
		const md = ['<!-- _class: state-chart -->', '', '## Flow.', '', '1. Draft', '   - `submit => 2`', '2. Done'].join('\n');
		expect(narrateStateChart(md)).toContain('This flow starts at Draft.');
	});

	it('narrateDiagram speaks a flowchart, sequence, class, and pie diagram, bails on not-yet-supported types', () => {
		const flow = ['<!-- _class: diagram -->', '', '## Flow.', '', '```mermaid', 'flowchart LR', '  A[Start] --> B[End]', '```'].join('\n');
		expect(narrateDiagram(flow)).toContain('Start leads to End.');
		const seq = ['<!-- _class: diagram -->', '', '## Seq.', '', '```mermaid', 'sequenceDiagram', '  A->>B: score', '```'].join('\n');
		expect(narrateDiagram(seq)).toContain('A sends to B: score.');
		// slice #2: the typed-relationship diagrams speak the Mermaid-defined verb (the §2 asymmetry)
		const cls = ['<!-- _class: diagram -->', '', '## Class.', '', '```mermaid', 'classDiagram', '  Animal <|-- Dog', '```'].join('\n');
		expect(narrateDiagram(cls)).toContain('Dog inherits from Animal.');
		const pie = ['<!-- _class: diagram -->', '', '## Pie.', '', '```mermaid', 'pie', '  "A" : 40', '  "B" : 60', '```'].join('\n');
		expect(narrateDiagram(pie)).toContain('B, sixty percent.');
		// §17 hardening reaches the shipped bundle: a zero-value slice renders (not the old `<= 0` bail),
		// and an accTitle statement is skipped instead of dropping the whole diagram to heading-only.
		const zeroPie = ['<!-- _class: diagram -->', '', '## Pie.', '', '```mermaid', 'pie', '  accTitle: Shares', '  "A" : 0', '  "B" : 50', '```'].join('\n');
		expect(narrateDiagram(zeroPie)).toContain('A, zero percent.');
		const radar = ['<!-- _class: diagram -->', '', '## Radar.', '', '```mermaid', 'radar-beta', '  axis a["Speed"], b["Power"]', '  curve c["Car"]{3, 7}', '```'].join('\n');
		expect(narrateDiagram(radar)).toContain('Car: Speed, three; Power, seven.');
		const xy = ['<!-- _class: diagram -->', '', '## XY.', '', '```mermaid', 'xychart-beta', '  x-axis [jan, feb]', '  bar [5, 6]', '```'].join('\n');
		expect(narrateDiagram(xy)).toContain('The bar series: jan, five; feb, six.');
		const mind = ['<!-- _class: diagram -->', '', '## Mind.', '', '```mermaid', 'mindmap', '  root', '```'].join('\n');
		expect(narrateDiagram(mind)).toBeNull();
	});

	it('narrateChart dispatches to the first matching narrator', () => {
		expect(narrateChart('<!-- _class: funnel -->\n\n## Stages.\n\n- A `100`\n- B `50`')).toContain('fifty percent');
		expect(narrateChart('<!-- _class: kpi -->\n\n## Revenue\n\nWe grew.')).toBeNull();
	});
});
