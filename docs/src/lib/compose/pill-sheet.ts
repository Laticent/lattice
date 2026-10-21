// THE PILL SHEET — what lets Compose draw a pill the way the slide draws it.
//
// Compose lives in the Studio page, and the page does not carry the deck's CSS: the engine's pill
// rules and the theme's tokens live in the PREVIEW frame's stylesheet. To show the real pill in
// the text instead of its grammar (owner, 2026-10-13), this module copies out of that frame, at
// runtime, exactly two things, so there is no second copy of the pill's look to drift:
//
//   1. every rule whose selector names `.lat-pill`, `.lat-spark`, `.lat-avatar` or `.lat-icon` (shape
//      geometry, sizes, the icon slot, a spark's frame, marks and dots, an avatar's tile, an icon's frame), and
//   2. the current value of every custom property those rules read (`--pill-*`, `--cat-N-fill`,
//      `--text-body`, ...), taken from the first slide's computed style.
//
// Both go into ONE constructable stylesheet adopted by the document. The rules sit inside
// `@scope (.cs-pill-scope)` and the tokens on `.cs-pill-scope` itself, so nothing here can restyle
// Compose's own chrome, which uses some of the same token names with the Studio's values.
//
// Until the sheet is ready (no preview frame yet, a browser without constructable stylesheets or
// `@scope`) `pillSheetReady()` is false and Compose keeps showing the grammar with the tag button,
// which is the pill editor's first form. A missing sheet degrades the picture, never the editor.

export const PILL_SCOPE = 'cs-pill-scope';

const VAR = /var\(\s*(--[\w-]+)/g;

/** The class names whose rules Compose copies: the inline objects it draws. */
const OBJECT_CLASSES = ['lat-pill', 'lat-spark', 'lat-avatar', 'lat-icon'];

/** The rules of `sheets` that style a pill, spark, avatar or icon, as CSS text, with their `@media`-style wrappers kept. */
export function collectPillRules(sheets: Iterable<CSSStyleSheet>): string[] {
	const out: string[] = [];
	for (const sheet of sheets) {
		let rules: CSSRuleList;
		try {
			rules = sheet.cssRules;
		} catch {
			continue; // a cross-origin sheet: not ours to read
		}
		collectFrom(rules, out);
	}
	return out;
}

function collectFrom(rules: CSSRuleList, out: string[]): void {
	for (const rule of Array.from(rules)) {
		// Duck-typed: the preview frame is another realm, so `instanceof CSSStyleRule` is false for its rules.
		if ('selectorText' in rule) {
			if (OBJECT_CLASSES.some((c) => (rule as CSSStyleRule).selectorText.includes(c))) out.push(rule.cssText);
			continue;
		}
		const inner = (rule as CSSGroupingRule).cssRules;
		const text = rule.cssText;
		if (!inner || !/^@(media|supports|container)\b/.test(text)) continue;
		const nested: string[] = [];
		collectFrom(inner, nested);
		if (nested.length) out.push(`${text.slice(0, text.indexOf('{'))}{${nested.join('\n')}}`);
	}
}

/** The custom properties the pill rules read, in first-use order. */
export function tokenNames(rules: readonly string[]): string[] {
	const seen = new Set<string>();
	for (const r of rules) for (const m of r.matchAll(VAR)) seen.add(m[1]);
	return [...seen];
}

/**
 * The sheet text: tokens on the scope, then the pill rules inside `@scope`.
 *
 * `scheme` is the preview frame's own `color-scheme`. The deck's tokens are `light-dark(a, b)`, a string
 * that is the same in both modes and resolves from the `color-scheme` of the element it is used on. The
 * Studio page themes through `data-mode`, so its own `color-scheme` stays `light` and the pill came out
 * light on a dark deck. Measured on the real Studio with the real mode toggle: the preview's pill was
 * rgb(0, 114, 37) and Compose's rgb(210, 220, 189). Setting the frame's scheme on the scope makes
 * `light-dark()` resolve here exactly as it does in the slide.
 */
export function buildSheetText(rules: readonly string[], tokens: Readonly<Record<string, string>>, scheme = ''): string {
	const decls = Object.entries(tokens)
		.filter(([, v]) => v)
		.map(([k, v]) => `${k}:${v}`);
	if (/^(only )?(light|dark)( (light|dark))?( only)?$|^normal$/.test(scheme)) decls.push(`color-scheme:${scheme}`);
	return `.${PILL_SCOPE}{${decls.join(';')}}\n@scope (.${PILL_SCOPE}){${rules.join('\n')}}`;
}

let adopted: CSSStyleSheet | null = null;
let builtKey = '';

function liveFrame(): HTMLIFrameElement | null {
	return document.querySelector<HTMLIFrameElement>('#studio-preview iframe.live') ?? document.querySelector<HTMLIFrameElement>('iframe.live');
}

/** Is there a pill sheet to draw with? */
export function pillSheetReady(): boolean {
	return adopted !== null;
}

/**
 * Rebuild the sheet from the preview frame if what it was built from has changed. Cheap when it
 * has not (a few reads), so callers can ask often. Returns whether the sheet is ready, and calls
 * `onChange` only when a new sheet was adopted.
 */
export function syncPillSheet(onChange?: () => void): boolean {
	try {
		if (typeof CSSStyleSheet === 'undefined' || !('adoptedStyleSheets' in document)) return false;
		const frame = liveFrame();
		const doc = frame?.contentDocument;
		const win = frame?.contentWindow;
		const section = doc?.querySelector('section');
		if (!doc || !win || !section) return adopted !== null;
		const rules = collectPillRules(Array.from(doc.styleSheets));
		if (!rules.length) return adopted !== null;
		const cs = win.getComputedStyle(section);
		const tokens: Record<string, string> = {};
		for (const name of tokenNames(rules)) {
			const v = cs.getPropertyValue(name).trim();
			if (v) tokens[name] = v;
		}
		const text = buildSheetText(rules, tokens, cs.colorScheme.trim());
		// The text IS the key: a theme, mode or engine change alters a token or a rule, and nothing else does.
		if (text === builtKey && adopted) return true;
		const sheet = new CSSStyleSheet();
		sheet.replaceSync(text);
		// A browser without `@scope` drops the at-rule silently; adopting what is left would style nothing.
		if (!Array.from(sheet.cssRules).some((r) => r.cssText.startsWith('@scope'))) return adopted !== null;
		document.adoptedStyleSheets = [...document.adoptedStyleSheets.filter((s) => s !== adopted), sheet];
		adopted = sheet;
		builtKey = text;
		onChange?.();
		return true;
	} catch {
		return adopted !== null;
	}
}

/** Drop the adopted sheet (a test, or the Studio unmounting). */
export function releasePillSheet(): void {
	if (adopted && typeof document !== 'undefined' && 'adoptedStyleSheets' in document) {
		document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== adopted);
	}
	adopted = null;
	builtKey = '';
}
