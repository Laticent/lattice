#!/usr/bin/env node
/**
 * tools/office-quicklook.mjs — render editable PowerPoint exports through macOS Quick Look, one PNG per slide.
 *
 * Why: iPhone Preview (what opens a .pptx from Mail or Files) draws office files with Apple's own Office importer, and it
 * draws them unlike PowerPoint, LibreOffice or Google Slides (engineering/decisions/2026-11-01-icon-font.md § 3.6: it
 * ignores embedded fonts and collapsed every icon shape that sat inside a group to a speck). macOS Quick Look uses the
 * same importer, so `qlmanage` on a macOS runner is the reachable stand-in. It is a platform suite (dispatch and nightly,
 * never on a pull request): `.github/platform-suites.json` `office-quicklook`.
 *
 * What it writes, under platform-suite-artifacts/office-quicklook/:
 *   <deck>/<variant>/slide-NN.png   Quick Look's render of each slide (each slide is cut into a one-slide file first,
 *                                   because a Quick Look thumbnail shows only the first slide)
 *   <deck>/<variant>/slides-AA-BB-CC.pptx   three slides in a row (a deck of at most 16 slides), for the iOS probe:
 *                                   the iPhone drew shapes from one slide onto later ones
 *   index.json                      every file the iOS probe opens
 *   report.json                     what was rendered, and anything that failed
 *
 * It renders the file as Calco writes it, one PNG per slide, to compare with the same file in LibreOffice. The variants
 * an earlier run compared (shapes ungrouped, marks regrouped, paths in a 21600 space, no child frame) settled the design
 * and were retired: engineering/decisions/2026-11-01-icon-font.md § 3.6 records what each drew. `VARIANTS` holds the
 * ones under test now.
 * `--custgeom-only` renders just the slides that hold custom geometry (for a big deck such as the gallery).
 *
 * Usage (macOS):  node tools/office-quicklook.mjs [deck.md ...]      default: examples/inline-icons.md
 * Elsewhere it still exports and cuts the files (so the XML rewrite is testable) and skips the render, saying so.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'platform-suite-artifacts', 'office-quicklook');
const args = process.argv.slice(2);
const custgeomOnly = args.includes('--custgeom-only');
const deckArgs = args.filter((a) => !a.startsWith('--'));
const decks = deckArgs.length ? deckArgs : ['examples/inline-icons.md'];
const onMac = process.platform === 'darwin';
const index = [];
const report = { platform: process.platform, rendered: [], failed: [], skipped: onMac ? null : 'not macOS: qlmanage is not here' };

const SLIDE = /^ppt\/slides\/slide(\d+)\.xml$/;

/**
 * Each variant rewrites one slide's XML (`n` is its number). Only `as-exported` is cut to one-slide files and rendered
 * by qlmanage; every variant is cut to runs of three for the iOS probe. The others test why iPhone Preview drew shapes
 * from one slide onto a later one (engineering/decisions/2026-11-01-icon-font.md § 3.6): shape ids made unique across
 * the deck, no shape descriptions, and a background of the slide's own.
 */
