// Seed the Studio settings a first visit lacks, before the island hydrates: the Craft posture (the full surface,
// as docs/e2e/studio-fixture.ts `gotoStudio` seeds it). Plain browser JS: Playwright passes it to addInitScript,
// run.mjs runs it through WebDriver on the Studio's origin before loading /studio/.
try {
	const k = 'lattice-studio-settings';
	const cur = JSON.parse(localStorage.getItem(k) || '{}');
	localStorage.setItem(k, JSON.stringify({ ...cur, posture: 'craft' }));
} catch {
	/* a blocked store: the Studio opens on its default posture, and the probe still finds the editor */
}
