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
//     (lib/core/remote-ref.js `doorFinish`), the same function the CLI's sanitizer page runs.
//   BOUNDED: 2 s per slide, 30 s and 4 million characters of output per render; a package's frame
//     and worker live for one render, so no state crosses from one deck (or one render) to another.
// A result is remembered by what the package was handed, so typing in the editor re-runs only the
// slides whose input changed.

import DOMPurify from 'dompurify';
import remoteRef from '../../../../lib/core/remote-ref.js';
import { createSlideSanitizer } from '../../../../lib/core/sanitize-slide-html.mjs';
import { captureHook, claimKey, engineClaimsOf, SLIDE_MS, spliced, substituteHook, withFailureNote } from '../../../../lib/packages/code-door-core.mjs';
import SHIPPED from '../../../../lib/packages/packages.generated.json';
import { openPackageFrame, type PackageFrame } from './runner';

type RemoteRef = { doorFinish: (doc: Document, sanitize: (html: string, filter: unknown) => string, html: string, handed: string, pkg: string) => { html: string; classes: string[] } | { error: string } };
type Claim = { i: number; pkg: string; index: number; html: string; idPrefix: string; baseUrl: string };
type Hook = (html: string, ctx: { slideIndex: (i: number) => number; idPrefix: string }) => string;

/** A code package the Studio knows: a saved component whose package carries a `transform.js`. */
export type StudioCodePackage = { name: string; code: string; sha256: string; bytes: number };
/** What the notice above the preview shows: the packages this deck uses that are not approved. */
export type CodePackagesStatus = { unapproved: StudioCodePackage[]; failed: { name: string; slide: number; why: string }[] };

const ENGINE_CLAIMS: readonly string[] = engineClaimsOf(SHIPPED);
const RENDER_BUDGET_MS = 30_000;
/**
 * The most package output ONE render sanitizes, across every slide. The sanitizer runs on the
 * Studio's main thread, and twelve slides of 3.9 million characters each froze it for ten seconds
 * (the red team); the per-slide cap alone did not bound a render.
 */
const RENDER_OUTPUT_MAX = 4_000_000;
const APPROVALS_KEY = 'lattice-code-package-approvals';
const MEMO_MAX = 400;

const packages = new Map<string, StudioCodePackage>();
const memo = new Map<string, string>();
/** Code that failed to load, by digest, with why: not retried on every render. */
const unloadable = new Map<string, string>();
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

function report(s: CodePackagesStatus) {
	const same = JSON.stringify(s) === JSON.stringify(lastStatus);
	lastStatus = s;
	if (!same) for (const fn of listeners) fn(s);
}


/**
 * The package's sandbox FOR ONE RENDER: opened on the render's first claim of it and closed when the
 * render ends. A worker kept for the session let a package carry one deck's content into another
 * deck's slides through its own module state (the red team); a render's worker sees one deck. A
 * spent frame (a timeout) is replaced within the render.
 */
async function frameFor(p: StudioCodePackage, frames: Map<string, Promise<PackageFrame>>): Promise<PackageFrame> {
	const broken = unloadable.get(p.sha256);
	if (broken) throw new Error(broken);
	const open = frames.get(p.sha256);
	if (open) {
		const fr = await open.catch((e: Error) => {
			// A load that ran past its time is not tried again in the same render: each try costs the
			// load's whole limit (the checker). The next render tries once more.
			if (/did not finish loading/.test(e.message)) throw e;
			return null;
		});
		if (fr && !fr.closed) return fr;
	}
	const next = openPackageFrame(p.code);
	frames.set(p.sha256, next);
	next.catch((e: Error) => {
		// Code that throws or does not parse at load will not load on the next keystroke either:
		// remembered by digest. A load that only ran long is tried again.
		if (/failed to load/.test(e.message)) unloadable.set(p.sha256, e.message);
	});
	return next;
}

let sanitizeWith: ((html: string, filter: unknown) => string) | null = null;
function doorSanitizer() {
	if (!sanitizeWith) {
		let current: unknown = () => false;
		const sanitize = createSlideSanitizer(DOMPurify, window, { filterAttr: (t: string, n: string, v: string) => (current as (a: string, b: string, c: string) => boolean | string)(t, n, v) });
		sanitizeWith = (html, filter) => {
			current = filter;
			try {
				return sanitize(html);
			} finally {
				current = () => false;
			}
		};
	}
	return sanitizeWith;
}

