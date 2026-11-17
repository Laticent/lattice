// Discovery gate (#3207) — fails the build when what the site tells crawlers and agents about
// itself contradicts the pages it actually built.
//
// It reads the built dist/ and holds four things true:
//   1. A page says `noindex` exactly when src/lib/discovery.mjs's `isIndexable` says it is
//      not indexable. The sitemap filter reads that same function, so this is what stops a
//      new noindex page from shipping inside the sitemap (and an indexable page from being
//      dropped from it).
//   2. The sitemap lists every indexable page and nothing else: each URL resolves to a built
//      page, and no indexable page is missing. With git history, every URL carries the
//      lastmod src/lib/lastmod.mjs computes; on a shallow checkout, none carries one.
//   3. Every indexable page carries exactly one <title>, description, canonical link,
//      og:title, og:description, og:url, og:image and twitter:card, and the card is a PNG of
//      the size its tags declare.
//   4. robots.txt points at a sitemap that exists, and every link in llms.txt resolves to a
//      built file; llms.txt stays a router (under 4 KB), not an index.
//
// Not checked: redirect stubs (Astro writes them with their own noindex + canonical), the
// 404 page, and the baked playground frames under /playground/v/, which are not routes.
//
// Runs post-`astro build` in the docs `build` script, beside check-studio-shell. Standalone:
// `npm run check:discovery` (needs a built dist/).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIndexable, LLMS_LINKS, OG_IMAGE } from '../src/lib/discovery.mjs';
import { contentSources, hasHistory, makeLastmod } from '../src/lib/lastmod.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, '..', 'dist');
const LLMS_MAX_BYTES = 4096;
// Every entry in discovery.mjs's LLMS_LINKS, so a link the text builder silently drops fails.
const LLMS_MIN_LINKS = Object.values(LLMS_LINKS).flat().length;
const ONE_EACH = [
	['<title>', /<title>/g],
	['meta description', /<meta name="description"/g],
	['canonical link', /<link rel="canonical"/g],
	['og:title', /<meta property="og:title"/g],
	['og:description', /<meta property="og:description"/g],
	['og:url', /<meta property="og:url"/g],
	['og:image', /<meta property="og:image"(?!:)/g],
	['twitter:card', /<meta name="twitter:card"/g],
];

function walk(dir, out = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name !== '_astro') walk(p, out);
		} else if (entry.name.endsWith('.html')) out.push(p);
	}
	return out;
}

/** dist/a/b/index.html → /a/b/ ; dist/index.html → / */
function routeOf(file) {
	const rel = path.relative(DIST, file).split(path.sep).join('/');
	if (rel === 'index.html') return '/';
	return rel.endsWith('/index.html') ? `/${rel.slice(0, -'index.html'.length)}` : `/${rel}`;
}

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);

if (!fs.existsSync(DIST)) {
	console.error('check-discovery: no dist/ — run `astro build` first.');
	process.exit(1);
}

// ── 1 + 3: every route's own signals ─────────────────────────────────────────
const indexable = new Set();
let checked = 0;
for (const file of walk(DIST)) {
	const route = routeOf(file);
	if (route === '/404.html' || route.startsWith('/playground/v/')) continue;
	const html = fs.readFileSync(file, 'utf8');
	const head = html.split('</head>')[0];
	if (/<meta http-equiv="refresh"/i.test(head)) continue; // a redirect stub
	checked++;
	const noindex = /<meta name="robots" content="[^"]*noindex/i.test(head);
	const want = isIndexable(route);
	if (noindex && want) fail(`${route} says noindex, but discovery.mjs lists it as indexable — add it to NOINDEX_PREFIXES or drop the meta`);
	if (!noindex && !want) fail(`${route} is excluded by discovery.mjs but carries no <meta name="robots" content="noindex">`);
	if (!want) continue;
	indexable.add(route);
	// Exactly one of each: a missing tag is a gap, and a second one is two pages' worth of
	// metadata disagreeing about which is true (a crawler picks one, and not reliably ours).
	for (const [label, re] of ONE_EACH) {
		const n = (head.match(re) || []).length;
		if (n !== 1) fail(`${route} has ${n} ${label} (want exactly 1; use components/site/PageMeta.astro)`);
	}
}

