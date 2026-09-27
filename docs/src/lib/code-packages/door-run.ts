// THE RUNNING HALF OF THE STUDIO'S DOOR FOR CODE PACKAGES (door.ts is the state and the entry).
//
// Loaded by `renderWithCodePackages` only when the Library holds a code package, so the shared
// kernel, the slide sanitizer, the runner and the shipped claim list stay out of the Studio's and
// the Playground's first load (docs/route-budget.json).

import DOMPurify from 'dompurify';
import { doorFinish } from '../../../../lib/core/door-attr.mjs';
import { createSlideSanitizer } from '../../../../lib/core/sanitize-slide-html.mjs';
import { captureHook, claimKey, engineClaimsOf, SLIDE_MS, slideInput, spliced, substituteHook, withFailureNote } from '../../../../lib/packages/code-door-core.mjs';
import SHIPPED from '../../../../lib/packages/packages.generated.json';
import { type CodePackagesStatus, codePackages, isApproved, type Renderer, report, type StudioCodePackage } from './door';
import { openPackageFrame, type PackageFrame } from './runner';

// The palette token names every theme defines, handed to a package in its slide's facts. The theme
// core is already a chunk of its own (import-gate.ts); this module is itself loaded only when a
// render meets a code package, so it costs the first load nothing.
// A load that fails (a stale chunk after a deploy) is forgotten, and its error reads "not loaded",
// which the door treats as a failure of the moment and runs again next render; kept, it failed every
// package in the tab until a reload (the checker).
let tokensLoad: Promise<string[]> | null = null;
const contractTokens = () =>
	(tokensLoad ??= import('@/playground/theme-core.generated.js').then(
		(m) => m.requiredTokenList() as string[],
		() => {
			tokensLoad = null;
			throw new Error('the palette token list was not loaded');
		},
	));

type DoorFinish = (doc: Document, sanitize: (html: string, filter: unknown) => string, html: string, handed: string, pkg: string) => { html: string; classes: string[] } | { error: string };
type Claim = { i: number; pkg: string; index: number; html: string; idPrefix: string; baseUrl: string };
type Hook = (html: string, ctx: { slideIndex: (i: number) => number; idPrefix: string }) => string;

const ENGINE_CLAIMS: readonly string[] = engineClaimsOf(SHIPPED);
const RENDER_BUDGET_MS = 30_000;
/**
 * The most package output ONE render sanitizes, across every slide. The sanitizer runs on the
 * Studio's main thread, and twelve slides of 3.9 million characters each froze it for ten seconds
 * (the red team); the per-slide cap alone did not bound a render.
 */
const RENDER_OUTPUT_MAX = 4_000_000;
const MEMO_MAX = 400;

const memo = new Map<string, string>();
/** Code that failed to load, by digest, with why: not retried on every render. */
const unloadable = new Map<string, string>();

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

/** The door past its no-package fast path: two renders around the code-packages slot. */
export async function runWithCodePackages<R extends { html: string }>(PG: Renderer, source: string, theme: string, engineOpts: Record<string, unknown> | undefined, reporting: boolean): Promise<R> {
	const packages = codePackages();
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
				const raw = await (await frameFor(p, frames)).run(slideInput(c, await contractTokens()), SLIDE_MS);
				total += raw.length;
				if (total > RENDER_OUTPUT_MAX) throw new Error(`the render's code packages returned more than ${RENDER_OUTPUT_MAX.toLocaleString('en-US')} characters in all`);
				const done = (doorFinish as DoorFinish)(document, doorSanitizer(), raw, c.html, c.pkg);
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
