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

import { ASPECT_RE, planFencePlugins } from '../../../../lib/packages/code-door-fence.mjs';
import { pluginConsentText } from '../../../../lib/packages/code-shape.mjs';
import FENCE_DOOR from '../../../../lib/packages/fence-door.generated.json';
import { deckPluginList } from '../../../../lib/plugins/deck-plugins.mjs';

/** A code package the Studio knows: a saved component whose package carries a `transform.js`. */
// `facts`: the slide-facts version the package's manifest declares (lib/packages/code-shape.mjs factsRefusal).
export type StudioCodePackage = { name: string; code: string; sha256: string; bytes: number; facts?: unknown };
/**
 * A zip PLUGIN the Studio knows: a saved plugin whose `render.js` owns one fence (plugin-system §9
 * decisions 3, 10 and 14). `code` is the renderer's text; `sha256` is the digest consent is pinned to
 * (`pluginDigest`: the fence's name AND the code's bytes). The Studio holds the code as text, so a
 * renderer whose file began with a byte-order mark or held an invalid byte has a different digest here
 * than the CLI's (which hashes the file's bytes): an approval never crosses between them either way.
 */
export type StudioPlugin = {
	kind: 'plugin';
	name: string;
	/** The one fence it owns, or '' for a plugin of inline kinds only. */
	fence: string;
	code: string;
	sha256: string;
	bytes: number;
	/** The manifest's `placeholder` hint (placement, aspect, size), reduced by `placeholderHint`. */
	placeholder?: { placement?: string; aspect?: string; size?: string };
	/** The inline kinds it draws (`@kind{…}`, 2026-10-14-plugin-inline-door.md), with each kind's declared slot and placeholder. */
	kinds?: StudioPluginKind[];
};
/** One inline kind a zip plugin declares: its name, its fields as a Segno slot spec, and its placeholder's size. */
export type StudioPluginKind = { name: string; slot?: unknown; placeholder?: { size?: string }; title?: string };
/** What the notice above the preview shows: the code this deck uses that is not approved. `notes` are the door's own warnings (a slide it left alone, and why). */
export type CodePackagesStatus = { unapproved: (StudioCodePackage | StudioPlugin)[]; failed: { name: string; slide: number; why: string }[]; /** Installed plugins whose fence the deck writes but whose name its `plugins:` list does not (a placeholder stands there). */ offered?: StudioPlugin[]; notes?: string[] };

const APPROVALS_KEY = 'lattice-code-package-approvals';

const packages = new Map<string, StudioCodePackage>();
const plugins = new Map<string, StudioPlugin>();
const listeners = new Set<(s: CodePackagesStatus) => void>();
let lastStatus: CodePackagesStatus = { unapproved: [], failed: [] };