// ── 2: the sitemap is exactly the indexable routes ───────────────────────────
const sitemapIndex = path.join(DIST, 'sitemap-index.xml');
const listed = new Set();
let siteOriginFromSitemap;
const REPO_ROOT = path.join(HERE, '..', '..');
const withHistory = hasHistory(REPO_ROOT);
const lastmodFor = makeLastmod(REPO_ROOT);
if (!fs.existsSync(sitemapIndex)) fail('dist/sitemap-index.xml is missing');
else {
	for (const [, loc] of fs.readFileSync(sitemapIndex, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) {
		siteOriginFromSitemap ??= new URL(loc).origin;
		const part = path.join(DIST, new URL(loc).pathname);
		if (!fs.existsSync(part)) {
			fail(`sitemap-index.xml names ${loc}, which was not built`);
			continue;
		}
		for (const [, entry] of fs.readFileSync(part, 'utf8').matchAll(/<url>(.*?)<\/url>/gs)) {
			const route = new URL(entry.match(/<loc>([^<]+)<\/loc>/)[1]).pathname;
			listed.add(route);
			const lastmod = entry.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
			if (withHistory) {
				const want = lastmodFor(route);
				if (!contentSources(route, REPO_ROOT)) fail(`${route} has no content source in src/lib/lastmod.mjs contentSources — map it`);
				else if (!want) {
					// Mapped, but not committed yet (a new page on a local build): no date is the honest
					// answer, and CI never sees this because it builds commits.
					if (lastmod) fail(`${route} carries lastmod ${lastmod} but its source has no commit`);
					else warnings.push(`${route}: its source has no commit yet, so the sitemap gives it no lastmod`);
				} else if (lastmod !== want) fail(`${route} lastmod is ${lastmod ?? 'missing'}, want ${want}`);
			} else if (lastmod) fail(`${route} carries lastmod ${lastmod} from a shallow checkout, where every date is the latest commit`);
		}
	}
	// Static files under public/ (the offline fallback) are not Astro routes, so the sitemap
	// integration never sees them; `isIndexable` already marks them noindex above.
	for (const route of listed) if (!indexable.has(route)) fail(`sitemap lists ${route}, which is not an indexable built page`);
	for (const route of indexable) if (!listed.has(route)) fail(`${route} is indexable but missing from the sitemap`);
}

// ── the social card: the file every og:image names, at the size the tags declare ────────────
const og = path.join(DIST, OG_IMAGE.path);
if (!fs.existsSync(og)) fail(`${OG_IMAGE.path} is missing (node tools/make-og-card.js)`);
else {
	const png = fs.readFileSync(og);
	const isPng = png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
	const [w, h] = isPng ? [png.readUInt32BE(16), png.readUInt32BE(20)] : [0, 0];
	if (!isPng || w !== OG_IMAGE.width || h !== OG_IMAGE.height)
		fail(`${OG_IMAGE.path} is ${isPng ? `${w}x${h}` : 'not a PNG'}; the tags say ${OG_IMAGE.width}x${OG_IMAGE.height} PNG`);
	if (png.length > 1024 * 1024) fail(`${OG_IMAGE.path} is ${(png.length / 1024).toFixed(0)} KB; keep a link-preview card under 1 MB`);
}

// ── 4: robots.txt and llms.txt ───────────────────────────────────────────────
const robots = path.join(DIST, 'robots.txt');
if (!fs.existsSync(robots)) fail('dist/robots.txt is missing');
else {
	const m = fs.readFileSync(robots, 'utf8').match(/^Sitemap:\s*(\S+)/m);
	// A preview build disallows everything and names no sitemap; that is allowed.
	if (m && !fs.existsSync(path.join(DIST, new URL(m[1]).pathname))) fail(`robots.txt names ${m[1]}, which was not built`);
}

const llms = path.join(DIST, 'llms.txt');
if (!fs.existsSync(llms)) fail('dist/llms.txt is missing');
else {
	const size = fs.statSync(llms).size;
	if (size > LLMS_MAX_BYTES) fail(`llms.txt is ${size} bytes; keep it a router under ${LLMS_MAX_BYTES} (engineering/decisions/2026-09-05-agent-kit-by-destination.md §4)`);
	// Every link as the built file actually writes it: a page twin (`.md`) or a page. A twin's
	// page must be indexable; a dead link fails.
	const text = fs.readFileSync(llms, 'utf8');
	// The site's own origin is whatever the build's sitemap says it is (lattice.style, or a
	// preview host when SITE_URL points elsewhere), not a hard-coded name.
	const siteOrigin = siteOriginFromSitemap ?? 'https://lattice.style';
	const links = [...text.matchAll(/\]\(([^)]+)\)/g)].map(([, href]) => href).filter((href) => !/^https?:/.test(href) || new URL(href).origin === siteOrigin);
	if (links.length < LLMS_MIN_LINKS) fail(`llms.txt has ${links.length} site links; expected at least ${LLMS_MIN_LINKS}`);
	for (const href of links) {
		const p = new URL(href, siteOrigin).pathname;
		const target = p.endsWith('/') ? path.join(DIST, p, 'index.html') : path.join(DIST, p);
		if (!fs.existsSync(target)) fail(`llms.txt links ${p}, which was not built`);
		const page = p.endsWith('.md') ? (p === '/components.md' ? '/components/' : `${p.slice(0, -3)}/`) : p;
		if (page.endsWith('/') && !indexable.has(page)) fail(`llms.txt links ${p}, whose page ${page} is not indexable`);
	}
}

for (const w of warnings) console.warn(`check-discovery: warning: ${w}`);
if (errors.length) {
	console.error(`check-discovery: ${errors.length} problem(s)\n  ${errors.join('\n  ')}`);
	process.exit(1);
}
console.log(`check-discovery: ${checked} pages, ${indexable.size} indexable, sitemap and llms.txt agree; lastmod ${withHistory ? 'on every URL' : 'omitted (shallow checkout)'}.`);
