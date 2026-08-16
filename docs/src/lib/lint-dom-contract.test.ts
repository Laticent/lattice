// The ONE assumption `lint-theme.js` cannot survive being wrong about.
//
// The finding card is produced by CSS grid placement over a DOM this repo does
// not own: `@codemirror/lint` renders each diagnostic as
//
//   li.cm-diagnostic.cm-diagnostic-<severity>
//     span.cm-diagnosticText      → grid row 2 (the message)
//     button.cm-diagnosticAction  → rows 3..n  (auto-flowed, 0..n of them)
//     div.cm-diagnosticSource     → grid row 1 (the rule id)
//
// Those class names and that child ORDER are package internals with no stability
// contract. If a release wraps the body in a container, renames a class, or
// reorders the children, the placement addresses elements that are no longer
// where it thinks they are — and the popup renders as overlapping text.
//
// Nothing else in the repo would catch that. Every other assertion about this
// design reads the exported theme OBJECT, which stays perfectly valid while the
// DOM underneath it moves. And the exposure is not hypothetical: `@codemirror/lint`
// is pinned `^6.9.7` and sits in dependabot's `routine` group, which auto-merges
// minor and patch bumps unattended once CI is green (.github/dependabot.yml,
// .github/workflows/dependabot-auto-merge.yml). So a green pipeline is exactly
// the condition under which this could ship broken.
//
// This test drives the REAL package — not a fixture of what we think it emits —
// and fails loudly on the bump rather than in a user's editor.

import { forceLinting, linter, openLintPanel } from '@codemirror/lint';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';

const DIAGNOSTIC = {
	from: 0,
	to: 5,
	severity: 'error' as const,
	message: 'unknown component “kpiz”',
	source: 'unknown-class',
	actions: [{ name: 'Fix: use “kpi”', apply() {} }],
};

let view: EditorView | undefined;
afterEach(() => {
	view?.destroy();
	view = undefined;
});

async function renderDiagnostic() {
	view = new EditorView({
		state: EditorState.create({
			doc: 'hello world\n',
			extensions: [linter(() => [DIAGNOSTIC], { delay: 0 })],
		}),
		parent: document.body,
	});
	forceLinting(view);
	await new Promise((r) => setTimeout(r, 50));
	// The lint PANEL renders diagnostics through the same `renderDiagnostic` the
	// hover tooltip uses, and unlike the tooltip it needs no pointer — so it is the
	// way to exercise this DOM without a real browser.
	openLintPanel(view);
	await new Promise((r) => setTimeout(r, 50));
	const li = document.querySelector('li.cm-diagnostic');
	if (!li) throw new Error('no .cm-diagnostic rendered — the package DOM has changed shape');
	return li;
}

describe('@codemirror/lint DOM contract', () => {
	it('still emits text → action(s) → source as DIRECT children of .cm-diagnostic', async () => {
		const li = await renderDiagnostic();
		// Direct children only: the grid places these by selector, and a wrapper
		// element inserted between them would break placement while leaving every
		// object-level assertion in lint-theme.test.ts green.
		const shape = [...li.children].map((c) => `${c.tagName.toLowerCase()}.${c.className}`);
		expect(shape).toEqual([
			'span.cm-diagnosticText',
			'button.cm-diagnosticAction',
			'div.cm-diagnosticSource',
		]);
	});

	it('still marks severity with a cm-diagnostic-<severity> class on the li', async () => {
		// The severity glyph, the severity word and the rail-clearing rule all key
		// off this class.
		const li = await renderDiagnostic();
		expect(li.classList.contains('cm-diagnostic')).toBe(true);
		expect(li.classList.contains('cm-diagnostic-error')).toBe(true);
	});

	it('still renders the action as a <button> carrying the action name', async () => {
		// The fix pill is styled as `.cm-diagnosticAction`; if this stops being a
		// button, both the styling and its keyboard semantics change.
		const li = await renderDiagnostic();
		const btn = li.querySelector('button.cm-diagnosticAction');
		expect(btn).not.toBeNull();
		expect(btn?.textContent).toContain('Fix: use “kpi”');
	});
});