/** The SHA-256 of a package's code, hex: the same digest `lattice packages trust` pins. */
export async function codeDigest(code: string): Promise<string> {
	const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
	return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The SHA-256 a plugin's consent is pinned to, hex: `lib/packages/trust.js pluginDigest`'s hash over
 * `pluginConsentText`, from the renderer's bytes as they are held here. The two share the text's shape
 * (head, code, tail), so a change to what the digest covers changes both.
 */
export async function pluginDigest(code: string, fence: string, kinds: readonly string[] = []): Promise<string> {
	const [head, tail] = pluginConsentText('\u0001', fence, [...kinds]).split('\u0001');
	const enc = new TextEncoder();
	const parts = [enc.encode(head), enc.encode(code), enc.encode(tail)];
	const all = new Uint8Array(parts.reduce((n, a) => n + a.length, 0));
	let at = 0;
	for (const a of parts) {
		all.set(a, at);
		at += a.length;
	}
	return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', all)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A plugin's approval is under `plugin/<name>`, so it shares no key with a component of the same name. */
const pluginKey = (name: string) => `plugin/${name}`;

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

/** Has the user approved exactly this plugin code, with this fence, in this browser? */
export function isPluginApproved(p: Pick<StudioPlugin, 'name' | 'sha256'>): boolean {
	return readApprovals()[pluginKey(p.name)]?.sha256 === p.sha256;
}

/** Record the user's yes for this plugin's code and fence, in this browser. Changed code, or a changed fence, asks again. */
export function approvePlugin(p: Pick<StudioPlugin, 'name' | 'sha256'>): void {
	approveCodePackage({ name: pluginKey(p.name), sha256: p.sha256 });
}

/** Withdraw a plugin's approval in this browser. */
export function revokePlugin(name: string): void {
	revokeCodePackage(pluginKey(name));
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
export async function setCodePackages(list: { name: string; code: string; facts?: unknown }[]): Promise<void> {
	// Two calls can overlap (the Library changed twice quickly); only the latest one lands.
	const mine = ++setSeq;
	const next = new Map<string, StudioCodePackage>();
	for (const p of list) next.set(p.name, { name: p.name, code: p.code, sha256: await codeDigest(p.code), bytes: new TextEncoder().encode(p.code).length, facts: p.facts });
	if (mine !== setSeq) return;
	packages.clear();
	for (const [k, v] of next) packages.set(k, v);
}

/**
 * The plugins the Studio's renders may run: every saved zip plugin. Replaces the whole set. A plugin
 * only draws in a deck that lists it under `plugins:` (decision 11), and only once approved.
 */
let setPluginsSeq = 0;
export async function setPlugins(list: { name: string; fence: string; code: string; placeholder?: { placement?: string; aspect?: string; size?: string }; kinds?: StudioPluginKind[] }[]): Promise<void> {
	const mine = ++setPluginsSeq;
	const next = new Map<string, StudioPlugin>();
	for (const p of list) {
		const kinds = (p.kinds ?? []).filter((k) => k && typeof k.name === 'string');
		next.set(p.name, {
			kind: 'plugin',
			name: p.name,
			fence: p.fence ?? '',
			code: p.code,
			sha256: await pluginDigest(p.code, p.fence ?? '', kinds.map((k) => k.name)),
			bytes: new TextEncoder().encode(p.code).length,
			...(p.placeholder ? { placeholder: p.placeholder } : {}),
			...(kinds.length ? { kinds } : {}),
		});
	}
	if (mine !== setPluginsSeq) return;
	plugins.clear();
	for (const [k, v] of next) plugins.set(k, v);
}

const ASPECTS_KEY = 'lattice-plugin-aspects';

/**
 * The proportions a plugin's block last had when it DREW (`aspectOfOutput`), by the code's digest. The placeholder a
 * deck shows before the plugin is listed or approved uses it, so it stands where the real block will be. Browser-local,
 * like the approval: nothing a deck or a backup carries.
 */
export function rememberedAspect(sha256: string): string | null {
	try {
		const v = (JSON.parse(localStorage.getItem(ASPECTS_KEY) || '{}') as Record<string, unknown>)[sha256];
		return typeof v === 'string' && ASPECT_RE.test(v) ? v : null;
	} catch {
		return null;
	}
}

export function rememberAspect(sha256: string, aspect: string | null): void {
	if (!aspect || rememberedAspect(sha256) === aspect) return;
	try {
		const all = JSON.parse(localStorage.getItem(ASPECTS_KEY) || '{}') as Record<string, string>;
		const keys = Object.keys(all);
		// Bounded: the oldest forgotten past 200 plugin versions.
		if (keys.length >= 200) delete all[keys[0]];
		all[sha256] = aspect;
		localStorage.setItem(ASPECTS_KEY, JSON.stringify(all));
	} catch {
		/* storage unavailable: the placeholder falls back to the manifest's hint, then the default */
	}
}

/** The plugins the Studio knows, for door-run.ts. */
export function studioPlugins(): ReadonlyMap<string, StudioPlugin> {
	return plugins;
}

/** The installed plugins the door will run at all: the rules both doors share (a refused plugin is never offered or approvable). */
function runnablePlugins(): StudioPlugin[] {
	const ok = new Set(planFencePlugins([...plugins.values()].map((p) => ({ name: p.name, fence: p.fence, kinds: (p.kinds ?? []).map((k) => k.name) })), { shipped: FENCE_DOOR.shippedFences, isLanguage: (n: string) => FENCE_DOOR.highlightLanguages.includes(n), shippedKinds: FENCE_DOOR.shippedKinds }).run.map((p: { name: string }) => p.name));
	return [...plugins.values()].filter((p) => ok.has(p.name));
}

/** Does `source` hold a fenced block whose info string starts with `fence`? A superset (a quoted fence counts); the render's own claims are exact. */
const writesFence = (source: string, fence: string) => !!fence && new RegExp(`^[ \\t]*(?:\`{3,}|~{3,})[ \\t]*${fence.replace(/[^a-z0-9-]/g, '')}(?![\\w-])`, 'm').test(source);
/** Does `source` hold an `@kind{` span? A superset, as `writesFence` is (2026-10-14-plugin-inline-door.md). */
const writesKind = (source: string, kind: string) => source.includes(`\`@${kind.replace(/[^a-z0-9-]/g, '')}{`);
/** Does `source` use the plugin at all: its fence, or any of its inline kinds? */
const usesPlugin = (source: string, p: StudioPlugin) => writesFence(source, p.fence) || (p.kinds ?? []).some((k) => writesKind(source, k.name));

/**
 * The code packages a deck names that this browser has not approved: read from the SOURCE, so the
 * notice describes the whole deck, not only the slide on screen: front-matter `class:`, each
 * `_class:` / `class:` comment, and each `pane:` marker, outside fenced code.
 */
export function unapprovedIn(source: string): (StudioCodePackage | StudioPlugin)[] {
	// A plugin counts once the deck lists it AND writes its fence or one of its `@kind{…}` spans: that is when the preview needs the code.
	const pluginsWanted: StudioPlugin[] = plugins.size ? runnablePlugins().filter((p) => !isPluginApproved(p) && deckPluginList(source).includes(p.name) && usesPlugin(source, p)) : [];
	if (!packages.size) return pluginsWanted;
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
	return [...[...packages.values()].filter((p) => tokens.has(p.name) && !isApproved(p)), ...pluginsWanted];
}

/**
 * The installed plugins whose fence a deck WRITES but whose name its `plugins:` list does not carry: each
 * stands as a placeholder in the preview, and the strip offers to approve it (decision 11). Read from the
 * source, so the strip describes the whole deck and not only the slide on screen.
 */
export function offeredIn(source: string): StudioPlugin[] {
	if (!plugins.size) return [];
	const listed = deckPluginList(source);
	return runnablePlugins().filter((p) => !listed.includes(p.name) && usesPlugin(source, p));
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
	if (!packages.size && !plugins.size) {
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
	if (!packages.size && !plugins.size) return '';
	const parts = [
		...[...packages.values()].sort((a, b) => a.name.localeCompare(b.name)).map((p) => `${p.name}@${p.sha256.slice(0, 16)}${isApproved(p) ? '+' : '-'}`),
		...[...plugins.values()].sort((a, b) => a.name.localeCompare(b.name)).map((p) => `plugin/${p.name}@${p.sha256.slice(0, 16)}${isPluginApproved(p) ? '+' : '-'}`),
	];
	return `/* lattice code packages: ${parts.join(' ')} */`;
}
