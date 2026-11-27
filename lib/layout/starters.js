/**
 * Layout Studio starters — a small library of CSS-only local components to
 * begin from (the deterministic floor + the "new layout" head start), the
 * Form-layer parallel of lib/theme/starters. Each is a complete, gate-clean
 * draft: palette-blind CSS scoped to `section.<name>`, a valid manifest, and a
 * skeleton that invokes the class. They arrange prose/structure only — the
 * no-transform substances a runtime component is allowed to be.
 *
 * Verified by test/unit/layout/layout-starters.test.js, which runs every
 * starter through gateComponent() so a malformed starter can't ship.
 */

const STARTERS = [
  {
    name: 'feature-band',
    label: 'Feature band',
    function: 'statement',
    bucket: 'statement',
    form: 'canvas',
    substance: 'prose',
    tags: ['statement', 'centered', 'headline'],
    description: 'A centered statement — a large headline over a supporting line, with an accent underline.',
    css: [
      'section.feature-band {',
      '  display: flex; flex-direction: column;',
      '  justify-content: center; align-items: center;',
      '  text-align: center; gap: var(--sp-md);',
      '}',
      'section.feature-band h2 {',
      '  display: flex; flex-direction: column; align-items: center;',
      '  gap: var(--sp-sm);',
      '  font-size: var(--fs-h1); color: var(--text-heading); max-width: 22ch;',
      '}',
      'section.feature-band h2::after {',
      '  content: ""; width: 3rem; height: 3px;',
      '  background: var(--accent);',
      '}',
      'section.feature-band p {',
      '  font-size: var(--fs-message); color: var(--text-body); max-width: 42ch;',
      '}',
    ].join('\n'),
    skeleton: [
      '<!-- @meta{layout=feature-band} -->',
      '',
      '## The one thing to remember',
      '',
      'A single supporting sentence that frames the headline.',
    ].join('\n'),
  },
  {
    name: 'two-col-list',
    label: 'Two-column list',
    function: 'inventory',
    bucket: 'inventory',
    form: 'grid',
    substance: 'structure',
    tags: ['inventory', 'list', 'two-column'],
    description: 'A flat list flowed into a two-column grid of bordered cards.',
    css: [
      'section.two-col-list ul {',
      '  display: grid; grid-template-columns: 1fr 1fr;',
      '  gap: var(--sp-sm) var(--sp-lg);',
      '  list-style: none; padding: 0; margin: 0;',
      '}',
      'section.two-col-list li {',
      '  background: var(--bg-alt); border: 1px solid var(--border);',
      '  border-radius: var(--radius-md);',
      '  padding: var(--sp-sm) var(--sp-md);',
      '  color: var(--text-body); font-size: var(--fs-body);',
      '}',
    ].join('\n'),
    skeleton: [
      '<!-- @meta{layout=two-col-list} -->',
      '',
      '## Everything in one view',
      '',
      '- First item',
      '- Second item',
      '- Third item',
      '- Fourth item',
    ].join('\n'),
  },
  {
    name: 'rail-panel',
    label: 'Prose + rail',
    function: 'inventory',
    bucket: 'inventory',
    form: 'panel',
    substance: 'structure',
    tags: ['panel', 'rail', 'aside'],
    description: 'A two-thirds prose panel with a narrow accented rail on the right (a blockquote).',
    css: [
      'section.rail-panel {',
      '  display: grid; grid-template-columns: 2fr 1fr;',
      '  gap: var(--sp-lg); align-content: start;',
      '}',
      'section.rail-panel h2 { grid-column: 1 / -1; margin: 0; }',
      'section.rail-panel blockquote {',
      '  margin: 0; padding: var(--sp-md);',
      '  background: var(--accent-soft);',
      '  border-left: 3px solid var(--accent);',
      '  border-radius: var(--radius-md);',
      '  color: var(--text-heading); font-size: var(--fs-body);',
      '}',
    ].join('\n'),
    skeleton: [
      '<!-- @meta{layout=rail-panel} -->',
      '',
      '## The point, with a note alongside',
      '',
      'The main prose carries the argument across the wide left column.',
      '',
      '> The rail holds an aside — a caveat, a stat, a pull-quote.',
    ].join('\n'),
  },
];

/** Look up a starter by name (or undefined). */
function getStarter(name) {
  return STARTERS.find(s => s.name === name);
}

module.exports = { STARTERS, getStarter };
