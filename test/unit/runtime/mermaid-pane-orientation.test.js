/**
 * Unit: a Mermaid fence in a PANE lays out for the pane's box, not the host slide's.
 *
 * A 35% side pane on a 16:9 slide is a tall box. A left-to-right flowchart kept wide there
 * shrank to 11.5px labels (34.8px on a full slide); reoriented top-to-bottom it draws them at
 * 19.5px. Two paths decide the direction and both must read the pane:
 *   - the CLI bakes each fence before the engine renders, so it asks the engine
 *     (`paneOrientations`) — pinned here against the orientation `render` stamps;
 *   - the browser runtime reads the stamp off the fence's own `<lat-pane>` (`fenceJob`), lifted
 *     out of the shipped runtime rather than re-implemented.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const engine = require('../../../lib/engine');
const { reorientMermaidForPortrait } = require('../../../lib/integrations/mermaid/reorient');

const REPO = path.join(__dirname, '..', '..', '..');
const FLOW = '```mermaid\nflowchart LR\n  A[Intake] --> B[Triage] --> C[Build]\n```';
const DECK = [
  '---', 'theme: indaco', '---', '',
  '## A tall pane.', '', '<!-- panes: 35/65 -->', '<!-- pane: diagram -->', '', FLOW, '',
  '<!-- pane: list -->', '', '- One', '- Two', '',
  '---', '', '## A wide pane.', '', '<!-- panes: 65/35 -->', '<!-- pane: diagram -->', '', FLOW, '',
  '<!-- pane: list -->', '', '- One', '',
].join('\n');

/** The orientation `render` stamps on each `<lat-pane>`, in document order (absent = landscape). */
function stamped(src) {
  return [...engine.render(src, '').html.matchAll(/<lat-pane\b[^>]*>/g)]
    .map((m) => (m[0].match(/data-orientation="([^"]+)"/) || [null, 'landscape'])[1]);
}

/** The orientation the CLI gives the fence opening on the line holding `probe`. */
function fenceOrientation(src, probe) {
  const line = src.split('\n').findIndex((l) => l.includes(probe));
  const pane = engine.paneOrientations(src).find((p) => p.lines.some(([a, b]) => line >= a && line < b));
  return pane ? pane.orientation : 'deck';
}

describe('engine.paneOrientations — the CLI\'s answer before it bakes a fence', () => {
  test('matches the orientation render() stamps, on the demo deck and a tall/wide pair', () => {
    for (const src of [DECK, fs.readFileSync(path.join(REPO, 'examples/panes.md'), 'utf8'), fs.readFileSync(path.join(REPO, 'examples/panes-mermaid.md'), 'utf8')]) {
      assert.deepEqual(engine.paneOrientations(src).map((p) => p.orientation), stamped(src));
    }
    assert.equal(fenceOrientation(DECK, '## A tall pane.') , 'deck', 'a masthead line is in no pane');
    const fences = DECK.split('\n').flatMap((l, i) => (l.startsWith('```mermaid') ? [i] : []));
    const at = (line) => engine.paneOrientations(DECK).find((p) => p.lines.some(([a, b]) => line >= a && line < b)).orientation;
    assert.deepEqual(fences.map(at), ['portrait', 'landscape']);
  });

  test('keyed on source lines, so slides the engine adds or text that looks like a marker cannot shift it', () => {
    // The checker's cases. A `_focusSteps` slide renders three sections from one, and a join on
    // slide index gave the wide pane below it the tall pane's orientation; a `<!-- pane: -->`
    // quoted in a code sample or a list item is no marker to the carve, and a marker count read it.
    const focus = ['---', 'theme: indaco', '---', '', '<!-- _focusSteps: a | b | c -->', '', '## Steps', '', '- a', '- b', '- c', '',
      '---', '', '## Tall.', '', '<!-- panes: 35/65 -->', '<!-- pane: list -->', '', '- x', '', '<!-- pane: list -->', '', '- y', '',
      '---', '', '## Wide.', '', '<!-- panes: 65/35 -->', '<!-- pane: diagram -->', '', '```mermaid', 'flowchart LR', '  WIDE --> B', '```', '',
      '<!-- pane: list -->', '', '- z', ''].join('\n');
    assert.equal(fenceOrientation(focus, 'WIDE'), 'landscape');
    const quoted = ['---', 'theme: indaco', '---', '', '## Wide.', '', '<!-- panes: 65/35 -->', '<!-- pane: diagram -->', '',
      '```md', '<!-- pane: list -->', '```', '', '- <!-- pane: list -->', '', '```mermaid', 'flowchart LR', '  QUOTED --> B', '```', '',
      '<!-- pane: list -->', '', '- z', ''].join('\n');
    assert.equal(fenceOrientation(quoted, 'QUOTED'), stamped(quoted)[0]);
  });

  test('a deck with no panes, or one that splits them into slides, answers nothing', () => {
    assert.deepEqual(engine.paneOrientations('# Just a slide\n'), []);
    assert.deepEqual(engine.paneOrientations(DECK.replace('theme: indaco', 'theme: indaco\nsize: 9:16')), []);
  });
});

describe('runtime fenceJob — the browser reads the pane', () => {
  const RUNTIME_SRC = fs.readFileSync(path.join(REPO, 'lib', 'runtime', 'index.js'), 'utf8');
  const start = RUNTIME_SRC.indexOf('  function fenceJob(preEl) {');
  const end = RUNTIME_SRC.indexOf('\n  }\n', start) + 4;
  const fenceJob = new Function('reorientMermaidForPortrait', `${RUNTIME_SRC.slice(start, end)}\nreturn fenceJob;`)(reorientMermaidForPortrait);

  const job = (html) => {
    const doc = new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
    return fenceJob(doc.querySelector('pre')).source.split('\n')[0];
  };
  const fence = '<pre><code>flowchart LR\n  A --> B</code></pre><div class="mermaid"></div>';

  test('a portrait pane on a landscape slide flows down', () => {
    assert.equal(start > 0 && end > start, true, 'fenceJob must still be in lib/runtime/index.js');
    assert.equal(job(`<section><lat-pane data-orientation="portrait">${fence}</lat-pane></section>`), 'flowchart TB');
  });
  test('a landscape pane keeps the author\'s direction, and a bare slide reads its section', () => {
    assert.equal(job(`<section><lat-pane>${fence}</lat-pane></section>`), 'flowchart LR');
    assert.equal(job(`<section data-orientation="portrait">${fence}</section>`), 'flowchart TB');
    assert.equal(job(`<section>${fence}</section>`), 'flowchart LR');
  });
});
