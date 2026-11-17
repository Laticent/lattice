// The sitemap's `lastmod` for each page: the date of the last commit that touched the page's
// MAIN CONTENT source (#3207).
//
// "Main content" is deliberate. Google uses lastmod only when it is consistently accurate,
// and asks that it track changes to the page's content, not to shared chrome (the header,
// a layout, a stylesheet). So a docs page's date is its own .md/.mdx file, a component page's
// is its component folder, and a shared layout edit moves no date.
//
// A SHALLOW CHECKOUT GETS NO DATES. With one commit of history, every file's last commit is
// that one commit, so every page would claim to have changed today. `lastmodFor` returns
// undefined for every page then, and the sitemap simply omits the field. The production and
// preview builds (docs.yml, docs-preview.yml) fetch history without file contents
// (`filter: blob:none`, `fetch-depth: 0`) so they get real dates; the other CI builds and a
// local shallow clone get none. scripts/check-discovery.mjs holds this all-or-nothing: with
// history, every sitemap URL must carry a date, and without it none may.
//
// Node-only (git, fs). Read by astro.config.mjs and scripts/check-discovery.mjs.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** True when the checkout holds the full history. */
export function hasHistory(repoRoot) {
	try {
		return execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: repoRoot, encoding: 'utf8' }).trim() === 'false';
	} catch {
		return false;
	}
}

/**
 * Every tracked path → the UTC ISO date of the last commit that touched it, from ONE `git log`
 * pass (newest first, so the first date seen for a path is its last change). About a second
 * over the whole history; one `git log -1` per page would be ~200 processes.
 */
export function lastCommitDates(repoRoot) {
	// `%ct` (Unix seconds), not `%cI`: the ISO form keeps each committer's own UTC offset, and
	// two dates in different offsets do not compare correctly as strings.
	const out = execFileSync('git', ['log', '--format=@%ct', '--name-only', '--no-renames', '--', 'docs/src', 'lib'], {
		cwd: repoRoot,
		encoding: 'utf8',
		maxBuffer: 256 * 1024 * 1024,
	});
	const dates = new Map();
	let current = '';
	for (const line of out.split('\n')) {
		if (line.startsWith('@')) current = new Date(Number(line.slice(1)) * 1000).toISOString();
		else if (line && !dates.has(line)) dates.set(line, current);
	}
	return dates;
}

/**
 * The repo paths (files or folders) holding a page's main content, or null when the route
 * is not one this map knows — check-discovery fails on that, so a new kind of page gets a
 * deliberate answer instead of a silent missing date.
 */
export function contentSources(pathname, repoRoot) {
	const exists = (p) => fs.existsSync(path.join(repoRoot, p));
	const first = (...ps) => ps.find(exists) ?? null;
	const parts = pathname.split('/').filter(Boolean);

	if (parts[0] === 'components' && parts.length === 3) {
		const [, bucket, name] = parts;
		return [first(`lib/components/${bucket}/${name}`, `lib/plugins/chart-family/kinds/${name}`)].filter(Boolean);
	}
	if ((parts[0] === 'plugins' || parts[0] === 'libraries') && parts.length >= 2) {
		const src = first(`docs/src/content/catalog/${parts[0]}/${parts[1]}.md`);
		return src ? [src] : null;
	}
	// A standalone route: its own page file.
	const page = parts.length === 0 ? 'index' : parts.join('/');
	const standalone = first(`docs/src/pages/${page}.astro`, `docs/src/pages/${page}/index.astro`);
	if (standalone) return [standalone];
	// A Starlight docs page: its content file.
	const doc = first(
		...['md', 'mdx'].flatMap((ext) => [`docs/src/content/docs/${page}.${ext}`, `docs/src/content/docs/${page}/index.${ext}`]),
	);
	return doc ? [doc] : null;
}

/**
 * The newest last-commit date across a page's sources. A folder's date is its newest file's.
 * Returns undefined when the sources are unknown or have no recorded commit.
 */
export function makeLastmod(repoRoot) {
	if (!hasHistory(repoRoot)) return () => undefined;
	const dates = lastCommitDates(repoRoot);
	const newestUnder = (src) => {
		let best;
		for (const [file, date] of dates) {
			if ((file === src || file.startsWith(`${src}/`)) && (!best || date > best)) best = date;
		}
		return best;
	};
	return (pathname) => {
		const sources = contentSources(pathname, repoRoot);
		if (!sources?.length) return undefined;
		const found = sources.map(newestUnder).filter(Boolean).sort();
		return found.at(-1);
	};
}
