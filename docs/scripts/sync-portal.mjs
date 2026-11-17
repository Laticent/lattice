// Copy the generated plain-Markdown component reference into the site's
// public/ dir so it ships as a static download at /lattice/components.md.
// (The browsable, themable edition is the Astro component pages under
// /lattice/components/ — built from the manifests at site-build time, not
// staged here.) The .md is generated from the manifests by
// tools/build-docs-portal.js and committed under dist/docs/; this just
// stages it for the Astro build.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rebaseLinks } from './md-twins.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoReference = join(here, '..', '..', 'dist', 'docs');
const publicDir = join(here, '..', 'public');

mkdirSync(publicDir, { recursive: true });

let copied = 0;
for (const name of ['components.md']) {
	const src = join(repoReference, name);
	if (!existsSync(src)) {
		console.error(`sync-portal: missing ${src} — run \`npm run docs:portal\` in the repo root.`);
		process.exit(1);
	}
	// The reference links design docs and gallery PDFs relative to where it is generated
	// (dist/docs/), which resolve in the repo and 404 on the site: about 160 dead links, served
	// for as long as the file has been, and found when #3207 began pointing agents at it. Resolve
	// them against that location, which turns each into the file on GitHub.
	writeFileSync(join(publicDir, name), rebaseLinks(readFileSync(src, 'utf8'), `dist/docs/${name}`));
	copied++;
}

// Stage the committed gallery PDF so the site serves it at /gallery.pdf —
// the landing hero's "skim a finished deck" link and the introduction's
// "See it first" link both point here. The PDF's source of truth stays the
// baseline-deck fixture (rebuilt with the galleries, HARD RULE #8); this is
// a staged copy, gitignored like components.md above.
const galleryPdf = join(here, '..', '..', 'test', 'integration', 'baseline-decks', 'gallery.pdf');
if (!existsSync(galleryPdf)) {
	console.error(`sync-portal: missing ${galleryPdf} — the committed gallery fixture is gone.`);
	process.exit(1);
}
copyFileSync(galleryPdf, join(publicDir, 'gallery.pdf'));
copied++;
console.log(`sync-portal: staged ${copied} file(s) into public/.`);
