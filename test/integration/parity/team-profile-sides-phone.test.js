/**
 * Integration: `team-profile sides` on a square slide read in a hand takes a smaller portrait, two equal halves and
 * narrower gutters, so each person's name and role fit their roster (team-profile.styles.css; fit-everywhere-model.md §25).
 *
 * At the x1.4 phone step a 14cqi portrait left the text about 220px, "ARCHITECT" could not break, and the second
 * roster's `1fr` column grew to its longest word and ran past the stage, which clipped the role mid-word
 * (examples/team-profile.md). Cases, on the real CLI export:
 *   PHONE   at the phone default, every person's name and role, and both rosters, end inside the stage, which clips
 *   LAPTOP  at `venue: laptop` the portrait is 14cqi of the stage, as before
 *
 * FALSIFIABLE: without the handheld rule PHONE's "Solution Architect" runs past the stage; with the portrait alone
 * the second roster runs past the stage; with the halves alone, or without the narrower gutter, a role runs past its
 * own roster; with the rule applied
 * at every venue, LAPTOP's portrait is 10cqi. Needs Chromium (CHROME_PATH).
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const puppeteer = require('puppeteer');
const { resolveChrome } = require('../../../tools/lib/resolve-chrome');

const ROOT = path.join(__dirname, '..', '..', '..');
const deck = (venue) => `---
marp: true
theme: indaco
size: square
${venue ? `venue: ${venue}\n` : ''}---

<!-- _class: team-profile sides -->

\`Q3 business review\`

## Who is in the room, and what each side owns.

### Your team

- Ada Okafor
  - \`VP Operations\`
- Priya Raman
  - \`Head of Delivery\`

### Our team

- Marcus Vale
  - \`Account Director\`
- Tomas Lindqvist
  - \`Solution Architect\`
`;

let dir;
let browser;
const measured = {};
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-sides-'));
  browser = await puppeteer.launch({ executablePath: resolveChrome?.() || process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  for (const [name, venue] of [['phone', ''], ['laptop', 'laptop']]) {
    const md = path.join(dir, `${name}.md`);
    fs.writeFileSync(md, deck(venue));
    const out = path.join(dir, `${name}.html`);
    const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, out, '--no-split'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
    if (r.status !== 0) throw new Error(`export failed: ${r.stderr}`);
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1080 });
    await page.goto(`file://${out}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    measured[name] = await page.evaluate(() => {
      const s = document.querySelector('section.team-profile.sides');
      const stage = s.querySelector(':scope > .cell-stage');
      return {
        people: [...s.querySelectorAll('li.person')].map((li) => ({
          name: li.querySelector('.person-name').textContent,
          // The text's own right edge, measured with a Range: a word too long for its row spills out of the row's
          // box, and the roster's grid column can outgrow the stage too, so neither box shows it. The stage clips
          // (`overflow: clip`), so its edge is the one that cuts a word.
          spill: (() => {
            const edge = stage.getBoundingClientRect().right - parseFloat(getComputedStyle(stage).paddingRight);
            const range = document.createRange(); let right = -Infinity;
            for (const el of li.querySelectorAll('.person-name, .person-role')) { range.selectNodeContents(el); for (const r of range.getClientRects()) right = Math.max(right, r.right); }
            return right - edge;
          })(),
          // The same text against its own roster's content edge: in a column held to half the stage, a word too long
          // for the half runs across the dividing rule into the other roster instead.
          ownSpill: (() => {
            const ul = li.parentElement; const edge = ul.getBoundingClientRect().right - parseFloat(getComputedStyle(ul).paddingRight);
            const range = document.createRange(); let right = -Infinity;
            for (const el of li.querySelectorAll('.person-name, .person-role')) { range.selectNodeContents(el); for (const r of range.getClientRects()) right = Math.max(right, r.right); }
            return right - edge;
          })(),
        })),
        rosterSpill: Math.max(...[...s.querySelectorAll('ul.team-roster')].map((u) => u.getBoundingClientRect().right)) - stage.getBoundingClientRect().right,
        figureShare: s.querySelector('.person-figure').getBoundingClientRect().width / stage.getBoundingClientRect().width,
      };
    });
    await page.close();
  }
});
after(async () => {
  await browser?.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

test('PHONE: every name and role, and both rosters, end inside the stage', () => {
  assert.equal(measured.phone.people.length, 4);
  for (const p of measured.phone.people) assert.ok(p.spill <= 0.5, `${p.name} runs ${Math.round(p.spill)}px past the stage, which clips it`);
  for (const p of measured.phone.people) assert.ok(p.ownSpill <= 0.5, `${p.name} runs ${Math.round(p.ownSpill)}px past its own roster`);
  assert.ok(measured.phone.rosterSpill <= 0.5, `the second roster runs ${Math.round(measured.phone.rosterSpill)}px past the stage`);
});

test('LAPTOP: the portrait keeps its 14cqi square size', () => {
  assert.ok(Math.abs(measured.laptop.figureShare - 0.14) < 0.01, `the portrait is ${measured.laptop.figureShare.toFixed(3)} of the stage`);
});
