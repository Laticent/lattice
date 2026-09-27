// THE STUDIO'S DOOR FOR CODE PACKAGES (portable-packages phase 6, step 4; contract note §9).
//
// The same door as the CLI's (lib/packages/code-door.js), on the Studio's surfaces. Every Studio
// render goes through `renderMarkdown` (render-engine.ts), and it comes through here:
//   CONSENT FIRST. A package runs only once the user approved its code at its SHA-256, in THIS
//     browser (`approveCodePackage`); the approval lives in this browser's storage, never in a
//     deck, a backup or a `.lattice` file, so no file can grant itself consent. A slide a package
//     claims without that approval renders as the engine drew it, with a note, and the notice
//     above the preview offers the approval (CodePackagesNotice).
//   ONE SLOT, IN THE ENGINE. The registry's code-packages slot, right after the charts
//     (lib/transformers/code-packages.js). A first render captures the slides packages claim, the
//     packages run in their sandboxes (runner.ts), and a second render puts the output in.
//   FIRST MATCH, SPLICING, NOTES: the shared kernel (lib/packages/code-door-core.mjs).
//   SANITIZED, KEEPING ONLY WHAT IT WAS HANDED: the slide sanitizer with the door's attribute rule
//     (lib/core/door-attr.mjs `doorFinish`), the same function the CLI's sanitizer page runs.
//   BOUNDED: 2 s per slide, 30 s and 4 million characters of output per render; a package's frame
//     and worker live for one render, so no state crosses from one deck (or one render) to another.
// A result is remembered by what the package was handed, so typing in the editor re-runs only the
// slides whose input changed.
//
// This file is the door's STATE (the packages, the approvals, the status) and its entry point; the
// running half is door-run.ts, loaded only once a render meets a code package, so a Studio with no
// code package never downloads the kernel, the sanitizer or the runner.

/** A code package the Studio knows: a saved component whose package carries a `transform.js`. */
export type StudioCodePackage = { name: string; code: string; sha256: string; bytes: number };
/** What the notice above the preview shows: the packages this deck uses that are not approved. */
export type CodePackagesStatus = { unapproved: StudioCodePackage[]; failed: { name: string; slide: number; why: string }[] };

const APPROVALS_KEY = 'lattice-code-package-approvals';

const packages = new Map<string, StudioCodePackage>();
const listeners = new Set<(s: CodePackagesStatus) => void>();
let lastStatus: CodePackagesStatus = { unapproved: [], failed: [] };

