import { describe, expect, it } from 'vitest';
import { appsNav, contentNav, isCurrent, librariesActive, librariesNav, primaryNav } from './nav.mjs';

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
//   • the frozen Drawing Board and Workbench appear in NO nav surface.

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
		const families = [...labels(appsNav(url)), ...labels(contentNav(url)), ...labels(librariesNav(url))];
		expect(flat).toEqual(families);
		expect(new Set(flat).size).toBe(flat.length);
	});

	it('marks a section current from any page inside it', () => {
		const docs = contentNav(url).find((l) => l.label === 'Docs');
		if (!docs) throw new Error('the Docs entry vanished from contentNav');
		expect(isCurrent(docs, '/lattice/guides/authoring/')).toBe(true);
		expect(isCurrent(docs, '/lattice/studio/')).toBe(false);
	});

	it('lights the Libraries disclosure only from a library route', () => {
		expect(librariesActive('/lattice/suono/', url)).toBe(true);
		expect(librariesActive('/lattice/studio/', url)).toBe(false);
	});
});
