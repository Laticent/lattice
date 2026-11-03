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
 * VARIANTS rewrite the exported file's slide XML to compare ways of writing the same slide, so one run judges them all:
 *   as-exported   the file as Calco writes it
 *   ungrouped     every icon shape (a custom-geometry outline) moved out of its group to the slide's top level
 *   own-group     every grouped icon wrapped in a group of its own, inside its card's group
 * All three draw the same pixels in LibreOffice; only an importer that reads groups differently tells them apart.
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
const decks = process.argv.slice(2).length ? process.argv.slice(2) : ['examples/inline-icons.md'];
const onMac = process.platform === 'darwin';
const report = { platform: process.platform, rendered: [], failed: [], skipped: onMac ? null : 'not macOS: qlmanage is not here' };

const SLIDE = /^ppt\/slides\/slide(\d+)\.xml$/;

/** Every icon shape that sits inside a group, moved after the outermost group that holds it (coordinates are the slide's:
 * Calco writes groups whose child space equals their own, so a child keeps its place outside). */
function ungroup(xml) {
	const tree = xml.indexOf('<p:spTree>');
	if (tree < 0) return xml;
	let out = '';
	let i = 0;
	let depth = 0;
	let lifted = [];
	const re = /<p:grpSp>|<\/p:grpSp>|<p:sp>(?:(?!<\/p:sp>)[\s\S])*?<\/p:sp>/g;
	for (let m = re.exec(xml); m; m = re.exec(xml)) {
		const tok = m[0];
		if (tok === '<p:grpSp>') {
			out += xml.slice(i, m.index + tok.length);
			depth++;
		} else if (tok === '</p:grpSp>') {
			out += xml.slice(i, m.index + tok.length);
			depth--;
			if (depth === 0 && lifted.length) {
				out += lifted.join('');
				lifted = [];
			}
		} else if (depth > 0 && tok.includes('<a:custGeom>')) {
			out += xml.slice(i, m.index);
			lifted.push(tok);
		} else {
			out += xml.slice(i, m.index + tok.length);
		}
		i = m.index + tok.length;
	}
	return out + xml.slice(i);
}

/** Every grouped icon in a group of its own (its child space equal to its frame). */
function ownGroup(xml) {
	let depth = 0;
	return xml.replace(/<p:grpSp>|<\/p:grpSp>|<p:sp>(?:(?!<\/p:sp>)[\s\S])*?<\/p:sp>/g, (tok) => {
		if (tok === '<p:grpSp>') depth++;
		else if (tok === '</p:grpSp>') depth--;
		else if (depth > 0 && tok.includes('<a:custGeom>')) {
			const off = tok.match(/<a:off x="(-?\d+)" y="(-?\d+)"\s*\/>/);
			const ext = tok.match(/<a:ext cx="(\d+)" cy="(\d+)"\s*\/>/);
			if (!off || !ext) return tok;
			const xf = `<a:xfrm><a:off x="${off[1]}" y="${off[2]}"/><a:ext cx="${ext[1]}" cy="${ext[2]}"/><a:chOff x="${off[1]}" y="${off[2]}"/><a:chExt cx="${ext[1]}" cy="${ext[2]}"/></a:xfrm>`;
			return `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="0" name="Icon group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr>${xf}</p:grpSpPr>${tok}</p:grpSp>`;
		}
		return tok;
	});
}

const VARIANTS = { 'as-exported': (x) => x, ungrouped: ungroup, 'own-group': ownGroup };

/** Unique shape ids again after `own-group` adds groups with id 0. */
function renumber(xml) {
	let n = 1000;
	return xml.replace(/<p:cNvPr id="0" /g, () => `<p:cNvPr id="${n++}" `);
}

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
		for (const f of Object.keys(zip.files).filter((f) => SLIDE.test(f))) zip.file(f, renumber(rewrite(await zip.file(f).async('string'))));
		const dir = path.join(OUT, name, variant);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, `${name}.pptx`), await zip.generateAsync({ type: 'nodebuffer' }));
		for (const n of slides) {
			const file = path.join(dir, `slide-${String(n).padStart(2, '0')}.pptx`);
			const buf = await oneSlide(zip, n);
			if (!buf) {
				report.failed.push({ deck: name, variant, slide: n, why: 'slide not in the slide list' });
				continue;
			}
			fs.writeFileSync(file, buf);
			if (!onMac) continue;
			const r = spawnSync('qlmanage', ['-t', '-s', '1920', '-o', dir, file], { encoding: 'utf8', timeout: 120000 });
			const png = `${file}.png`;
			if (r.status === 0 && fs.existsSync(png)) {
				fs.renameSync(png, file.replace(/\.pptx$/, '.png'));
				fs.rmSync(file);
				report.rendered.push({ deck: name, variant, slide: n });
			} else report.failed.push({ deck: name, variant, slide: n, why: (r.stderr || r.stdout || `exit ${r.status}`).trim().slice(0, 400) });
		}
	}
}
fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`office-quicklook: ${report.rendered.length} slides rendered, ${report.failed.length} failed${report.skipped ? ` (${report.skipped})` : ''} → ${path.relative(ROOT, OUT)}`);
if (onMac && (report.failed.length || !report.rendered.length)) process.exit(1);
