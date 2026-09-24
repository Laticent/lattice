/**
 * The export's overflow warnings name pages by the deck's OWN slides.
 *
 * A deck that teaches the export shell by pasting `<main id="deck"><section
 * data-lattice-slide=…>` parses as a section nested inside the real slide. Before
 * `lib/core/deck-slides.js`, `measureOverflow` walked every `section[data-lattice-slide]`,
 * so the pasted one counted as a slide and every later page number shifted by one:
 * measured on this fixture, the OVERFLOW line said "pages 1, 3" for a two-slide deck.
 * The `--read` twin of this bug is pinned in `read-export.test.js`.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { ROOT } = require('../../helpers/render');

// Slide 2 overflows on purpose, so it is the page whose number the phantom would shift.
const DECK = '---\ntheme: indaco\n---\n\n# How the export scaffold looks\n\n' +
  '<main id="deck"><section data-lattice-slide="1"><p>SCAFFOLDPROBE.</p></section></main>\n\n---\n\n' +
  '## Far too much for one slide\n\n' +
  Array.from({ length: 40 }, (_, i) => `- Line ${i + 1} of a list that is much too long for one slide`).join('\n') + '\n';

test('a pasted export scaffold does not shift the overflow page numbers', { timeout: 900000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-overflow-scope-'));
  try {
    const src = path.join(dir, 'deck.md');
    fs.writeFileSync(src, DECK);
    const res = spawnSync('node', [path.join(ROOT, 'lattice-emulator.js'), src, path.join(dir, 'out.html'), 'indaco'], {
      cwd: ROOT, encoding: 'utf8', timeout: 900000,
    });
    assert.equal(res.status, 0, `render failed:\n${res.stderr}`);
    const line = `${res.stdout}\n${res.stderr}`.split('\n').find((l) => l.includes('OVERFLOW —'));
    assert.ok(line, 'the overflowing second slide must be reported');
    const pages = (line.match(/pages? ([\d, ]+)\./) || [])[1]?.split(',').map((n) => Number(n.trim())) || [];
    assert.ok(pages.includes(2), `the overflowing slide is page 2; the warning said: ${line.trim()}`);
    assert.ok(pages.every((n) => n <= 2), `a two-slide deck has no page ${Math.max(...pages)}; the warning said: ${line.trim()}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
