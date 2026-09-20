/**
 * The candidate that is not a library: the Chromium this repo ALREADY launches.
 *
 * `lib/core/dom-provider.js` notes that the browser branch gets the native
 * `DOMParser` because it is "fast AND correct", and treats that as a property of
 * the browser environment. But the CLI export runs a real Chromium too — and
 * `lattice-emulator.js:5311-5316` builds THREE jsdom windows while a puppeteer
 * page is open in the same process. So the fastest correct parser in the repo may
 * already be running, unused, next to the slowest one.
 *
 * WHAT DISQUALIFIES IT AS A GENERAL ANSWER, and it is structural rather than a
 * number: `withDom(html, fn)` is SYNCHRONOUS and hands `fn` a live node. CDP is
 * asynchronous and cannot pass a live node across the process boundary, so `fn`
 * has to run INSIDE the page. That is fine where the code already works that way
 * (the emulator has 39 `page.evaluate` bodies) and impossible everywhere else
 * without rewriting the transform contract.
 *
 * READ THE EMPTY ROUND-TRIP ROW FIRST. It is the floor: no operation can beat the
 * cost of one CDP call, so this option loses on small inputs and wins big on large
 * ones. Batching a whole deck's sections into ONE evaluate pays the floor once
 * instead of per section.
 *
 * Usage:  node tools/dom-bakeoff/chromium.mjs        (needs CHROME_PATH)
 */
import puppeteer from 'puppeteer';
import { fixtures } from './fixtures.mjs';

const FIX = await fixtures();
const INPUTS = [['median slide', FIX.slideMedian, 60], ['heaviest slide', FIX.slideHeaviest, 20], ['whole deck', FIX.deck, 8]];
const p50 = (x) => x.slice().sort((a, b) => a - b)[Math.floor(x.length / 2)];

const t0 = process.hrtime.bigint();
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
const page = await browser.newPage();
console.log(`\nChromium as a DOM provider — parse + query + mutate + serialize`);
console.log(`browser launch + newPage: ${(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1)} ms (paid once; the export path has already paid it)\n`);

await page.evaluate(() => 1); // warm the CDP channel

const OP = (h) => {
  const doc = new DOMParser().parseFromString(`<!DOCTYPE html><html><head></head><body>${h}</body></html>`, 'text/html');
  for (const sec of Array.from(doc.body.querySelectorAll('section'))) {
    const hd = sec.querySelector('h1, h2');
    if (hd) { const b = doc.createElement('span'); b.className = 'mark'; hd.appendChild(b); }
  }
  return doc.body.innerHTML.length;
};

for (const [label, html, iters] of INPUTS) {
  const means = [];
  for (let s = 0; s < 5; s++) {
    const t = process.hrtime.bigint();
    for (let i = 0; i < iters; i++) await page.evaluate(OP, html);
    means.push(Number(process.hrtime.bigint() - t) / 1e6 / iters);
  }
  console.log(`  ${label.padEnd(20)} ${p50(means).toFixed(3)} ms/op   (${(html.length / 1024).toFixed(0)} KB)`);
}

const means = [];
for (let s = 0; s < 5; s++) {
  const t = process.hrtime.bigint();
  for (let i = 0; i < 200; i++) await page.evaluate(() => 1);
  means.push(Number(process.hrtime.bigint() - t) / 1e6 / 200);
}
console.log(`  ${'(empty round-trip)'.padEnd(20)} ${p50(means).toFixed(3)} ms/op   <- the CDP floor; nothing beats this`);
await browser.close();