const VARIANTS = {
	'as-exported': (x) => x,
	'deck-unique-ids': (x, n) => x.replace(/(<p:cNvPr id=")(\d+)"/g, (_a, h, id) => `${h}${n * 1000 + Number(id)}"`).replace(/(<a:(?:stCxn|endCxn) id=")(\d+)"/g, (_a, h, id) => `${h}${n * 1000 + Number(id)}"`).replace(/( spid=")(\d+)"/g, (_a, h, id) => `${h}${n * 1000 + Number(id)}"`),
	'no-descr': (x) => x.replace(/(<p:cNvPr [^>]*?) descr="[^"]*"/g, '$1'),
	'own-background': (x) => (x.includes('<p:bg>') ? x : x.replace('<p:cSld>', '<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>').replace(/<p:cSld( [^>]*)>/, '<p:cSld$1><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>')),
};
/** The most slides a deck may have to be cut to runs of three for the iOS probe (the gallery is far past it). */
const MAX_RUNS = 16;


/** The file cut to the slides `keep` (1-based, in order): the other slides leave the slide list, so Quick Look's first
 * page is the first of them. */
async function cutTo(zip, keep) {
	const pres = await zip.file('ppt/presentation.xml').async('string');
	const rels = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
	const ids = [...pres.matchAll(/<p:sldId [^>]*r:id="([^"]+)"[^>]*\/>/g)];
	const target = (rid) => rels.match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`))?.[1] || rels.match(new RegExp(`Target="([^"]+)"[^>]*Id="${rid}"`))?.[1];
	const tags = keep.map((n) => ids.find(([, rid]) => target(rid) === `slides/slide${n}.xml`)?.[0]);
	if (tags.some((t) => !t)) return null;
	const cut = pres.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, `<p:sldIdLst>${tags.join('')}</p:sldIdLst>`);
	const copy = await JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }));
	copy.file('ppt/presentation.xml', cut);
	return copy.generateAsync({ type: 'nodebuffer' });
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const deck of decks) {
	const name = path.basename(deck, '.md');
	const pptx = path.join(OUT, `${name}.pptx`);
	execFileSync(process.execPath, [path.join(ROOT, 'lattice.js'), path.resolve(ROOT, deck), pptx, '--editable', '--quiet'], { cwd: ROOT, stdio: 'inherit' });
	const original = await JSZip.loadAsync(fs.readFileSync(pptx));
	const slides = Object.keys(original.files).map((f) => Number(f.match(SLIDE)?.[1])).filter(Boolean).sort((a, b) => a - b);
	for (const [variant, rewrite] of Object.entries(VARIANTS)) {
		const zip = await JSZip.loadAsync(fs.readFileSync(pptx));
		for (const f of Object.keys(zip.files).filter((f) => SLIDE.test(f))) zip.file(f, rewrite(await zip.file(f).async('string'), Number(f.match(SLIDE)[1])));
		const dir = path.join(OUT, name, variant);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, `${name}.pptx`), await zip.generateAsync({ type: 'nodebuffer' }));
		for (const n of variant === 'as-exported' ? slides : []) {
			if (custgeomOnly && !(await original.file(`ppt/slides/slide${n}.xml`).async('string')).includes('<a:custGeom>')) continue;
			const file = path.join(dir, `slide-${String(n).padStart(2, '0')}.pptx`);
			const buf = await cutTo(zip, [n]);
			if (!buf) {
				report.failed.push({ deck: name, variant, slide: n, why: 'slide not in the slide list' });
				continue;
			}
			fs.writeFileSync(file, buf);
			// Kept beside its render: the iOS probe (docs/scripts/ios-safari/run.sh, PROBE=office) shows each cut in QLProbe.
			index.push({ deck: name, slide: n, variant, path: path.relative(OUT, file) });
			if (!onMac) continue;
			const r = spawnSync('qlmanage', ['-t', '-s', '1920', '-o', dir, file], { encoding: 'utf8', timeout: 120000 });
			const png = `${file}.png`;
			if (r.status === 0 && fs.existsSync(png)) {
				fs.renameSync(png, file.replace(/\.pptx$/, '.png'));
				report.rendered.push({ deck: name, variant, slide: n });
			} else report.failed.push({ deck: name, variant, slide: n, why: (r.stderr || r.stdout || `exit ${r.status}`).trim().slice(0, 400) });
		}
		// A short deck also goes to the iOS probe as every run of three slides in a row (one iPhone screen holds about three
		// and a half): the owner's iPhone drew shapes from earlier slides onto later ones, which no one-slide file can show.
		if (slides.length <= MAX_RUNS) {
			for (let i = 0; i + 2 < slides.length; i++) {
				const run = slides.slice(i, i + 3);
				const file = path.join(dir, `slides-${run.map((n) => String(n).padStart(2, '0')).join('-')}.pptx`);
				fs.writeFileSync(file, await cutTo(zip, run));
				index.push({ deck: name, slides: run, variant, path: path.relative(OUT, file) });
			}
		}
	}
}
fs.writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`office-quicklook: ${report.rendered.length} slides rendered, ${report.failed.length} failed${report.skipped ? ` (${report.skipped})` : ''} → ${path.relative(ROOT, OUT)}`);
if (onMac && (report.failed.length || !report.rendered.length)) process.exit(1);
