// DRAWING MATH IN COMPOSE — the KaTeX the engine uses, as native MathML, in the editor's own realm.
//
// Compose draws a math span or block and previews it while the author types in the panel. It uses the SAME KaTeX build the
// engine renders slides with (the on-demand bundle `lattice-katex.js`, which exposes it as `window.__latticeKatex`), but asks
// for `output: 'mathml'`: the browser draws MathML itself, so the editor needs none of KaTeX's stylesheet or fonts, and what
// it shows is the shape of the formula, not the slide's typesetting. The slide preview beside it draws the real thing.
//
// The result is parsed through DOMPurify (HARD RULE #22's reasoning: the TeX can come from a shared deck, and KaTeX's output
// is markup). `trust` is off, so `\href`, `\includegraphics` and the like stay inert; the sanitizer is the second wall.
//
// Until the bundle has loaded `drawMath` returns null and the caller shows the TeX source; `onMathReady` says when to redraw.

import DOMPurify from 'dompurify';
import { deriveKatexProviderUrl, ensureKatexProvider } from '../ensure-katex';

const waiting = new Set<() => void>();
let requested = false;

/** Is the KaTeX bundle loaded? */
export function mathReady(): boolean {
	return typeof window !== 'undefined' && Boolean(window.__latticeKatex);
}

/** Start loading the bundle (once) and call `cb` when it is ready. Returns the unsubscribe. A load that fails leaves the TeX source drawn. */
export function onMathReady(cb: () => void): () => void {
	if (mathReady()) {
		cb();
		return () => {};
	}
	waiting.add(cb);
	if (!requested) {
		const url = deriveKatexProviderUrl();
		if (url) {
			requested = true;
			ensureKatexProvider(url)
				.then(() => {
					for (const f of [...waiting]) f();
					waiting.clear();
				})
				.catch(() => {
					requested = false; // a later math node tries again
				});
		}
	}
	return () => waiting.delete(cb);
}

/** `tex` as sanitized MathML, or null while KaTeX is not loaded. Bad TeX comes back as KaTeX's own error text, never a throw. */
export function drawMath(tex: string, display: boolean): DocumentFragment | null {
	const katex = typeof window === 'undefined' ? undefined : window.__latticeKatex;
	if (!katex) return null;
	let html: string;
	try {
		html = katex.renderToString(tex, { output: 'mathml', displayMode: display, throwOnError: false, trust: false, strict: 'ignore', maxExpand: 1000 });
	} catch {
		return null;
	}
	return DOMPurify.sanitize(html, { USE_PROFILES: { mathMl: true }, ADD_TAGS: ['span'], RETURN_DOM_FRAGMENT: true });
}

/** A test seam: forget the load state. */
export function resetMathDrawForTests(): void {
	waiting.clear();
	requested = false;
}
