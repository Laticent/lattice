#!/usr/bin/env node
/**
 * fetch-video-oembed.js — the BUILD-TIME (authoring-time) half of the `video`
 * component. Resolves each video URL's poster via the provider's public oEmbed
 * endpoint and caches the thumbnail to disk, so the RENDER stays offline (the
 * transform never touches the network — it only reads a local poster path).
 *
 * The network touch happens here, once, and is cached. A fetch failure never
 * throws — the component falls back to a provider placeholder. Instagram has no
 * public oEmbed (Facebook app-token gated); author a `poster` for it instead.
 *
 * Usage:
 *   node tools/fetch-video-oembed.js <url> [<url> …]     # print resolved posters
 *   node tools/fetch-video-oembed.js --deck examples/video.md --out examples/.video-cache
 *
 * See engineering/decisions/2026-07-02-video-component.md.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { detectProvider } = require('../lib/engine/video-providers');

// Minimal GET → JSON. Injectable so tests never hit the network.
function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'lattice-video-oembed/1.0' } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(httpGetJson(res.headers.location));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
        });
      })
      .on('error', reject);
  });
}

/**
 * Resolve one URL to { provider, title, thumbnailUrl } via oEmbed, or null when
 * the provider is unknown / has no public oEmbed / the fetch fails. Pure but for
 * the injected `fetchJson` — tests pass a stub, so this never hits the network.
 */
async function resolveOembed(url, fetchJson = httpGetJson) {
  const p = detectProvider(url);
  if (!p?.oembedUrl) return null;
  try {
    const j = await fetchJson(p.oembedUrl);
    return {
      provider: p.key,
      url: p.url,
      title: (j?.title || j?.author_name) || '',
      thumbnailUrl: (j?.thumbnail_url || j?.thumbnail_url_with_play_button) || '',
    };
  } catch {
    return null; // never break a build on a failed fetch
  }
}

// Download a thumbnail to `dest` (returns dest on success, '' on failure).
function download(url, dest) {
  return new Promise((resolve) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, { headers: { 'User-Agent': 'lattice-video-oembed/1.0' } }, (res) => {
        if (res.statusCode !== 200) { res.resume(); file.close(); fs.rmSync(dest, { force: true }); return resolve(''); }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
      })
      .on('error', () => { file.close(); fs.rmSync(dest, { force: true }); resolve(''); });
  });
}

// Extract the bare video-URL bullets from a deck's markdown source.
function videoUrlsFromDeck(src) {
  const urls = [];
  for (const line of src.split(/\r?\n/)) {
    const m = line.match(/^\s*-\s+(\S+)\s*$/);
    if (m && detectProvider(m[1])) urls.push(m[1]);
  }
  return [...new Set(urls)];
}

async function main(argv) {
  const args = argv.slice(2);
  const deckIdx = args.indexOf('--deck');
  const outIdx = args.indexOf('--out');
  const outDir = outIdx >= 0 ? args[outIdx + 1] : null;
  let urls;
  if (deckIdx >= 0) {
    urls = videoUrlsFromDeck(fs.readFileSync(args[deckIdx + 1], 'utf8'));
  } else {
    urls = args.filter((a) => !a.startsWith('--') && detectProvider(a));
  }
  if (!urls.length) {
    console.error('no recognized video URLs given');
    process.exit(1);
  }
  const cache = {};
  for (const url of urls) {
    const r = await resolveOembed(url);
    if (!r) { console.log(`• ${url} → no oEmbed (author a \`poster\`)`); continue; }
    let poster = r.thumbnailUrl;
    if (outDir && r.thumbnailUrl) {
      fs.mkdirSync(outDir, { recursive: true });
      const ext = (r.thumbnailUrl.match(/\.(jpe?g|png|webp)(?:$|\?)/i) || [])[1] || 'jpg';
      const file = path.join(outDir, `${r.provider}-${Buffer.from(url).toString('hex').slice(0, 12)}.${ext.replace(/\?.*/, '')}`);
      poster = (await download(r.thumbnailUrl, file)) || r.thumbnailUrl;
    }
    cache[url] = { provider: r.provider, title: r.title, poster };
    console.log(`• ${url} → [${r.provider}] ${r.title || '(untitled)'} · poster: ${poster || '(none)'}`);
  }
  if (outDir) fs.writeFileSync(path.join(outDir, 'video-oembed.cache.json'), `${JSON.stringify(cache, null, 2)}\n`);
}

if (require.main === module) {
  main(process.argv).catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { resolveOembed, videoUrlsFromDeck };
