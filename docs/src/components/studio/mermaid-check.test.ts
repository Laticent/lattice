import { describe, expect, it } from 'vitest';
import { extractDiagrams } from './mermaid-check';

// The extraction half is pure, so it is tested headless; the parse half needs the real
// Mermaid library and is exercised by the Studio, not here.
describe('extractDiagrams — finding the diagrams to check', () => {
	const T = '`'.repeat(3);

	it('addresses diagrams by the same 1-based REAL slide number everything else uses', () => {
		const deck = `---\ntheme: cuoio\n---\n\n# Title\n\n---\n\n## Flow\n\n${T}mermaid\nflowchart TD\n  A --> B\n${T}\n`;
		const found = extractDiagrams(deck);
		expect(found).toHaveLength(1);
		expect(found[0].slide).toBe(2); // front matter excluded — not slide 3
		expect(found[0].code).toBe('flowchart TD\n  A --> B');
	});

	it('finds several diagrams across several slides', () => {
		const deck = `# One\n\n${T}mermaid\ngraph TD\n  A\n${T}\n\n---\n\n# Two\n\n${T}mermaid\nsequenceDiagram\n  A->>B: hi\n${T}\n`;
		expect(extractDiagrams(deck).map((d) => d.slide)).toEqual([1, 2]);
	});

	it('ignores a NON-mermaid fence', () => {
		expect(extractDiagrams(`# One\n\n${T}chart\nbar\n10\n${T}\n`)).toHaveLength(0);
	});

	it('reads a tilde-fenced diagram too', () => {
		const found = extractDiagrams('# One\n\n~~~mermaid\ngraph TD\n  A\n~~~\n');
		expect(found).toHaveLength(1);
		expect(found[0].code).toBe('graph TD\n  A');
	});

	it("does not treat a diagram's own --- front matter as a slide boundary", () => {
		// The fence-aware splitter is what keeps this diagram on slide 1 rather than
		// desyncing every slide number after it.
		const deck = `# One\n\n${T}mermaid\n---\ntitle: Flow\n---\nflowchart TD\n  A --> B\n${T}\n\n---\n\n# Two\n`;
		const found = extractDiagrams(deck);
		expect(found).toHaveLength(1);
		expect(found[0].slide).toBe(1);
		expect(found[0].code).toContain('title: Flow');
	});

	it('skips an empty fence and a deck with no diagrams', () => {
		expect(extractDiagrams(`# One\n\n${T}mermaid\n${T}\n`)).toHaveLength(0);
		expect(extractDiagrams('# Just prose')).toHaveLength(0);
	});
});

// The message the model is grounded in. Mermaid's raw error is four lines, two of which
// are ASCII caret art; the useful ends are the FIRST (where) and the "Expecting" line
// (what). These are the real strings the library produced, captured from a live parse.
describe('parseErrorMessage — keeping the diagnosis, not just the location', () => {
	it('keeps both the location and the expectation', async () => {
		const raw = "Parse error on line 3:\n...ass Order {    +id\n---------------------^\nExpecting 'STRUCT_STOP', 'MEMBER', got 'EOF_IN_STRUCT'";
		const { parseErrorMessage } = await import('./mermaid-check');
		expect(parseErrorMessage(new Error(raw))).toBe("Parse error on line 3: Expecting 'STRUCT_STOP', 'MEMBER', got 'EOF_IN_STRUCT'");
	});

	it('passes a single-line error through unchanged', async () => {
		const { parseErrorMessage } = await import('./mermaid-check');
		expect(parseErrorMessage(new Error('No diagram type detected matching given configuration for text: flowcharrt TD'))).toBe('No diagram type detected matching given configuration for text: flowcharrt TD');
	});
});
