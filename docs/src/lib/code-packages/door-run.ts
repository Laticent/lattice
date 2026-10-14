// THE RUNNING HALF OF THE STUDIO'S DOOR FOR CODE PACKAGES (door.ts is the state and the entry).
//
// Loaded by `renderWithCodePackages` only when the Library holds a code package, so the shared
// kernel, the slide sanitizer, the runner and the shipped claim list stay out of the Studio's and
// the Playground's first load (docs/route-budget.json).

import DOMPurify from 'dompurify';
import { doorFinish, doorFinishFence, doorFinishInline } from '../../../../lib/core/door-attr.mjs';
import { createSlideSanitizer } from '../../../../lib/core/sanitize-slide-html.mjs';
import { compileSlot } from '../../../../lib/core/segno-spec.js';
import { captureHook, claimKey, engineClaimsOf, SLIDE_MS, slideInput, spliced, substituteHook, withFailureNote } from '../../../../lib/packages/code-door-core.mjs';
import { activePluginNames, aspectOfOutput, captureFences, fenceCaptureNotes, fenceInput, fenceKey, fenceMarkup, fenceNamespace, fenceOutputNote, fencePlaceholder, inlineInput, inlineMarkup, inlinePlaceholder, placeholderHint, planFencePlugins, rebuiltFromAlternatives, substituteFences, withFenceNote } from '../../../../lib/packages/code-door-fence.mjs';
import FENCE_DOOR from '../../../../lib/packages/fence-door.generated.json';
import SHIPPED from '../../../../lib/packages/packages.generated.json';
import { deckPluginList } from '../../../../lib/plugins/deck-plugins.mjs';
import { type CodePackagesStatus, codePackages, isApproved, isPluginApproved, type Renderer, rememberAspect, rememberedAspect, report, type StudioCodePackage, type StudioPlugin, studioPlugins } from './door';
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
type DoorFinishFence = (doc: Document, sanitize: (html: string, filter: unknown) => string, html: string, pkg: string) => { html: string } | { error: string };
type Claim = { i: number; pkg: string; index: number; html: string; idPrefix: string; baseUrl: string };
type Hook = (html: string, ctx: { slideIndex: (i: number) => number; idPrefix: string }) => string;

const ENGINE_CLAIMS: readonly string[] = engineClaimsOf(SHIPPED);
// The slides a shipped pass rebuilds from their text (a plugin's output there would be read as an
// address), and the fence names a shipped plugin owns: generated from the registry and the manifests,
// and pinned to the CLI door's live reads by test/unit/cli/fence-door-data.test.js.
const REBUILT = rebuiltFromAlternatives(FENCE_DOOR.rebuilt);
const SHIPPED_FENCES: readonly string[] = FENCE_DOOR.shippedFences;
const SHIPPED_KINDS: readonly string[] = FENCE_DOOR.shippedKinds;
const HIGHLIGHT_LANGUAGES = new Set<string>(FENCE_DOOR.highlightLanguages);
const RENDER_BUDGET_MS = 30_000;
/**
 * The most package output ONE render sanitizes, across every slide. The sanitizer runs on the
 * Studio's main thread, and twelve slides of 3.9 million characters each froze it for ten seconds
 * (the red team); the per-slide cap alone did not bound a render.
 */
const RENDER_OUTPUT_MAX = 4_000_000;
const MEMO_MAX = 400;

const memo = new Map<string, string>();
/** The RAW length of each remembered fence result, so a remembered result counts against the cap as a fresh one did. */
const rawLength = new Map<string, number>();
/** Code that failed to load, by digest, with why: not retried on every render. */
const unloadable = new Map<string, string>();

/**
 * The package's sandbox FOR ONE RENDER: opened on the render's first claim of it and closed when the
 * render ends. A worker kept for the session let a package carry one deck's content into another
 * deck's slides through its own module state (the red team); a render's worker sees one deck. A
 * spent frame (a timeout) is replaced within the render.
 */
async function frameFor(p: { code: string; sha256: string }, frames: Map<string, Promise<PackageFrame>>, fence = false): Promise<PackageFrame> {
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
	const next = openPackageFrame(p.code, { fence });
	frames.set(p.sha256, next);
	next.catch((e: Error) => {
		// Code that throws or does not parse at load will not load on the next keystroke either:
		// remembered by digest. A load that only ran long is tried again.
		// So will code the runner refuses before any frame opens (its syntax, its shape).
		if (/failed to load|^code sandbox: /.test(e.message)) unloadable.set(p.sha256, e.message);
	});
	return next;
}

