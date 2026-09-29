// Mermaid's own parser over a deck's diagrams — the half of mermaid-check.ts that needs the
// library, split out so the Studio loads it on demand (StudioShell's diagram effect imports it
// lazily). Why it exists, and why the return type is the contract: mermaid-check.ts and the
// docblock on `checkDiagrams` below.

import { drawnLibraryUrl } from '../../../../lib/plugins/drawn-library.mjs';
// Types only: a value import of mermaid-check.ts from this lazy chunk would make that module a
// shared chunk of its own, and the re-chunking costs the Studio's startup more than this saves.
import type { Diagram, DiagramError } from './mermaid-check';

// The loaded library, memoized. `null` once a load has definitively failed, so a deck on a
// broken/offline asset path doesn't re-inject a script on every debounce tick.
type MermaidLib = { initialize: (o: unknown) => void; parse: (t: string) => Promise<unknown> };
let mermaidPromise: Promise<MermaidLib | null> | null = null;

/** Load the locally-vendored Mermaid once, resolving to the library (or null if it can't
 *  be had — a diagnostic that can't run reports nothing, it never guesses). */
function loadMermaid(url: string): Promise<MermaidLib | null> {
	if (mermaidPromise) return mermaidPromise;
	mermaidPromise = new Promise<MermaidLib | null>((resolve) => {
		const existing = (globalThis as { mermaid?: MermaidLib }).mermaid;
		if (existing?.parse) return resolve(existing);
		if (typeof document === 'undefined') return resolve(null);
		const s = document.createElement('script');
		s.src = url;
		s.async = true;
		s.onload = () => {
			const lib = (globalThis as { mermaid?: MermaidLib }).mermaid;
			if (!lib?.parse) return resolve(null);
			// startOnLoad off: we are parsing, never rendering, and an auto-render pass in the
			// PARENT page would walk the Studio's own DOM looking for diagrams to draw.
			try {
				lib.initialize({ startOnLoad: false });
			} catch {
				/* already initialized by another consumer — fine */
			}
			resolve(lib);
		};
		s.onerror = () => resolve(null);
		document.head.appendChild(s);
	});
	return mermaidPromise;
}

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
 * Parse every diagram in the deck and report the ones Mermaid rejects.
 *
 * THE RETURN TYPE IS THE WHOLE CONTRACT. `[]` means "checked, and every diagram parses" —
 * a positive claim the prompt repeats to the model as measured fact. `null` means "no
 * answer": the deck has no diagrams to check, or the library could not be loaded (offline,
 * CSP, a 404 on the vendored asset, no URL). Collapsing those into `[]` — which this
 * module did on its first pass — made the app assert a verification it never performed,
 * the exact fabrication this whole change exists to remove, only now coming from us
 * instead of the model and impossible for the author to challenge. `loadMermaid` memoizes
 * its failure, so that lie would have been sticky for the session.
 */
export async function checkDiagrams(diagrams: Diagram[], runtimeUrl: string): Promise<DiagramError[] | null> {
	// The library is the Mermaid plugin's payload, beside the runtime (lib/plugins/drawn-library.mjs).
	const libUrl = drawnLibraryUrl(runtimeUrl, 'mermaid');
	if (!diagrams.length || !libUrl) return null;
	const lib = await loadMermaid(libUrl);
	if (!lib) return null;
	const errors: DiagramError[] = [];
	// Bounded on purpose: this parses serially on the PARENT page's main thread, so a deck
	// with many large diagrams froze the Studio for seconds on every debounce tick (red
	// team measured ~1.5s for 8000 sequence messages). Past the cap we report what we have
	// rather than what we wish we had — the caller states only what was actually checked.
	for (const d of diagrams.slice(0, MAX_DIAGRAMS)) {
		if (d.code.length > MAX_DIAGRAM_CHARS) continue;
		try {
			await lib.parse(d.code);
		} catch (e) {
			errors.push({ slide: d.slide, message: parseErrorMessage(e) });
		}
	}
	return errors;
}

/** Bounds on the main-thread parse loop. */
const MAX_DIAGRAMS = 40;
const MAX_DIAGRAM_CHARS = 20_000;
