/** The deck and the loop the focus-sync probe uses, shared by run.mjs (Mobile Safari) and focus-sync.selftest.mjs (Playwright WebKit). */
export const SOURCE_KEY = 'lattice-docs-pg-source';
export const SLIDES = 8;
/** Taps per device. Slide 1 and a second slide alternate: a tap on the slide already in focus centers nothing, so the tap on slide 1 resets it. The probe picks the second slide (`lsTarget`) from what the page can show and center. */
export const TAPS = 40;

export const deck = (() => {
	const out = ['---', 'theme: cuoio', '---', ''];
	for (let i = 1; i <= SLIDES; i++) out.push(`# Slide ${i} title`, '', ...Array.from({ length: 6 }, (_, k) => `- point ${i}.${k}`), '', '---', '');
	return out.join('\n');
})();

/** Script text that seeds the deck on the Playground's origin before it loads. */
export const seedScript = `try { localStorage.setItem(${JSON.stringify(SOURCE_KEY)}, ${JSON.stringify(deck)}); } catch {}`;

/** A tap passes when the editor stayed put (under 2 px, as the e2e spec asserts) and, for a slide past the first, the preview centered it. */
export const verdict = (rows) => {
	const jumps = rows.filter((r) => r.moved >= 2);
	const uncentered = rows.filter((r) => r.centered === false);
	return { ok: jumps.length === 0 && uncentered.length === 0, jumps: jumps.length, uncentered: uncentered.length, worst: Math.max(0, ...rows.map((r) => r.moved)), taps: rows.length };
};
