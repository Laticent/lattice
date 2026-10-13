// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
import { slideCount } from './galleries.mjs';

// slideCount() labels the "Load a deck" drawer entries. The two gallery shapes
// in the repo differ at the top: showcase decks (jargon, design-system) open
// with YAML front matter; bucket + generated galleries (chart, data-viz,
// diagram) open with an HTML comment or `_class` directive and have no front
// matter. The count must be right for both — the old formula assumed front
// matter and undercounted every front-matter-less deck by two.

const slides = (n: number) => Array.from({ length: n }, (_, i) => `<!-- _class: x -->\n\n# Slide ${i + 1}`);

function frontMatterDeck(n: number) {
  const fm = ['---', 'marp: true', 'theme: indaco', '---'].join('\n');
  return `${fm}\n\n${slides(n).join('\n\n---\n\n')}`;
}

function bareDeck(n: number) {
  // No front matter: first line is a `_class` directive, slides joined by `---`.
  return slides(n).join('\n\n---\n\n');
}

describe('slideCount', () => {
  it('counts a front-matter deck by its slides, not its fences', () => {
    for (const n of [1, 2, 5, 22]) {
      expect(slideCount(frontMatterDeck(n))).toBe(n);
    }
  });

  it('counts a front-matter-less deck correctly (the old off-by-two bug)', () => {
    for (const n of [1, 2, 5, 22]) {
      expect(slideCount(bareDeck(n))).toBe(n);
    }
  });

  it('matches the real diagram bucket gallery shape (22 slides, no front matter)', () => {
    // The authored diagram tour opens with a galleryAuthored comment + title
    // `_class`, no front matter, and runs 22 slides.
    const title = '<!-- galleryAuthored: x -->\n<!-- _class: title silent -->\n\n# Diagrams';
    const deck = [title, ...slides(21)].join('\n\n---\n\n');
    expect(slideCount(deck)).toBe(22);
  });

  it('never returns less than 1', () => {
    expect(slideCount('# just one slide, no fences')).toBe(1);
  });
});

import { deckTitle } from './galleries.mjs';

describe('deckTitle', () => {
  it('prefers front-matter title, then the first heading, then the slug', () => {
    expect(deckTitle('---\nmarp: true\ntitle: "Avatars"\n---\n\n# Other', 'x')).toBe('Avatars');
    expect(deckTitle('---\nmarp: true\n---\n\n<!-- _class: title -->\n\n# Hijabs, **caps**', 'x')).toBe('Hijabs, caps');
    expect(deckTitle('no heading here', 'my-deck')).toBe('my-deck');
  });
});

import { createRequire } from 'node:module';
import { join } from 'node:path';
import { loadExampleDecks } from './galleries.mjs';

describe('deckTitle quoting', () => {
  it('unquotes a YAML value but keeps a quote mark that belongs to the heading', () => {
    expect(deckTitle('---\ntitle: "Quoted"\n---\n# x', 's')).toBe('Quoted');
    expect(deckTitle('# "Shipped" is a product word.', 's')).toBe('"Shipped" is a product word.');
    expect(deckTitle('# A pointer that says more than "over there."', 's')).toBe('A pointer that says more than "over there."');
  });
});

describe('loadExampleDecks (the real examples/ folder)', () => {
  const root = join(__dirname, '../../..');
  const require = createRequire(import.meta.url);
  const engine = require(join(root, 'lib', 'engine'));
  const decks = loadExampleDecks(root, (src: string) => (engine.render(src).html.match(/<section\b/g) || []).length);
  it('lists every deck but the README, A–Z, with unique slugs', () => {
    expect(decks.length).toBeGreaterThan(200);
    expect(decks.some((d) => d.slug.toLowerCase() === 'readme')).toBe(false);
    expect(new Set(decks.map((d) => d.slug)).size).toBe(decks.length);
    const titles = decks.map((d) => d.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
  });
  it('counts the slides the engine renders, including a heading-split deck', () => {
    expect(decks.find((d) => d.slug === 'split-headings')?.slides).toBeGreaterThan(1);
    expect(decks.find((d) => d.slug === 'avatars-dress')?.slides).toBe(7);
  });
});
