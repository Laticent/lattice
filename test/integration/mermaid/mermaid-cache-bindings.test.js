/**
 * Integration: A DIAGRAM THE CACHE HANDS BACK KEEPS ITS CLICK LINK AND ITS TOOLTIP.
 *
 * The runtime keeps every SVG it draws, keyed by (scope, source), and hands it back instead
 * of re-rendering in two places: the same-task replay after a host swaps the deck's HTML (the
 * Studio preview, on every keystroke) and `restoreStrippedDiagrams`, which redraws an SVG that
 * VS Code's built-in Mermaid extension removes on every preview update (#2722). Both go
 * through `settleFenceFromCache` (lib/plugins/mermaid/mermaid.hydrate.js).
 *
 * A flowchart's `click A "url" "tooltip"` lives in two places. The LINK is markup: Mermaid draws an `<a>`
 * into the SVG, so the cache keeps it. The TOOLTIP is behavior: `result.bindFunctions(target)`
 * attaches a `mouseover` listener to every node, and a cached SVG string carries no listener.
 * For a flowchart at the runtime's `securityLevel: 'strict'` a click CALLBACK is never
 * registered at all (Mermaid's `setClickFun` returns early), so the tooltip is the whole of
 * what can be lost. A gantt link is the opposite case, behavior and not markup, and is
 * pinned in the second describe below.
 *
 * THE ARM THAT FAILS: on the runtime before the fix, hovering the node after either hand-back
 * leaves Mermaid's tooltip empty.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome.js');
const { withRuntimeDeckPage } = require('../../helpers/mermaid-runtime-page.js');

const CHROME = resolveChrome();
const TIMEOUT = 180000;
const URL = 'https://example.com/lattice';
const TIP = 'Opens the API reference';

const DECK = [
  '---', 'theme: indaco', '---', '',
  '<!-- _class: diagram -->', '',
  '## Linked', '',
  '```mermaid', 'flowchart LR',
  '  A["Web App"] -->|calls| B["API"]',
  `  click B "${URL}" "${TIP}"`,
  '```', '',
].join('\n');

/** Hover node B the way a pointer does and read back Mermaid's tooltip and B's link. */
function hoverAndRead(page) {
  return page.evaluate(() => {
    const tip = document.querySelector('.mermaidTooltip');
    if (tip) tip.textContent = '';
    const node = document.querySelector('.mermaid > svg g.node[title]');
    if (!node) return { node: false };
    node.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const link = node.closest('a');
    return {
      node: true,
      tooltip: document.querySelector('.mermaidTooltip')?.textContent || '',
      href: link ? (link.getAttribute('href') || link.getAttribute('xlink:href')) : null,
    };
  });
}

const settle = () => new Promise((r) => { setTimeout(r, 1000); });

function assertBound(read, when) {
  assert.ok(read.node, `${when}: the node with a tooltip is drawn (read: ${JSON.stringify(read)})`);
  assert.equal(read.href, URL, `${when}: the click link is in the SVG`);
  assert.equal(read.tooltip, TIP, `${when}: hovering the node shows its tooltip`);
}

describe('a cached Mermaid hand-back keeps its click bindings', { skip: skipWithoutChrome(CHROME) }, () => {
  test('fresh render, host swap (cache replay), host strip (restore)', { timeout: TIMEOUT }, async () => {
    await withRuntimeDeckPage(DECK, 1, async (page) => {
      assertBound(await hoverAndRead(page), 'fresh render');

      // The Studio's swap: the same engine HTML written over the deck again. The fence is new
      // and unmarked; the replay settles it from the cache in the mutation microtask.
      await page.evaluate(() => { document.querySelector('article.lattice').innerHTML = window.__deckHtml; });
      await settle();
      assertBound(await hoverAndRead(page), 'after a cache replay');

      // VS Code's strip: the line its mermaid-markdown-features preview script opens with.
      await page.evaluate('for (const svg of document.querySelectorAll(".mermaid > svg")) svg.remove();');
      await settle();
      assertBound(await hoverAndRead(page), 'after a strip-and-restore');
    });
  });
});

