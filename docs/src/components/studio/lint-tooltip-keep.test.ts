import { type Diagnostic, linter, setDiagnostics } from '@codemirror/lint';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { keepTooltipOnSameDiagnostics } from './lint-tooltip-keep';

const DOC = 'line one\n<!-- _class: image spotlight card-clear -->\nline three\n';
const at = DOC.indexOf('<!--');
const end = DOC.indexOf('-->') + 3;
const thin = (): Diagnostic => ({ from: at, to: end, severity: 'warning', source: 'thin-card-no-ink', message: 'A spotlight card at 0%.' });
const other = (): Diagnostic => ({ from: at, to: end, severity: 'warning', source: 'unknown-class', message: 'Did you mean content?', actions: [{ name: 'Fix', apply() {} }] });

function withDiags(diags: Diagnostic[]) {
	const base = EditorState.create({ doc: DOC, extensions: [linter(null)] });
	return base.update(setDiagnostics(base, diags)).state;
}

describe('keepTooltipOnSameDiagnostics', () => {
	it('keeps a thin-card tooltip through a lint pass that returns the same diagnostics', () => {
		const s = withDiags([thin()]);
		const tr = s.update(setDiagnostics(s, [thin()]));
		expect(keepTooltipOnSameDiagnostics(tr, at, end)).toBe(false);
	});
	it('hides a thin-card tooltip on any edit, so its remembered slide cannot drift', () => {
		const s = withDiags([thin()]);
		const tr = s.update({ changes: { from: 0, insert: 'x' } });
		expect(keepTooltipOnSameDiagnostics(tr, at, end)).toBe(true);
	});
	it('leaves any other rule to CodeMirror, whose buttons die if their diagnostic objects are replaced', () => {
		const s = withDiags([other()]);
		const tr = s.update(setDiagnostics(s, [other()]));
		expect(keepTooltipOnSameDiagnostics(tr, at, end)).toBeNull();
		const mixed = withDiags([thin(), other()]);
		expect(keepTooltipOnSameDiagnostics(mixed.update(setDiagnostics(mixed, [thin(), other()])), at, end)).toBeNull();
	});
	it('falls back to CodeMirror when the thin-card diagnostics under the tooltip changed', () => {
		const s = withDiags([thin()]);
		const tr = s.update(setDiagnostics(s, [{ ...thin(), message: 'A spotlight card at 20%.' }]));
		expect(keepTooltipOnSameDiagnostics(tr, at, end)).toBeNull();
	});
});
