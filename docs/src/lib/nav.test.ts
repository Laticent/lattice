// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { appsNav, catalogNav, contentNav, findableNav, isCurrent, librariesNav, pluginsNav, primaryNav, specsNav } from './nav.mjs';

// The site's primary navigation is ONE source of truth (nav.mjs) that every
// surface renders from: the desktop bar + mobile Sheet (SiteHeader/NavActions),
// the ⌘K palette (CommandMenu), and the Starlight mobile sidebar (Sidebar).
// These tests pin the parts of that model that are a PRODUCT decision rather
// than an implementation detail, so a future edit can't quietly undo them:
//
//   • the Studio leads — it is the front door (2026-07-03-studio-succession.md
//     §6 P4, "nav demotion"), and "first link" must mean the same thing in the
//     flat list every non-desktop surface renders;
//   • the Studio keeps its honest "Preview" badge while it is still a preview;
//   • the frozen Drawing Board and Workbench appear in NO nav surface;
//   • the menus carry two catalog links (Libraries, Plugins), never the individual
//     entries, and each entry matches its catalog file (src/content/catalog/).

const url = (p: string) => `/lattice/${p}`;
const labels = (items: { label: string }[]) => items.map((l) => l.label);

describe('nav model', () => {
	it('leads with the Studio, then the Playground', () => {
		expect(labels(appsNav(url))).toEqual(['Studio', 'Playground']);
	});

	it('puts the apps first in the flat list every surface renders', () => {
		expect(labels(primaryNav(url)).slice(0, 2)).toEqual(['Studio', 'Playground']);
	});

	it('keeps the Studio honest with a Preview badge', () => {
		const studio = appsNav(url).find((l) => l.label === 'Studio');
		expect(studio?.badge).toBe('Preview');
	});

	it('lists no frozen surface anywhere in the nav', () => {
		// primaryNav is the union of every family, so this covers the desktop bar,
		// the Sheet, the palette, and the Starlight sidebar in one assertion.
		const all = JSON.stringify(primaryNav(url));
		expect(all).not.toMatch(/drawing-board|Drawing Board/i);
		expect(all).not.toMatch(/workbench/i);
	});

	it('covers every family in the flat list, with no duplicates', () => {
		const flat = labels(primaryNav(url));
		const families = [...labels(appsNav(url)), ...labels(contentNav(url)), ...labels(catalogNav(url))];
		expect(flat).toEqual(families);
		expect(new Set(flat).size).toBe(flat.length);
	});

	it('marks a section current from any page inside it', () => {
		const docs = contentNav(url).find((l) => l.label === 'Docs');
		if (!docs) throw new Error('the Docs entry vanished from contentNav');
		expect(isCurrent(docs, '/lattice/guides/authoring/')).toBe(true);
		expect(isCurrent(docs, '/lattice/studio/')).toBe(false);
	});

	it('lists every workspace library, Trama, Segno, Calco, Tavola, Fuoco, Mosaico and Veduta included, and LTT under Specs', () => {
		expect(labels(librariesNav(url))).toEqual(['Suono', 'Cadenza', 'Vetrina', 'Lente', 'Trama', 'Segno', 'Calco', 'Tavola', 'Fuoco', 'Mosaico', 'Veduta']);
		expect(labels(specsNav(url))).toEqual(['LFM 1.0', 'Diagnostic Protocol', 'LTT 1.0']);
		for (const s of specsNav(url)) expect(s.href).toMatch(/\/spec\/[a-z]+\/$/);
	});

	it('keeps the menus to two catalog links, and the individual entries to search', () => {
		expect(labels(catalogNav(url))).toEqual(['Libraries', 'Plugins']);
		// No menu lists a library or a plugin by name — the hubs introduce them.
		for (const l of primaryNav(url)) expect(l).not.toHaveProperty('searchOnly');
		// …but the ⌘K palette finds every one of them once the visitor types.
		const findable = findableNav(url);
		for (const l of [...librariesNav(url), ...pluginsNav(url)]) {
			expect(findable).toContainEqual(l);
			expect(l.searchOnly).toBe(true);
		}
	});

	it('lights Libraries or Plugins from any page inside its hub', () => {
		const [libs, plugins] = catalogNav(url);
		expect(isCurrent(libs, '/lattice/libraries/')).toBe(true);
		expect(isCurrent(libs, '/lattice/libraries/trama/learn/')).toBe(true);
		expect(isCurrent(plugins, '/lattice/plugins/math/')).toBe(true);
		expect(isCurrent(libs, '/lattice/studio/')).toBe(false);
	});

	it('matches every library and plugin to its catalog file, in the hub order', () => {
		// The hubs and the Learn pages are built from src/content/catalog/<kind>/<slug>.md. A nav
		// entry with no file would link to a 404; a file with no nav entry would be unfindable.
		const catalog = resolve(dirname(fileURLToPath(import.meta.url)), '../content/catalog');
		const ordered = (kind: string) =>
			readdirSync(join(catalog, kind))
				.filter((f) => f.endsWith('.md'))
				.map((f) => ({ slug: f.slice(0, -3), order: Number(/^order:\s*(\d+)/m.exec(readFileSync(join(catalog, kind, f), 'utf8'))?.[1]) }))
				.sort((a, b) => a.order - b.order)
				.map((e) => e.slug);
		const slugOf = (href: string) => href.split('/').filter(Boolean).pop();
		expect(librariesNav(url).map((l) => slugOf(l.href))).toEqual(ordered('libraries'));
		expect(pluginsNav(url).map((l) => slugOf(l.href))).toEqual(ordered('plugins'));
	});

	it('lists exactly the workspace libraries in the root package.json, by package name', () => {
		// The drift that left LTT and Tavola off the site for weeks: a library joined `workspaces`
		// and nothing asked the nav to list it. Each workspace's own package.json names the package.
		const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
		const workspaces: string[] = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).workspaces;
		const published = workspaces.map((dir) => JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8')).name);
		// A spec's reference implementation counts: @laticent/ltt is listed under Specs (spec audit §8.5).
		const listed = new Set([...librariesNav(url), ...specsNav(url)].map((l) => l.pkg).filter((p) => p !== '@laticent/lattice'));
		expect([...listed].sort()).toEqual(published.sort());
	});

	it('points every library at its own demo page, which marks it current', () => {
		for (const l of librariesNav(url)) {
			const slug = l.label.toLowerCase();
			expect(l.href).toBe(url(`libraries/${slug}/`));
			expect(isCurrent(l, `/lattice/libraries/${slug}/`)).toBe(true);
			expect(isCurrent(l, `/lattice/libraries/${slug}/learn/`)).toBe(true);
		}
	});
});