function remember(key: string, section: string) {
	if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value as string);
	memo.set(key, section);
}

type Renderer = { render: (source: string, theme: string, opts?: Record<string, unknown>) => { html: string } };

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
	// A snapshot: the Library can change the set while this render awaits a sandbox.
	const pkgs = new Map(packages);
	const names = [...pkgs.keys()];
	// Keys carry the code's DIGEST, not the code (400 keys of a 235 KB package held 94 MB; the checker).
	const digestOf = new Map([...pkgs.values()].map((p) => [p.name, p.sha256]));
	const baseUrl = typeof engineOpts?.baseUrl === 'string' ? engineOpts.baseUrl : '';
	const cap = captureHook(names, { baseUrl, engineClaims: ENGINE_CLAIMS }) as { hook: Hook; claims: Claim[] };
	const first = PG.render(source, theme, { ...engineOpts, codePackages: cap.hook }) as R;
	if (!cap.claims.length) {
		if (reporting) report({ unapproved: [], failed: [] });
		return first;
	}
	const started = Date.now();
	const frames = new Map<string, Promise<PackageFrame>>();
	let total = 0;
	const sections = new Map<string, string>();
	const unapproved = new Map<string, StudioCodePackage>();
	const failed: CodePackagesStatus['failed'] = [];
	const R = remoteRef as unknown as RemoteRef;
	for (const c of cap.claims) {
		const p = pkgs.get(c.pkg);
		if (!p) continue;
		const key = claimKey(c, p.sha256);
		if (sections.has(key)) continue;
		// Approval first, then the memo: a result drawn before an approval was withdrawn is not shown.
		if (!isApproved(p)) {
			unapproved.set(p.name, p);
			sections.set(key, withFailureNote(c.html, c.pkg, 'its code has not been approved in this browser'));
			continue;
		}
		const known = memo.get(key);
		if (known) {
			// Remembered output counts against the render's cap as fresh output does (the checker: a
			// deck of remembered 3M-character slides went into the render uncounted).
			total += known.length;
			sections.set(key, total > RENDER_OUTPUT_MAX ? withFailureNote(c.html, c.pkg, `the render's code packages returned more than ${RENDER_OUTPUT_MAX.toLocaleString('en-US')} characters in all`) : known);
			continue;
		}
		let why: string | null = null;
		let out = '';
		if (Date.now() - started > RENDER_BUDGET_MS) why = `the render's ${RENDER_BUDGET_MS / 1000} s budget for code packages ran out`;
		else {
			try {
				const raw = await (await frameFor(p, frames)).run({ html: c.html, index: c.index, idPrefix: c.idPrefix, baseUrl: c.baseUrl }, SLIDE_MS);
				total += raw.length;
				if (total > RENDER_OUTPUT_MAX) throw new Error(`the render's code packages returned more than ${RENDER_OUTPUT_MAX.toLocaleString('en-US')} characters in all`);
				const done = R.doorFinish(document, doorSanitizer(), raw, c.html, c.pkg);
				if ('error' in done) why = done.error;
				else out = spliced(c.html, done.html, done.classes, c.pkg);
			} catch (e) {
				why = e instanceof Error ? e.message : String(e);
			}
		}
		if (why) {
			failed.push({ name: c.pkg, slide: c.index + 1, why });
			const noted = withFailureNote(c.html, c.pkg, why);
			sections.set(key, noted);
			// A throw or a bad return fails the same way for the same input, so it is remembered; a
			// failure of TIME (a deadline, the budget, a stopped sandbox, a load that ran long) may be
			// the machine's, not the package's, and runs again next time (the inversion lens).
			if (!/budget|was stopped|did not finish|not loaded|in all/.test(why)) remember(key, noted);
		} else {
			remember(key, out);
			sections.set(key, out);
		}
	}
	for (const f of frames.values()) f.then((fr) => fr.close()).catch(() => {});
	if (reporting) report({ unapproved: [...unapproved.values()], failed });
	return PG.render(source, theme, { ...engineOpts, codePackages: substituteHook(names, sections, digestOf, { baseUrl, engineClaims: ENGINE_CLAIMS }) }) as R;
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
