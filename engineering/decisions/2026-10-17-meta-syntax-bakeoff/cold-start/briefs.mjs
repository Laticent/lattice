/**
 * The cold-start writer test, part 1: the prompt. Three models are asked to "make a Lattice deck"
 * with NO rule sheet, so what they write shows which carrier they reach for on their own.
 *
 * What the writer gets: twelve slides (the bake-off's own twelve, `chooseTwelve()`), each as the
 * slide BODY (its Markdown with every comment removed) and a plain-English list of the settings
 * that slide needs. It is told nothing about how a setting is written. The settings list is
 * derived from the same canonical records the earlier writer test graded against, in the words the
 * records use (layout, footer, paginate, note), because the point is the carrier, not whether the
 * writer can guess a component name.
 *
 * Why the settings are named in record words and not Marp words: a model that has seen Marp will
 * write `<!-- _footer: … -->` whatever we call the field, and one that has not will write what the
 * words suggest. Either way the carrier is the writer's choice, which is the quantity measured.
 */
import { chooseTwelve } from '../slides.mjs';

/** A field of a canonical record as one plain-English line. */
function phrase(key, value) {
  if (key === 'note') {
    const paras = Array.isArray(value) ? value : [String(value)];
    return paras.length > 1
      ? `Speaker notes (${paras.length} paragraphs): ${paras.map((p) => `"${p}"`).join(' / ')}`
      : `Speaker note: "${paras[0]}"`;
  }
  if (key === 'stress-slide') return 'Marked as a stress slide (a deliberately over-full specimen)';
  if (key === 'paginate') return `Page numbers: ${value}`;
  // Prose, not syntax: "Footer: Q3 review", not `footer: "Q3 review"`, which would look like a carrier.
  const label = key.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
  return `${label}: ${value}`;
}

/** The twelve briefs: `{ n, category, body, settings: string[] }`. */
export function briefs() {
  return chooseTwelve().map((s, i) => {
    const settings = [];
    s.records.forEach((rec, r) => {
      if (rec.pane !== undefined) {
        settings.push(`Pane ${r}: component ${rec.pane}`);
        return;
      }
      for (const [k, v] of Object.entries(rec)) settings.push(phrase(k, v));
    });
    return { n: i + 1, category: s.category, body: s.body, settings, source: s.source, canonical: s.records };
  });
}

/** The whole prompt, exactly as every writer sees it. */
export function prompt(list = briefs()) {
  const slides = list.map((b) => [
    `### Slide ${b.n}`,
    '',
    'Body:',
    '```markdown',
    b.body,
    '```',
    '',
    'Settings for this slide:',
    ...(b.settings.length ? b.settings.map((s) => `- ${s}`) : ['- (none)']),
  ].join('\n')).join('\n\n');
  return [
    'Make a Lattice deck.',
    '',
    'Lattice is a Markdown slide-deck engine. Below are twelve slides. Each has a body in Markdown and a',
    'list of settings that slide needs. Write the twelve slides as one Lattice deck, in Markdown, with each',
    "slide's settings applied the way Lattice expects them. Keep every body exactly as given. Separate slides",
    'with a line that holds only `---`. Do not number the slides in the output.',
    '',
    'Output only the deck: no explanation, no code fence around it.',
    '',
    slides,
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const list = briefs();
  process.stdout.write(`${prompt(list)}\n`);
}