// Two gantts in one band, each linking one task. Mermaid's gantt db is ONE module-level
// object, and its click handlers find their element page-wide by id when its binder RUNS.
// Two defects lived here, and each arm below failed on one of them:
//   · FRESH RENDER (on main): Mermaid starts the second gantt's parse before the runtime
//     binds the first, so gantt 1 never got its link. The runtime now renders gantts one
//     at a time, render to bind (`takeGanttTurn`).
//   · CACHE HAND-BACK: a gantt from the cache had no link at all on main, and replaying
//     Mermaid's binder (an earlier cut of #2734) ran the LAST-parsed gantt's handlers:
//     gantt 1's task opened twice, gantt 2's not at all. The cache now replays a binder
//     built from a snapshot of each chart's own links (`ganttLinkBinder`).
// Each variant is a shape Mermaid accepts that a narrower match in the runtime once missed:
// a `%%{init}%%` directive on the `gantt` line (Mermaid strips it before detecting the
// type, so a line-start `gantt` match waved the chart past the turn), and a capitalized
// `Click` (the gantt lexer is case-insensitive, so it links, but a lower-case gate skipped
// the snapshot and the hand-back lost the link).
const GANTT_VARIANTS = [
  { name: 'plain', headline: 'gantt', click: 'click' },
  { name: '%%{init}%% on the gantt line', headline: '%%{init: {"gantt": {"barHeight": 20}}}%% gantt', click: 'click' },
  { name: 'capitalized Click', headline: 'gantt', click: 'Click' },
];
const gantt = (v, name, task, url) => [
  '<!-- _class: diagram -->', '', `## ${name}`, '', '```mermaid', v.headline,
  '  dateFormat YYYY-MM-DD', `  title ${name}`, '  section S', `  ${task} :${task}, 2024-01-01, 3d`,
  `  ${v.click} ${task} href "${url}"`, '```', '',
];
const ganttDeck = (v) => ['---', 'theme: indaco', '---', '',
  ...gantt(v, 'One', 'ta', 'https://one.example/'), '---', '', ...gantt(v, 'Two', 'tb', 'https://two.example/')].join('\n');

/** Click every linked task's bar AND label; return, per element, the URLs `window.open` got. */
function clickTasks(page) {
  return page.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll('.mermaid > svg [id]')) {
      const m = el.id.match(/-(t[ab])(-text)?$/);
      if (!m) continue;
      window.__opens = [];
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      out[m[1] + (m[2] || '')] = window.__opens.slice();
    }
    return out;
  });
}

/** Each task's bar and label open exactly that task's own link, once. */
function assertOwnLinks(read, edited, when) {
  const own = { ta: edited ? 'https://uno.example/' : 'https://one.example/', tb: 'https://two.example/' };
  for (const key of ['ta', 'ta-text', 'tb', 'tb-text']) {
    assert.deepEqual(read[key], [own[key.slice(0, 2)]], `${when}: ${key} opens its own link once (read: ${JSON.stringify(read)})`);
  }
}

describe('two linked gantts: every hand-back binds each chart\'s own link', { skip: skipWithoutChrome(CHROME) }, () => {
  for (const v of GANTT_VARIANTS) {
    test(`${v.name}: fresh, edit one, keep typing, partial strips`, { timeout: TIMEOUT }, async () => {
      await withRuntimeDeckPage(ganttDeck(v), 2, async (page) => {
        await page.evaluate(() => { window.__opens = []; window.open = (u) => { window.__opens.push(u); }; });
        const swap = (html) => page.evaluate((h) => { document.querySelector('article.lattice').innerHTML = h; }, html);
        assertOwnLinks(await clickTasks(page), false, 'fresh render');

        await swap(await page.evaluate(() => window.__deckHtml)); // both from the cache
        await settle();
        assertOwnLinks(await clickTasks(page), false, 'after a cache replay');

        const edited = await page.evaluate(() => window.__deckHtml.split('one.example').join('uno.example'));
        await swap(edited); // gantt 1's source changed: it re-renders, gantt 2 comes from the cache
        await settle();
        assertOwnLinks(await clickTasks(page), true, 'after an edit');

        await swap(edited); // a keystroke elsewhere: both from the cache
        await settle();
        assertOwnLinks(await clickTasks(page), true, 'after a keystroke elsewhere');

        for (let i = 0; i < 2; i++) {
          await page.evaluate(() => document.querySelector('.mermaid > svg')?.remove());
          await settle();
          assertOwnLinks(await clickTasks(page), true, `after partial strip ${i + 1}`);
        }
      });
    });
  }
});
