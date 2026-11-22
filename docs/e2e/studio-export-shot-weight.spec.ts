import { createRequire } from 'node:module';
import { expect, gotoStudio, railButtons, shareExport, test } from './studio-fixture';

// STUDIO EXPORT SHOT WEIGHT: how much font CSS each slide's picture carries in the real Studio's PDF export.
//
// WHY IT EXISTS. The shared slide camera (PR 2904) made the Studio's PDF export of a 52-slide photo deck 2.15x slower
// (112 s against 52 s) and crashed an iPhone on it, and nothing caught it. A CPU profile put the cost in decoding each
// slide's SVG: every shot carried the page's whole stylesheet with all 79 `@font-face` rules, about 1.7 MB of base64,
// whether the slide drew with those faces or not. The fix (`onlyUsedFontFaces`, `withoutDuplicateFaces` and
// `withoutHostFamilies` in lib/core/slide-camera.mjs) keeps only the faces a slide draws. Their unit tests
// (test/unit/core/slide-camera-faces.test.js) check the functions; this checks that the Studio's export still calls them.
//
// HOW IT MEASURES. By counting work, not time (HARD RULE #32). An init script wraps `Blob`, the one door every shot
// goes through on its way to an <img> (slide-camera.mjs `readAsDataURL(new Blob([svg], { type: 'image/svg+xml' }))`),
// and records each SVG's `@font-face` rule count and bytes. The export's seconds are printed for a reader and never
// asserted: speed belongs to `npm run bench` (#19).
//
// THE CEILINGS sit between the healthy reading and the regression, measured on this deck on 2026-11-21: healthy, at most 25
// rules and 727 KB of face CSS in one shot; with `onlyUsedFontFaces` switched off, 49 rules and 1.61 MB. Both are counts the
// code alone decides, so a ceiling can sit close to either side. If a change adds a face the deck really draws, re-measure and
// move the number with the reason in the PR (engineering/decisions/2026-08-03-performance-guard.md).
const MAX_FACES_PER_SHOT = Number(process.env.SHOT_MAX_FACES || 36);
const MAX_FACE_BYTES_PER_SHOT = Number(process.env.SHOT_MAX_FACE_BYTES || 1_100_000);

const SLIDES = 6;
// Prose, emphasis, code and a table, so a shot draws with the body, heading, italic and mono faces a real deck uses.
const DECK = `---\ntheme: indaco\n---\n\n${Array.from(
	{ length: SLIDES },
	(_, i) => `## Slide ${i + 1}\n\nA paragraph with **bold**, *italic* and \`code\`.\n\n| Item | Value |\n|---|---|\n| one | ${i} |`,
).join('\n\n---\n\n')}\n`;

type Shot = { bytes: number; faces: number; faceBytes: number };

const require = createRequire(import.meta.url);

/** The deck as a `.lattice` project, loaded through the Library's file input: that works at every width, where typing into the
 *  editor does not reach the phone layout's hidden editor pane. */
async function latticeFile(): Promise<Buffer> {
	const JSZip = require('../../node_modules/jszip') as typeof import('jszip');
	const zip = new JSZip();
	zip.file('deck.md', DECK);
	zip.file('manifest.json', JSON.stringify({ format: 'lattice', version: 1, title: 'Export shot weight', engine: 'lattice', generatedAt: 1790000000000, comments: [] }));
	zip.file('media.json', '[]');
	return zip.generateAsync({ type: 'nodebuffer' });
}

test('the Studio PDF export carries only the fonts each slide draws in its picture @crosswidth @webkit-tablet @gecko', async ({ page }) => {
	test.setTimeout(240_000);
	await page.addInitScript(() => {
		const shots: { bytes: number; faces: number; faceBytes: number }[] = [];
		(window as unknown as { __shots: typeof shots }).__shots = shots;
		const Native = window.Blob;
		const record = (parts: BlobPart[] | undefined, type: string | undefined) => {
			if (type !== 'image/svg+xml' || !parts) return;
			const text = parts.map((p) => (typeof p === 'string' ? p : '')).join('');
			const rules = text.match(/@font-face\s*\{[^}]*\}/g) || [];
			shots.push({ bytes: text.length, faces: rules.length, faceBytes: rules.reduce((n, r) => n + r.length, 0) });
		};
		window.Blob = class extends Native {
			constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
				super(parts, options);
				record(parts, options?.type);
			}
		};
	});
	await gotoStudio(page);
	await page.locator('input[type="file"][accept*=".lattice"]').setInputFiles({ name: 'shot-weight.lattice', mimeType: 'application/zip', buffer: await latticeFile() });
	await expect(railButtons(page)).toHaveCount(SLIDES, { timeout: 60_000 });

	await page.getByRole('button', { name: 'Share', exact: true }).first().click();
	await expect(page.getByRole('dialog')).toBeVisible();
	// Count only the export's shots: anything the camera drew before this click (a thumbnail, a fit check) must not pad the count.
	await page.evaluate(() => {
		(window as unknown as { __shots: unknown[] }).__shots.length = 0;
	});
	const download = page.waitForEvent('download', { timeout: 180_000 });
	const t0 = Date.now();
	await shareExport(page, 'pdf');
	await download;
	const seconds = (Date.now() - t0) / 1000; // printed for a reader, never asserted

	const shots = await page.evaluate(() => (window as unknown as { __shots: Shot[] }).__shots);
	const worst = shots.reduce((a, s) => (s.faceBytes > a.faceBytes ? s : a), { bytes: 0, faces: 0, faceBytes: 0 });
	const most = Math.max(0, ...shots.map((s) => s.faces));
	console.log(`\nSTUDIO-EXPORT-SHOTS slides=${SLIDES} shots=${shots.length} maxFaces=${most} maxFaceBytes=${worst.faceBytes} maxShotBytes=${Math.max(0, ...shots.map((s) => s.bytes))} export=${seconds.toFixed(1)}s`);

	// One shot per slide, all from the export. Zero means the camera moved off `Blob`, and this spec must be moved with it.
	expect(shots.length, 'the export did not send exactly one SVG per slide through Blob: the camera no longer goes through the door this spec watches').toBe(SLIDES);
	// A shot that carries no face at all would mean the slide draws with fallback fonts, which is a different defect.
	expect(Math.min(...shots.map((s) => s.faces)), 'a shot carried no @font-face: its text would draw in a fallback font').toBeGreaterThan(0);
	expect(most, `a slide's picture carried ${most} @font-face rules; the ceiling is ${MAX_FACES_PER_SHOT}. The camera is shipping faces the slide does not draw.`).toBeLessThanOrEqual(MAX_FACES_PER_SHOT);
	expect(worst.faceBytes, `a slide's picture carried ${worst.faceBytes} bytes of @font-face CSS; the ceiling is ${MAX_FACE_BYTES_PER_SHOT}.`).toBeLessThanOrEqual(MAX_FACE_BYTES_PER_SHOT);
});
