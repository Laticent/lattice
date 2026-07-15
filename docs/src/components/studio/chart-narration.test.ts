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

	it('narrateDiagram speaks a flowchart topology and a sequence script, bails on unsupported types', () => {
		const flow = ['<!-- _class: diagram -->', '', '## Flow.', '', '```mermaid', 'flowchart LR', '  A[Start] --> B[End]', '```'].join('\n');
		expect(narrateDiagram(flow)).toContain('Start leads to End.');
		const seq = ['<!-- _class: diagram -->', '', '## Seq.', '', '```mermaid', 'sequenceDiagram', '  A->>B: score', '```'].join('\n');
		expect(narrateDiagram(seq)).toContain('A sends to B: score.');
		const cls = ['<!-- _class: diagram -->', '', '## Class.', '', '```mermaid', 'classDiagram', '  A <|-- B', '```'].join('\n');
		expect(narrateDiagram(cls)).toBeNull();
	});

	it('narrateChart dispatches to the first matching narrator', () => {
		expect(narrateChart('<!-- _class: funnel -->\n\n## Stages.\n\n- A `100`\n- B `50`')).toContain('fifty percent');
		expect(narrateChart('<!-- _class: kpi -->\n\n## Revenue\n\nWe grew.')).toBeNull();
	});
});
