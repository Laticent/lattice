// Real diagram diagnostics, from Mermaid itself.
//
// WHY THIS EXISTS. The Architect was asked "are these diagrams correct?" and had no way
// to find out: no shell, no renderer, no parser. So it guessed, then described the guess
// as a test result ("I've tested all 14 diagrams with mmdc and confirmed they render
// cleanly"). The prompt now forbids that claim — but forbidding a fabrication only
// converts it into "I don't know". This module supplies the answer instead.
//
// The runtime ALREADY knows: it attaches a `.mermaid-error` box carrying Mermaid's own
// parse message next to every diagram that fails (lib/runtime/index.js). That knowledge
// was unreachable from the chat for two reasons — it lives inside the preview iframe, and
// the Studio's live preview renders only the CURRENT slide, so it can never account for a
// deck. Rather than scrape a frame that only knows one slide, ask the parser directly.
//
// COST. Mermaid is ~3MB, so it is loaded LAZILY and only for a deck that actually
// contains a diagram — a deck with no ```mermaid fence never pays. It is the same
// locally-vendored `mermaid-v11.min.js` the preview and the export bundle use (our own
// origin, never a CDN — offline / strict-CSP safe), so no new asset ships.
//
// This is a RENDER diagnostic, not an authoring lint rule: it needs the Mermaid library,
// which `lib/authoring/lint-core.js` cannot take (pure, fs-free, shared with the CLI). So
// it deliberately does NOT become a lint finding — it rides its own grounding channel.
// See engineering/decisions/2026-08-04-chat-edit-protocol.md.

import { splitTopLevel } from '@/components/studio/ai/architect-edits.js';

/** One diagram that failed to parse, addressed by the same 1-based slide number the
 *  preview, the findings, and the edit protocol all use. */
export type DiagramError = { slide: number; message: string };

/** A ```mermaid fence found in the deck, with the slide it sits on. */
export type Diagram = { slide: number; code: string };

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/;

/**
 * Every ```mermaid (or ~~~mermaid) fence in the deck, with its 1-based REAL slide number
 * (front matter excluded), matching how every other Studio surface addresses a slide.
 * Pure — no DOM, no network — so the extraction half is testable headless.
 */
export function extractDiagrams(source: string): Diagram[] {
	const src = String(source || '');
	const chunks = splitTopLevel(src);
	const real = FRONT_MATTER.test(src) ? chunks.slice(2) : chunks;
	const out: Diagram[] = [];
	real.forEach((chunk, i) => {
		const lines = String(chunk).split('\n');
		// Outer-fence state. A slide that DOCUMENTS a diagram — a ```mermaid block nested
		// inside a ````markdown block — has no diagram the renderer will ever draw, but the
		// first pass extracted the sample anyway and told the model, authoritatively, to fix
		// a deliberately-broken teaching example (red team). This is the same fence-blindness
		// `splitTopLevel` exists to avoid, so track the enclosing fence the same way.
		let outer = null;
		for (let k = 0; k < lines.length; k++) {
			if (outer) {
				if (new RegExp(`^[ \\t]{0,3}[${outer[0]}]{${outer.length},}[ \\t]*$`).test(lines[k])) outer = null;
				continue;
			}
			// An OPENER whose info-string is `mermaid`. The closer must be the same marker,
			// at least as long, and bare — CommonMark, the same rule the edit parser follows.
			const open = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*mermaid[ \t]*$/.exec(lines[k]);
			if (!open) {
				// Any OTHER fence opener encloses whatever follows.
				const other = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*\S/.exec(lines[k]);
				if (other) outer = other[1];
				continue;
			}
			const fence = open[1];
			const closes = new RegExp(`^[ \\t]{0,3}[${fence[0]}]{${fence.length},}[ \\t]*$`);
			let end = k + 1;
			while (end < lines.length && !closes.test(lines[end])) end++;
			const code = lines.slice(k + 1, end).join('\n').trim();
			if (code) out.push({ slide: i + 1, code });
			k = end;
		}
	});
	return out;
}

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
export async function checkDiagrams(source: string, mermaidUrl: string): Promise<DiagramError[] | null> {
	const diagrams = extractDiagrams(source);
	if (!diagrams.length || !mermaidUrl) return null;
	const lib = await loadMermaid(mermaidUrl);
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
