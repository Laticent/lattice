#!/usr/bin/env node
/**
 * tools/bleed-ink-sampler.cjs — read the heading band of each `bleed` photo in a headless Chromium, for the synchronous
 * Export-to-Marp tool (tools/export-marp.js, which runs this with `spawnSync` only when a deck has a `bleed` slide that picks its
 * ink: lib/export/marp-bleed-ink.js).
 *
 * stdin: a JSON array of `{ url, file, mime, rect: { x, y, w, h }, w, h }` (the file already confined by the caller).
 * stdout: a JSON object, url → an array of RGBA pixels, or null for a photo that could not be drawn.
 * Each photo is drawn as a `data:` image, so the page may read its pixels. CHROME_PATH names the browser when set.
 */
const fs = require('node:fs');

async function main() {
  const jobs = JSON.parse(fs.readFileSync(0, 'utf8') || '[]');
  const out = {};
  if (!jobs.length) return out;
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ headless: 'new', executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    for (const job of jobs) {
      try {
        const src = `data:${job.mime};base64,${fs.readFileSync(job.file).toString('base64')}`;
        out[job.url] = await page.evaluate(async (s, r, cw, ch) => {
          const img = new Image();
          img.src = s;
          try { await img.decode(); } catch { return null; }
          const canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, cw, ch);
          return Array.from(ctx.getImageData(0, 0, cw, ch).data);
        }, src, job.rect, job.w, job.h);
      } catch {
        out[job.url] = null;
      }
    }
  } finally {
    await browser.close();
  }
  return out;
}

main().then((out) => process.stdout.write(JSON.stringify(out)), () => process.stdout.write('{}'));
