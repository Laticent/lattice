import { forEachDiagnostic } from '@codemirror/lint';
import type { EditorState, Transaction } from '@codemirror/state';

// When an open lint tooltip survives a transaction. A lint pass hides any open lint tooltip by default, even one whose
// diagnostics come back unchanged; on a phone the editor view is built when the Source tab opens and lint runs again a moment
// later, so a warning tapped in between opened, closed and reopened. This keeps it, but ONLY for tooltips whose buttons are
// the photo verdict's (thin-card-fix.ts `inkFixNode`, `thin-card-no-ink` and the measured `photo-contrast`): CodeMirror's own action buttons find their diagnostic by object
// identity in the current set, every pass builds new objects, so a kept tooltip of any other rule would hold dead buttons.

/** The rules whose tooltip buttons are the photo verdict's own (thin-card-fix.ts), not CodeMirror's. */
const OWN_BUTTONS = ['thin-card-no-ink', 'photo-contrast'];

/** `hideOn` for the editor's linter: `false` keeps the tooltip, `true` hides it, `null` leaves it to CodeMirror's rule. */
export function keepTooltipOnSameDiagnostics(tr: Transaction, from: number, to: number): boolean | null {
	const under = (state: EditorState) => {
		const out: string[] = [];
		forEachDiagnostic(state, (d, a, b) => {
			if (a <= to && b >= from) out.push(`${d.source}|${d.severity}|${d.message}`);
		});
		return out.sort();
	};
	const before = under(tr.startState);
	if (!before.length || !before.every((k) => OWN_BUTTONS.some((r) => k.startsWith(`${r}|`)))) return null;
	// The ink buttons remember where their slide was; any edit could move it, so the tooltip closes and is rebuilt on the next hover.
	if (tr.docChanged) return true;
	return before.join('\n') === under(tr.state).join('\n') ? false : null;
}
