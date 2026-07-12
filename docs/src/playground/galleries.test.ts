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
