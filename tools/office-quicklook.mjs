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
 *   report.json                     what was rendered, and anything that failed
 *
 * It renders the file as Calco writes it, one PNG per slide, to compare with the same file in LibreOffice. The variants
 * an earlier run compared (shapes ungrouped, marks regrouped, paths in a 21600 space, no child frame) settled the design
 * and were retired: engineering/decisions/2026-11-01-icon-font.md § 3.6 records what each drew.
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

const VARIANTS = { 'as-exported': (x) => x };


/** The file cut to slide `keep` (1-based): the other slides leave the slide list, so Quick Look's first page is this one. */
async function oneSlide(zip, keep) {
	const pres = await zip.file('ppt/presentation.xml').async('string');
	const rels = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
	const ids = [...pres.matchAll(/<p:sldId [^>]*r:id="([^"]+)"[^>]*\/>/g)];
	const target = (rid) => rels.match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`))?.[1] || rels.match(new RegExp(`Target="([^"]+)"[^>]*Id="${rid}"`))?.[1];
	const keepTag = ids.find(([, rid]) => target(rid) === `slides/slide${keep}.xml`)?.[0];
	if (!keepTag) return null;
	const cut = pres.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, `<p:sldIdLst>${keepTag}</p:sldIdLst>`);
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
		for (const f of Object.keys(zip.files).filter((f) => SLIDE.test(f))) zip.file(f, rewrite(await zip.file(f).async('string')));
		const dir = path.join(OUT, name, variant);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, `${name}.pptx`), await zip.generateAsync({ type: 'nodebuffer' }));
		for (const n of slides) {
			if (custgeomOnly && !(await original.file(`ppt/slides/slide${n}.xml`).async('string')).includes('<a:custGeom>')) continue;
			const file = path.join(dir, `slide-${String(n).padStart(2, '0')}.pptx`);
			const buf = await oneSlide(zip, n);
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
	}
}
fs.writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`office-quicklook: ${report.rendered.length} slides rendered, ${report.failed.length} failed${report.skipped ? ` (${report.skipped})` : ''} → ${path.relative(ROOT, OUT)}`);
if (onMac && (report.failed.length || !report.rendered.length)) process.exit(1);
