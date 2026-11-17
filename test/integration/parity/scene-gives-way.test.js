/**
 * Integration: a stacked `scene` (square and portrait) lets its picture give way to its text, down to 28% of the slide,
 * as the stacked `image` does (lib/components/imagery/scene/scene.styles.css; owner, 2026-11-16, "fix all";
 * fit-everywhere-model.md §25). The `split` band held 46% of the slide and the `clean` card its own full height, so at a
 * phone's x1.4 the paragraph under them ran past the slide (scene.md 4, anima-scene.md 5). Cases, on the real CLI
 * export at square:
 *   SPLIT  a tall poster's band over a long paragraph: nothing clips
 *   CLEAN  a wide poster's card over a long paragraph: nothing clips
 * A scene whose text fits is pixel-identical before and after (measured on the eight decks with a scene slide, square
 * and portrait; the PR's evidence).
 *
 * FALSIFIABLE: with the band at a fixed 46% SPLIT prints OVERFLOW; with the card's row at the card's own height CLEAN
 * does. Needs Chromium (CHROME_PATH).
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const DECK = `---
marp: true
theme: indaco
size: square
---

<!-- _class: scene -->

## The pipeline assembles, stage by stage.

An extreme aspect would waste a card, so the resolver upgrades to **split** — a full-height column that shows the whole tall scene, the argument leading beside it.

<svg viewBox="0 0 150 230" xmlns="http://www.w3.org/2000/svg"><rect x="46" y="18" width="58" height="52" rx="9" fill="none" stroke="var(--cat-2-mark)" stroke-width="7"/><rect x="46" y="98" width="58" height="52" rx="9" fill="none" stroke="var(--cat-4-mark)" stroke-width="7"/><rect x="46" y="178" width="58" height="52" rx="9" fill="var(--accent)"/></svg>

---

<!-- _class: scene mirror -->

## Every scene reduces to its still.

Under \`prefers-reduced-motion\`, the vestibular spin doesn't autoplay — a scene whose whole point is the sweep falls back to this poster, now with a **Play the motion** control so a reader who wants it can still opt in. The default respects the reader; the choice stays theirs.

<svg viewBox="0 0 240 180" xmlns="http://www.w3.org/2000/svg"><ellipse cx="120" cy="92" rx="86" ry="30" fill="none" stroke="var(--cat-2-mark)" stroke-width="9"/><polygon points="120,50 156,112 84,112" fill="var(--accent)"/><circle cx="206" cy="92" r="11" fill="var(--cat-4-mark)"/></svg>
`;

let dir;
let log;
let html;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scene-gives-way-'));
  const md = path.join(dir, 'deck.md');
  fs.writeFileSync(md, DECK);
  const pdf = path.join(dir, 'deck.pdf');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, pdf, '--keep-html'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  if (r.status !== 0) throw new Error(`export failed: ${r.stderr}`);
  log = `${r.stdout}${r.stderr}`;
  html = fs.readFileSync(pdf.replace(/\.pdf$/, '.html'), 'utf8');
});
after(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

test('SPLIT and CLEAN: both compositions render, and nothing clips', () => {
  assert.match(html, /data-img-composition="split"/, 'the tall poster takes split, or this proves nothing');
  assert.match(html, /data-img-composition="clean"/, 'the wide poster takes clean, or this proves nothing');
  assert.doesNotMatch(log, /OVERFLOW/, log);
});