/**
 * The fields an inline span's record holds, read by its kind's declared slot (2026-10-14-plugin-inline-door.md §4.3),
 * as plain data the worker can be handed; null when the kind declares no slot, the slot does not compile, or the
 * record does not read. Compiled once per plugin version and kind. The renderer still gets the span's text, so a
 * kind with no slot reads its own record.
 */
type InlineSlot = { read: (text: string) => { ok: boolean; value?: unknown } };
const slots = new Map<string, InlineSlot | null>();
function inlineFields(p: StudioPlugin, kind: string, text: string): Record<string, unknown> | null {
	const key = `${p.sha256}\u0000${kind}`;
	if (!slots.has(key)) {
		const spec = p.kinds?.find((k) => k.name === kind)?.slot;
		let compiled: InlineSlot | null = null;
		try {
			compiled = spec && typeof spec === 'object' ? (compileSlot(spec as Parameters<typeof compileSlot>[0], `${p.name}.inline.${kind}`) as unknown as InlineSlot) : null;
		} catch {
			compiled = null;
		}
		if (slots.size > 400) slots.clear();
		slots.set(key, compiled);
	}
	const slot = slots.get(key);
	if (!slot) return null;
	const read = slot.read(text.slice(kind.length + 1));
	return read.ok && read.value && typeof read.value === 'object' ? (JSON.parse(JSON.stringify(read.value)) as Record<string, unknown>) : null;
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

/** The most characters the memo holds in all: 400 entries of a few megabytes each would be a tab's worth of memory. */
const MEMO_CHARS_MAX = 24_000_000;
let memoChars = 0;
function remember(key: string, section: string) {
	const drop = (k: string) => {
		memoChars -= memo.get(k)?.length ?? 0;
		memo.delete(k);
		rawLength.delete(k);
	};
	if (memo.has(key)) drop(key);
	while (memo.size && (memo.size >= MEMO_MAX || memoChars + section.length > MEMO_CHARS_MAX)) drop(memo.keys().next().value as string);
	memoChars += section.length;
	memo.set(key, section);
}

/** The door past its no-package fast path: two renders around the code-packages slot and the plugin-fence slot. */
export async function runWithCodePackages<R extends { html: string }>(PG: Renderer, source: string, theme: string, engineOpts: Record<string, unknown> | undefined, reporting: boolean): Promise<R> {
	const packages = codePackages();
	// A snapshot: the Library can change the set while this render awaits a sandbox.
	const pkgs = new Map(packages);
	const names = [...pkgs.keys()];
	// Keys carry the code's DIGEST, not the code (400 keys of a 235 KB package held 94 MB; the checker).
	const digestOf = new Map([...pkgs.values()].map((p) => [p.name, p.sha256]));
	const baseUrl = typeof engineOpts?.baseUrl === 'string' ? engineOpts.baseUrl : '';
	// THE PLUGINS' FENCES. Which plugins run, and a note for each that does not, are the CLI door's rules
	// (planFencePlugins): a fence name two plugins claim, a shipped plugin's, a name whose prefix overlaps another's.
	const installed = new Map(studioPlugins());
	const plan = planFencePlugins(
		[...installed.values()].map((p) => ({ name: p.name, fence: p.fence, kinds: (p.kinds ?? []).map((k) => k.name) })),
		{ shipped: SHIPPED_FENCES, isLanguage: (n: string) => HIGHLIGHT_LANGUAGES.has(n), shippedKinds: SHIPPED_KINDS },
	);
	const offered = new Map(plan.run.map((p: { name: string }) => [p.name, installed.get(p.name) as StudioPlugin]));
	// What runs by what it draws: a fence or a kind two plugins share is in neither map (planFencePlugins).
	const fences = plan.fences as Map<string, string>;
	const kinds = plan.kinds as Map<string, string>;
	const pluginDigestOf = new Map([...offered.values()].map((p) => [p.name, p.sha256]));
	// `plugins:` in the deck's front matter is what ACTIVATES a plugin (decision 11); the rest are offered.
	const drawsAny = fences.size > 0 || kinds.size > 0;
	const declared = drawsAny ? activePluginNames(source, installed.keys()) : new Set<string>();
	const cap = captureHook(names, { baseUrl, engineClaims: ENGINE_CLAIMS }) as { hook: Hook; claims: Claim[] };
	const capFences = captureFences(fences, { names, engineClaims: ENGINE_CLAIMS, rebuilt: REBUILT, kinds });
	// Every installed plugin's name goes to the engine, refused or not, so a deck that lists one is not told no plugin has that name.
	const externalPlugins = [...installed.keys()];
	const first = PG.render(source, theme, { ...engineOpts, codePackages: cap.hook, ...(externalPlugins.length ? { externalPlugins } : {}), ...(drawsAny ? { codeFences: capFences } : {}) }) as R;
	// Notes about plugins the deck lists (a refused plugin says why, even when no plugin runs); not about every installed one.
	const listedNames = installed.size ? new Set(deckPluginList(source)) : new Set<string>();
	const planNotes = plan.notes.filter((n: string) => [...listedNames].some((name) => new RegExp(`(^|[^a-z0-9-])${name.replace(/[^a-z0-9-]/g, '')}([^a-z0-9-]|$)`).test(n)));
	const notes = [...planNotes, ...(drawsAny ? fenceCaptureNotes(capFences, fences) : [])];
	if (!cap.claims.length && !capFences.claims.length) {
		if (reporting) report({ unapproved: [], failed: [], ...(notes.length ? { notes } : {}) });
		return first;
	}
	const started = Date.now();
	const frames = new Map<string, Promise<PackageFrame>>();
	let total = 0;
	// The plugins' fences spend a pool of their own, in claim order, like the CLI door's: slide packages cannot starve them.
	let fenceTotal = 0;
	const sections = new Map<string, string>();
	const unapproved = new Map<string, StudioCodePackage | StudioPlugin>();
	const failed: CodePackagesStatus['failed'] = [];
	const unlisted = new Set<string>();
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
		// A refusal of the manifest's facts version (slideInput marks it), which re-importing fixes.
		let manifestRefusal = false;
		let out = '';
		if (Date.now() - started > RENDER_BUDGET_MS) why = `the render's ${RENDER_BUDGET_MS / 1000} s budget for code packages ran out`;
		else {
			try {
				// The facts in the version the package's manifest declares; an undeclared one (a package saved
				// before the declaration existed) throws here and the slide keeps its note.
				const input = slideInput(c, await contractTokens(), p.facts as number);
				const raw = await (await frameFor(p, frames)).run(input, SLIDE_MS);
				total += raw.length;
				if (total > RENDER_OUTPUT_MAX) throw new Error(`the render's code packages returned more than ${RENDER_OUTPUT_MAX.toLocaleString('en-US')} characters in all`);
				const done = (doorFinish as DoorFinish)(document, doorSanitizer(), raw, c.html, c.pkg);
				if ('error' in done) why = done.error;
				else out = spliced(c.html, done.html, done.classes, c.pkg);
			} catch (e) {
				why = e instanceof Error ? e.message : String(e);
				manifestRefusal = (e as { factsVersion?: boolean })?.factsVersion === true;
			}
		}
		if (why) {
			failed.push({ name: c.pkg, slide: c.index + 1, why });
			const noted = withFailureNote(c.html, c.pkg, why);
			sections.set(key, noted);
			// A throw or a bad return fails the same way for the same input, so it is remembered; a
			// failure of TIME (a deadline, the budget, a stopped sandbox, a load that ran long) may be
			// the machine's, not the package's, and runs again next time (the inversion lens).
			// A facts-version refusal is the MANIFEST's, and the memo keys on the code alone: re-importing with
			// the declaration fixed must draw, so it is not remembered either (marked by slideInput, never
			// matched from a message a package could also throw).
			if (!manifestRefusal && !/budget|was stopped|did not finish|not loaded|in all/.test(why)) remember(key, noted);
		} else {
			remember(key, out);
			sections.set(key, out);
		}
	}
	// The plugins' fences, in claim order: the output cap, like the CLI door's, is spent down in that order.
	for (const c of capFences.claims) {
		const p = offered.get(c.pkg);
		if (!p) continue;
		const key = fenceKey(c, p.sha256);
		if (sections.has(key)) continue;
		const kindOf = (c as { inline?: string }).inline;
		if (!declared.has(p.name) && kindOf) {
			// An inline span of an unlisted plugin: the inline chip, sized by the kind's declared placeholder.
			sections.set(key, inlinePlaceholder(p.name, kindOf, p.kinds?.find((k) => k.name === kindOf)?.placeholder));
			unlisted.add(p.name);
			continue;
		}
		if (!declared.has(p.name)) {
			// Not in the deck's `plugins:`: nothing runs, and a drawn placeholder stands where the block is.
			// The plugin's declared placement; for a figure, the proportions it last DREW at win over the declared ones.
			const hint = placeholderHint(p.placeholder);
			// (`fencePlaceholder` keeps an aspect only for a figure, so a remembered one cannot size a stage or a chip.)
			sections.set(key, fencePlaceholder(p.name, { ...hint, aspect: rememberedAspect(p.sha256) ?? hint.aspect }));
			unlisted.add(p.name);
			continue;
		}
		// A span that cannot draw keeps its code: a note is a block, and a block in a sentence breaks it. The strip says why.
		const notDrawn = (why: string) => (kindOf ? c.block : withFenceNote(c.block, c.pkg, why));
		if (!isPluginApproved(p)) {
			unapproved.set(`plugin/${p.name}`, p);
			sections.set(key, notDrawn('its code has not been approved in this browser'));
			continue;
		}
		const known = memo.get(key);
		if (known) {
			fenceTotal += rawLength.get(key) ?? known.length;
			sections.set(key, fenceTotal > RENDER_OUTPUT_MAX ? notDrawn(fenceOutputNote(RENDER_OUTPUT_MAX)) : known);
			continue;
		}
		let why: string | null = null;
		let out = '';
		let rawLen = 0;
		if (Date.now() - started > RENDER_BUDGET_MS) why = `the render's ${RENDER_BUDGET_MS / 1000} s budget for code packages ran out`;
		else {
			try {
				const input = kindOf ? inlineInput(c as Parameters<typeof inlineInput>[0], inlineFields(p, kindOf, c.body)) : fenceInput(c);
				const raw = await (await frameFor(p, frames, true)).runFence(input, SLIDE_MS);
				fenceTotal += raw.length;
				rawLen = raw.length;
				if (fenceTotal > RENDER_OUTPUT_MAX) throw new Error(fenceOutputNote(RENDER_OUTPUT_MAX));
				const done = ((kindOf ? doorFinishInline : doorFinishFence) as DoorFinishFence)(document, doorSanitizer(), raw, fenceNamespace(p.name));
				if ('error' in done) why = done.error;
				else {
					out = kindOf ? inlineMarkup(c.pkg, kindOf, done.html) : fenceMarkup(c.pkg, done.html);
					if (!kindOf) rememberAspect(p.sha256, aspectOfOutput(done.html));
					// Serialization expands text (a non-breaking space is six characters): the cap counts what is spliced in too.
					if (out.length > raw.length) {
						fenceTotal += out.length - raw.length;
						rawLen = out.length;
						if (fenceTotal > RENDER_OUTPUT_MAX) throw new Error(fenceOutputNote(RENDER_OUTPUT_MAX));
					}
				}
			} catch (e) {
				why = e instanceof Error ? e.message : String(e);
			}
		}
		if (why) {
			failed.push({ name: c.pkg, slide: c.slide + 1, why: kindOf ? `@${kindOf}{…}: ${why}` : why });
			const noted = notDrawn(why);
			sections.set(key, noted);
			if (!/budget|was stopped|did not finish|not loaded|in all/.test(why)) remember(key, noted);
		} else {
			remember(key, out);
			rawLength.set(key, rawLen);
			sections.set(key, out);
		}
	}
	for (const f of frames.values()) f.then((fr) => fr.close()).catch(() => {});
	if (reporting) report({ unapproved: [...unapproved.values()], failed, ...(unlisted.size ? { offered: [...unlisted].map((n) => offered.get(n) as StudioPlugin) } : {}), ...(notes.length ? { notes } : {}) });
	return PG.render(source, theme, {
		...engineOpts,
		codePackages: substituteHook(names, sections, digestOf, { baseUrl, engineClaims: ENGINE_CLAIMS }),
		...(externalPlugins.length ? { externalPlugins } : {}),
		...(drawsAny ? { codeFences: substituteFences(fences, sections, pluginDigestOf, { names, engineClaims: ENGINE_CLAIMS, rebuilt: REBUILT, kinds }) } : {}),
	}) as R;
}
