/**
 * THROWAWAY measurement preload for engineering/decisions/2026-11-27-shared-chrome-for-tests.md.
 * Not wired into any npm script or CI job, and never to be: it exists so the five arms can be
 * measured on the SAME test files without editing one of them.
 *
 * `tools/shared-chrome-lab/run-arm.mjs` loads it into every `node --test` child through
 * NODE_OPTIONS. It acts only in a process whose entry file is a `*.test.js` (so the CLI children a
 * test spawns keep launching their own Chrome) and replaces `puppeteer.launch` by arm:
 *
 *   SC_ARM=baseline  launch as today, but log the launch
 *   SC_ARM=global    connect to the one browser at SC_WS
 *   SC_ARM=group     connect to the browser for this file's directory, from SC_WS_MAP
 *   SC_ARM=context   connect to SC_WS and give this launch its own browser context
 *   SC_ARM=pool      lease a browser from SC_POOL (an HTTP lease server) and give it a context
 *
 * In every shared arm the returned object's `close()` closes only what this launch opened and
 * disconnects; it never closes the shared browser. Each acquire is appended to SC_LOG as one JSON line.
 */
'use strict';

const entry = process.argv[1] || '';
if (/\.test\.(c?js|mjs)$/.test(entry) && process.env.SC_ARM) install();

function install() {
  const fs = require('node:fs');
  const path = require('node:path');
  const http = require('node:http');
  // puppeteer's CJS exports are read-only getters, so swap the cached module's exports for a
  // copy whose `launch` is ours; every later `require('puppeteer')` in this process gets the copy.
  const resolved = require.resolve('puppeteer', { paths: [process.cwd()] });
  const original = require(resolved);
  const realLaunch = original.launch.bind(original);
  const puppeteer = Object.create(original);
  require.cache[resolved].exports = puppeteer;
  const arm = process.env.SC_ARM;
  const file = path.relative(process.cwd(), entry);
  const log = (rec) => {
    if (process.env.SC_LOG) fs.appendFileSync(process.env.SC_LOG, `${JSON.stringify({ file, arm, pid: process.pid, ...rec })}\n`);
  };

  const get = (url) =>
    new Promise((resolve, reject) => {
      http
        .get(url, (res) => {
          let body = '';
          res.on('data', (c) => {
            body += c;
          });
          res.on('end', () => resolve(JSON.parse(body || '{}')));
        })
        .on('error', reject);
    });

  async function endpointFor() {
    if (arm === 'global' || arm === 'context') return { ws: process.env.SC_WS };
    if (arm === 'group') {
      const map = JSON.parse(process.env.SC_WS_MAP);
      const group = file.split(path.sep).slice(0, 3).join('/');
      return { ws: map[group] || map['*'], group };
    }
    if (arm === 'pool') return get(`${process.env.SC_POOL}/lease`);
    throw new Error(`unknown SC_ARM ${arm}`);
  }

  Object.defineProperty(puppeteer, 'launch', { value: async function launch(opts = {}) {
    const t0 = process.hrtime.bigint();
    const ms = () => Number(process.hrtime.bigint() - t0) / 1e6;
    if (arm === 'baseline') {
      try {
        const b = await realLaunch(opts);
        log({ ev: 'acquire', ok: true, ms: ms() });
        return b;
      } catch (e) {
        log({ ev: 'acquire', ok: false, ms: ms(), err: String(e.message).slice(0, 200) });
        throw e;
      }
    }
    let lease;
    try {
      lease = await endpointFor();
      const browser = await original.connect({
        browserWSEndpoint: lease.ws,
        defaultViewport: opts.defaultViewport === undefined ? { width: 800, height: 600 } : opts.defaultViewport,
      });
      const isolated = arm === 'context' || arm === 'pool';
      const ctx = isolated ? await browser.createBrowserContext() : null;
      const mine = new Set();
      log({ ev: 'acquire', ok: true, ms: ms(), lease: lease.id ?? lease.group ?? null });
      browser.on('disconnected', () => log({ ev: 'disconnected' }));
      return new Proxy(browser, {
        get(target, prop) {
          if (prop === 'newPage')
            return async (...a) => {
              const p = ctx ? await ctx.newPage(...a) : await target.newPage(...a);
              mine.add(p);
              return p;
            };
          if (prop === 'close' || prop === 'disconnect')
            return async () => {
              if (ctx) await ctx.close().catch(() => {});
              else for (const p of mine) await p.close().catch(() => {});
              await target.disconnect().catch(() => {});
              if (lease.id !== undefined) await get(`${process.env.SC_POOL}/release?id=${lease.id}`).catch(() => {});
              log({ ev: 'release' });
            };
          const v = Reflect.get(target, prop, target);
          return typeof v === 'function' ? v.bind(target) : v;
        },
      });
    } catch (e) {
      log({ ev: 'acquire', ok: false, ms: ms(), err: String(e.message).slice(0, 200) });
      throw e;
    }
  } });
}
