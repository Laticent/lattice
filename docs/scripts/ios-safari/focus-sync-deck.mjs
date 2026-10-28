/** The deck and the loop the focus-sync probe uses, shared by run.mjs (Mobile Safari) and focus-sync.selftest.mjs (Playwright WebKit). */
export const SOURCE_KEY = 'lattice-docs-pg-source';
export const SLIDES = 8;
/** Taps per device. Slides 1 and 2 alternate (only their lines fit on screen): a tap on the slide already in focus centers nothing, so the tap on slide 1 resets it. */
export const TAPS = 40;
export const TARGETS = [1, 2];

export const deck = (() => {
	const out = ['---', 'theme: cuoio', '---', ''];
	for (let i = 1; i <= SLIDES; i++) out.push(`# Slide ${i} title`, '', ...Array.from({ length: 6 }, (_, k) => `- point ${i}.${k}`), '', '---', '');
	return out.join('\n');
})();

/** Script text that seeds the deck on the Playground's origin before it loads. */
export const seedScript = `try { localStorage.setItem(${JSON.stringify(SOURCE_KEY)}, ${JSON.stringify(deck)}); } catch {}`;

/** A tap passes when the editor stayed put (under 2 px, as the e2e spec asserts) and the slide was centered. */
export const verdict = (rows) => {
	const jumps = rows.filter((r) => r.moved >= 2);
	return { ok: jumps.length === 0, jumps: jumps.length, worst: Math.max(0, ...rows.map((r) => r.moved)), taps: rows.length };
};
