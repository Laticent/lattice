// Mermaid's own parser over a deck's diagrams — the half of mermaid-check.ts that needs the
// library, split out so the Studio loads it on demand (StudioShell's diagram effect imports it
// lazily). Why it exists, and why the return type is the contract: mermaid-check.ts and the
// docblock on `checkDiagrams` below.

import labelLength from '../../../../lib/plugins/mermaid/shared/label-length.js';
import { engineBase } from '../../lib/engine-base';
import { installPreviewDrawHost } from '../../lib/preview-draw-host';
// Types only: a value import of mermaid-check.ts from this lazy chunk would make that module a
// shared chunk of its own, and the re-chunking costs the Studio's startup more than this saves.
import type { Diagram, DiagramError } from './mermaid-check';

// A CommonJS file: default import, then destructure (docs/src/plugins/vite-cjs-lib-dev.test.ts).
const { overlongLabelText, overlongMessage } = labelLength as { overlongLabelText: (s: string) => { kind: string; length: number; max: number } | null; overlongMessage: (o: { kind: string; length: number; max: number }) => string };

// THE LIBRARY IS NOT IN THIS PAGE. Each diagram is sent to the preview's sandboxed draw frame as an ordinary
// draw job (the frame already holds Mermaid for the previews), and what comes back is only whether the library
// drew it. The drawing is discarded; a refusal from the library is the diagnosis.
type DrawHost = { draw: (job: Record<string, unknown>) => Promise<string>; kinds?: readonly string[] };
const host = (): DrawHost | null => {
	if (typeof window === 'undefined') return null;
	installPreviewDrawHost(window);
	const h = (window as { __latticeDrawHost?: DrawHost }).__latticeDrawHost;
	// Before a page has recorded the engine's address the frame cannot open, and that failure would switch the kind off for the whole session.
	if (!engineBase()) return null;
	return h && Array.isArray(h.kinds) && h.kinds.includes('mermaid') ? h : null;
};

/** A short, stable id for a diagram's text, so an unchanged diagram is the same draw job on the next check (and the host remembers its answer). */
function idFor(code: string): string {
	let h = 2166136261;
	for (let i = 0; i < code.length; i++) h = Math.imul(h ^ code.charCodeAt(i), 16777619) >>> 0;
	return `lattice-mmd-check-${h.toString(36)}`;
}

/** What the frame says when the drawing, not the diagram, is the trouble: that says nothing about the author's text. Anchored at the start: Mermaid's own messages quote the author's text, which can hold these words. */
const NOT_A_VERDICT = /^(?:the drawing is |the frame returned |mermaid resolved without |mermaid did not load|a mermaid draw needs )/i;

/**
 * Mermaid's thrown error, reduced to the part that helps. Its parse errors look like:
 *
 *     Parse error on line 3:
 *     ...ass Order {    +id
 *     ---------------------^
 *     Expecting 'STRUCT_STOP', 'MEMBER', got 'EOF_IN_STRUCT'
 *
 * The WHERE is the first line and the WHAT is the last; the middle two are an ASCII
 * caret diagram that survives no useful reformatting into a prompt. Taking the first
 * line alone (the obvious reduction) yields a bare "Parse error on line 3:" — a location
 * with no diagnosis, which is barely better than the guessing this replaces. So keep
 * both ends and drop the caret art.
 */
export function parseErrorMessage(e: unknown): string {
	// UNTRUSTED. Mermaid quotes the offending source back at you — for a diagram whose type
	// it can't detect, the message is literally "No diagram type detected ... : " + the
	// whole diagram. The Studio opens shared and AI-generated decks, so every character
	// here can be attacker-chosen, and it lands in the SYSTEM turn, which a model weights
	// as instruction. JSON-quoting at the callsite covers `"`, `\` and `\n` — it does NOT
	// cover U+2028/U+2029, which `JSON.stringify` leaves raw, `trim` doesn't strip, and
	// `split('\n')` doesn't split on: they broke the bullet onto its own line and let a
	// forged header through (red team). Neutralize the line terminators the JSON layer
	// misses, here, where the untrusted text enters.
	const raw = String((e as { message?: string })?.message ?? String(e)).replace(/[\u2028\u2029\u0085\r]/g, ' ');
	const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
	if (!lines.length) return 'Failed to parse.';
	const detail = lines.find((l) => /^(Expecting|Unrecognized|Syntax error)/i.test(l));
	const head = lines[0];
	return (detail && detail !== head ? `${head} ${detail}` : head).slice(0, 240);
}

/**
 * Draw every diagram in the deck in the sandboxed frame and report the ones Mermaid rejects.
 *
 * THE RETURN TYPE IS THE WHOLE CONTRACT. `[]` means "checked, and every diagram parses" —
 * a positive claim the prompt repeats to the model as measured fact. `null` means "no
 * answer": the deck has no diagrams to check, or the library could not be loaded (offline,
 * CSP, a 404 on the vendored asset, no URL). Collapsing those into `[]` — which this
 * module did on its first pass — made the app assert a verification it never performed,
 * the exact fabrication this whole change exists to remove, only now coming from us
 * instead of the model and impossible for the author to challenge. A frame that cannot answer
 * (stopped, timed out, could not load) therefore returns `null`, never `[]`.
 */
export async function checkDiagrams(diagrams: Diagram[], _runtimeUrl = '', stale: () => boolean = () => false): Promise<DiagramError[] | null> {
	const draw = !diagrams.length ? null : host();
	if (!draw) return null;
	const errors: DiagramError[] = [];
	// Bounded on purpose: each diagram is a full draw in the frame, one at a time. Past the cap we report what we have
	// rather than what we wish we had, and the caller states only what was actually checked.
	for (const d of diagrams.slice(0, MAX_DIAGRAMS)) {
		if (stale()) return null; // the deck moved on: stop taking turns in the frame the preview shares
		if (d.code.length > MAX_DIAGRAM_CHARS) continue;
		// The preview refuses an over-long label before Mermaid sees it, because rendering one can hold the frame for many seconds; the check says the same.
		const overlong = overlongLabelText(d.code);
		if (overlong) {
			errors.push({ slide: d.slide, message: parseErrorMessage(new Error(overlongMessage(overlong))) });
			continue;
		}
		try {
			await draw.draw({ kind: 'mermaid', definition: d.code, svgId: idFor(d.code), config: { startOnLoad: false, securityLevel: 'strict' }, stage: 1200, fonts: [] });
		} catch (e) {
			// Only the library's own refusal is a diagnosis. A frame that stopped, timed out or could not open says nothing about the diagram,
			// so the whole check gives no answer (`null`) instead of claiming a result it did not get.
			if (!(e as { drawRefused?: boolean })?.drawRefused || NOT_A_VERDICT.test(String((e as Error).message))) return null;
			errors.push({ slide: d.slide, message: parseErrorMessage(e) });
		}
	}
	return errors;
}

/** Bounds on the check loop. */
const MAX_DIAGRAMS = 40;
const MAX_DIAGRAM_CHARS = 20_000;
