#!/usr/bin/env node

/**
 * measure-word-cloud-drop.mjs — which words a word cloud LISTS and does not DRAW.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * `packCloud` seats words on a spiral and returns only the ones that fit. A word
 * it cannot seat is dropped harder than anything else in the chart family: the
 * name reaches no `data-label`, no speaker note, and not the SVG `<desc>`, which
 * is built from the packed list. `packPortraitLadder`'s own docblock says so.
 *
 * So the cloud is the one chart whose picture can hold FEWER things than its
 * source lists, and that fact drove a narration decision — `narrateWordCloud`
 * states no term count, because narration runs on Markdown and cannot see the
 * drop. The measurement behind that decision was a scratch script, and a checker
 * could not reproduce which word was lost (it looked at `data-label`, which by
 * construction does not carry it). This is the script, committed, so the number
 * and the NAME are both re-derivable.
 *
 * ── WHAT IT COMPARES ─────────────────────────────────────────────────────────
 *
 * The slide's top-level bullets against the `<text class="wc-word">` nodes in the
 * real render. Not `data-count` alone: the count says how many were seated and
 * says nothing about which, and the whole point of a drop report is the name.
 *
 * Usage:
 *   node tools/measure-word-cloud-drop.mjs                 # every deck in the tree
 *   node tools/measure-word-cloud-drop.mjs examples/x.md   # named decks
 *
 * Exits non-zero when any slide draws fewer words than it lists.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { render } = require_('../lib/engine/index.js');

/**
 * THE ROOTS, SPELLED OUT, because "every deck in the tree" is not a measurement
 * until someone says what the tree is — a checker measured 33 slides against a
 * quoted 34 for exactly this reason. `docs/dist` is a build copy of
 * `docs/public`, so including it would double-count one deck.
 */
const ROOTS = ['examples', 'test', 'lib', 'docs/public'];

function decks(args) {
  if (args.length) return args;
  return execSync(
    `grep -rl '_class: word-cloud' --include=*.md ${ROOTS.join(' ')} 2>/dev/null || true`,
    { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname },
  ).trim().split('\n').filter(Boolean);
}

const isTopBullet = (l) => /^[-*+]\s+\S/.test(l);
/** The label, with its trailing weight pill peeled — what the packer is asked to draw. */
const labelOf = (l) => l.replace(/^[-*+]\s+/, '').replace(/\s*`[^`]*`\s*$/, '').trim();

/**
 * COMPARE THE WORDS, NOT THE ESCAPING. A `<text>` node is escaped HTML and the
 * Markdown is not, so `"next quarter"` renders as `&quot;next quarter&quot;` and a
 * raw string comparison reports a word the picture is plainly drawing. The first run
 * of this script did exactly that — `gallery-jargon.md` came back "drew 6 of 6 — lost
 * \"next quarter\"", which is its own refutation. Typographic quotes get the same
 * treatment, since markdown-it's typographer rewrites them on one side only.
 */
const ENTITY = { quot: '"', apos: "'", amp: '&', lt: '<', gt: '>', '#39': "'", nbsp: ' ' };
const sameWord = (a) =>
  String(a)
    .replace(/&(quot|apos|amp|lt|gt|#39|nbsp);/g, (_, e) => ENTITY[e])
    .replace(/[\u2018\u2019\u201c\u201d]/g, (c) => ('\u2018\u2019'.includes(c) ? "'" : '"'))
    .replace(/\s+/g, ' ')
    .trim();

let slides = 0;
let short = 0;
for (const file of decks(process.argv.slice(2))) {
  let src;
  try { src = fs.readFileSync(file, 'utf8'); } catch { continue; }
  const sections = src.split(/^---\s*$/m).filter((s) => /_class:\s*word-cloud/.test(s));
  let out;
  try { out = render(src, {}); } catch { continue; }
  const html = typeof out === 'string' ? out : out.html;
  // One canvas per word-cloud section, in source order.
  const canvases = [...html.matchAll(/<div class="word-cloud-canvas"[\s\S]*?<\/svg>/g)].map((m) => m[0]);
  for (let i = 0; i < Math.min(sections.length, canvases.length); i++) {
    slides++;
    const listed = sections[i].split('\n').filter(isTopBullet).map(labelOf);
    const drawn = [...canvases[i].matchAll(/<text class="wc-word"[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1]);
    const seated = new Set(drawn.map(sameWord));
    const missing = listed.filter((w) => !seated.has(sameWord(w)));
    if (missing.length) {
      short++;
      console.log(`${file} slide ${i + 1}: drew ${drawn.length} of ${listed.length} — lost ${missing.join(', ')}`);
    }
  }
}
console.log(`\n${short} of ${slides} word-cloud slides draw fewer words than they list`);
console.log(`roots: ${ROOTS.join(' ')}`);
process.exit(short ? 1 : 0);
