// Post-build step: give every `<astro-island>` a `uid` that does not depend on where the repo is
// checked out.
//
// WHY. Astro names each island `uid = shorthash(componentUrl + html + props)`
// (astro/dist/runtime/server/render/component.js), and at build time `componentUrl` is the
// component's ABSOLUTE source path. shorthash is base-62 and variable-length, so the same commit
// built in two folders writes uids of different LENGTHS, and every page's byte count moves by 1–3
// bytes. measure-route-base.sh builds `main` in a fresh temp folder, so the route budget's
// `htmlRaw` never measured the same twice (engineering/decisions/2026-09-29-route-budget-soft-hard.md
// §7). tools/build-playground.js fixed the same bug in the engine's chunk names.
//
// WHY A REWRITE AND NOT A PATCH TO ASTRO. A patch-package patch would have to be carried, and
// re-made, on every Astro upgrade. The uid is safe to rewrite after the build: Astro's island
// runtime never reads it (it is "for HMR", hydration.js), no `/_astro` chunk reads it, and the
// site uses neither view transitions nor server islands. React's ids come from the island's
// `prefix` attribute, which this leaves alone.
//
// THE NEW UID hashes what Astro hashed minus the path: the island's own opening tag without its
// uid (the hashed component URL, the export, the serialized props, the hydration directive), plus
// how many identical tags came before it on the page. Fixed length, so a page's size no longer
// moves with the folder. Idempotent: the uid is removed before hashing, so a re-run writes the
// same value.
//
// Usage: node scripts/stable-island-uids.mjs (run after `astro build`)

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(DOCS, 'dist');

const ISLAND_RE = /<astro-island\b[^>]*>/g;
const UID_RE = /\suid="[^"]*"/;

/** Rewrite every island uid in one HTML document. PURE. Returns `{ html, islands }`. */
export function stableIslandUids(html) {
	const seen = new Map();
	let islands = 0;
	const out = String(html ?? '').replace(ISLAND_RE, (tag) => {
		if (!UID_RE.test(tag)) return tag;
		const key = tag.replace(UID_RE, '');
		const nth = seen.get(key) ?? 0;
		seen.set(key, nth + 1);
		islands++;
		const uid = createHash('sha256').update(`${key}#${nth}`).digest('base64url').slice(0, 8);
		return tag.replace(UID_RE, ` uid="${uid}"`);
	});
	return { html: out, islands };
}

function listHtml(dir, out = []) {
	if (!fs.existsSync(dir)) return out;
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) listHtml(p, out);
		else if (e.name.endsWith('.html')) out.push(p);
	}
	return out;
}

function main() {
	const pages = listHtml(DIST);
	if (!pages.length) {
		process.stdout.write('stable-island-uids: no built pages found — did `astro build` run?\n');
		return 0;
	}
	let changed = 0;
	let islands = 0;
	for (const p of pages) {
		const html = fs.readFileSync(p, 'utf8');
		const r = stableIslandUids(html);
		islands += r.islands;
		if (r.html === html) continue;
		fs.writeFileSync(p, r.html);
		changed++;
	}
	process.stdout.write(`stable-island-uids: ${islands} island uid(s) across ${changed} of ${pages.length} page(s) no longer depend on the checkout folder.\n`);
	return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