/** The SHA-256 of a package's code, hex: the same digest `lattice packages trust` pins. */
export async function codeDigest(code: string): Promise<string> {
	const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
	return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

type Approvals = Record<string, { sha256: string; at: string }>;
function readApprovals(): Approvals {
	try {
		const raw = JSON.parse(localStorage.getItem(APPROVALS_KEY) || '{}');
		const out: Approvals = {};
		for (const [k, v] of Object.entries((raw?.approved ?? {}) as Record<string, { sha256?: unknown; at?: unknown }>)) {
			if (typeof v?.sha256 === 'string' && /^[0-9a-f]{64}$/.test(v.sha256)) out[k] = { sha256: v.sha256, at: String(v.at ?? '') };
		}
		return out;
	} catch {
		return {};
	}
}

/** Has the user approved exactly this code in this browser? */
export function isApproved(p: Pick<StudioCodePackage, 'name' | 'sha256'>): boolean {
	return readApprovals()[p.name]?.sha256 === p.sha256;
}

/** Record the user's yes for this code, in this browser. Changed code asks again. */
export function approveCodePackage(p: Pick<StudioCodePackage, 'name' | 'sha256'>): void {
	const approved = { ...readApprovals(), [p.name]: { sha256: p.sha256, at: new Date().toISOString() } };
	try {
		localStorage.setItem(APPROVALS_KEY, JSON.stringify({ version: 1, approved }));
	} catch {
		/* storage unavailable: the approval lasts for nothing, and the package stays unapproved */
	}
}

/** Withdraw an approval in this browser. */
export function revokeCodePackage(name: string): void {
	const approved = readApprovals();
	delete approved[name];
	try {
		localStorage.setItem(APPROVALS_KEY, JSON.stringify({ version: 1, approved }));
	} catch {
		/* storage unavailable */
	}
}

/**
 * The code packages the Studio's renders may run: every saved component carrying a transform.
 * Replaces the whole set; a package whose code changed gets a fresh sandbox.
 */
let setSeq = 0;
export async function setCodePackages(list: { name: string; code: string }[]): Promise<void> {
	// Two calls can overlap (the Library changed twice quickly); only the latest one lands.
	const mine = ++setSeq;
	const next = new Map<string, StudioCodePackage>();
	for (const p of list) next.set(p.name, { name: p.name, code: p.code, sha256: await codeDigest(p.code), bytes: new TextEncoder().encode(p.code).length });
	if (mine !== setSeq) return;
	packages.clear();
	for (const [k, v] of next) packages.set(k, v);
}

/**
 * The code packages a deck names that this browser has not approved: read from the SOURCE, so the
 * notice describes the whole deck, not only the slide on screen: front-matter `class:`, each
 * `_class:` / `class:` comment, and each `pane:` marker, outside fenced code.
 */
export function unapprovedIn(source: string): StudioCodePackage[] {
	if (!packages.size) return [];
	const tokens = new Set<string>();
	const add = (raw: string) => {
		// The engine takes `class: "acme"` and `_class: 'acme'` as `acme`, so the quotes go (the checker).
		for (const t of raw.trim().replace(/^(["'])(.*)\1$/, '$2').split(/\s+/)) if (t) tokens.add(t.replace(/^["']|["']$/g, ''));
	};
	// A directive inside a fenced code block is quoted text, not a class the engine applies.
	const text = source.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, '');
	const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
	const deckClass = fm && /^[ \t]*class[ \t]*:[ \t]*(.+?)[ \t]*$/im.exec(fm[1]);
	if (deckClass) add(deckClass[1]);
	// `pane:` too: a package in a pane runs through the same slot (the inversion lens found a pane
	// slide whose note pointed at a notice that never came).
	for (const m of text.matchAll(/<!--\s*(?:_?class|pane)\s*:\s*([^>]*?)\s*-->/g)) add(m[1]);
	return [...packages.values()].filter((p) => tokens.has(p.name) && !isApproved(p));
}

/** Hear what the last render found: unapproved packages the deck uses, and slides that failed. */
export function onCodePackagesStatus(fn: (s: CodePackagesStatus) => void): () => void {
	listeners.add(fn);
	fn(lastStatus);
	return () => listeners.delete(fn);
}

/** The packages the Studio knows, for door-run.ts. */
export function codePackages(): ReadonlyMap<string, StudioCodePackage> {
	return packages;
}

/** Tell the notice what the preview's render found (door-run.ts, and the no-package path here). */
export function report(s: CodePackagesStatus) {
	const same = JSON.stringify(s) === JSON.stringify(lastStatus);
	lastStatus = s;
	if (!same) for (const fn of listeners) fn(s);
}


export type Renderer = { render: (source: string, theme: string, opts?: Record<string, unknown>) => { html: string } };

/**
 * Render through the engine with the Studio's code packages. With none known it is exactly
 * `PG.render`; with some, it renders twice around the code-packages slot.
 */
export async function renderWithCodePackages<R extends { html: string }>(PG: Renderer, source: string, theme: string, opts: Record<string, unknown> | undefined): Promise<R> {
	// The status the notice shows comes from the preview's own render only (`codeStatus`), never
	// from a scan, a gate or an export rendering on the side (the checker).
	const reporting = opts?.codeStatus === true;
	// The flag is the door's, never the engine's; without it the caller's options pass untouched.
	let engineOpts = opts;
	if (opts && 'codeStatus' in opts) {
		const { codeStatus: _flag, ...rest } = opts;
		engineOpts = rest;
	}
	if (!packages.size) {
		if (reporting) report({ unapproved: [], failed: [] });
		return PG.render(source, theme, engineOpts) as R;
	}
	// Everything past this point loads only when the Library holds a code package: the kernel,
	// the sanitizer, the runner and the shipped claim list stay out of the Studio's first load.
	const { runWithCodePackages } = await import('./door-run');
	return runWithCodePackages<R>(PG, source, theme, engineOpts, reporting);
}

/**
 * The code-package state as an inert CSS comment: which packages exist, at which code, and which
 * this browser approved. The Studio adds it to the preview's extra CSS because every preview and
 * export cache keys on that CSS, so a new package or a new approval re-renders everything that
 * showed the old state, with no cache left to serve a slide drawn before it. Empty with no package.
 */
export function codePackagesStamp(): string {
	if (!packages.size) return '';
	const parts = [...packages.values()].sort((a, b) => a.name.localeCompare(b.name)).map((p) => `${p.name}@${p.sha256.slice(0, 16)}${isApproved(p) ? '+' : '-'}`);
	return `/* lattice code packages: ${parts.join(' ')} */`;
}
