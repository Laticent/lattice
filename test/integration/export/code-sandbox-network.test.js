/**
 * Integration: the CLI's locked page for code packages makes NO network request, whatever a
 * hostile transform tries (portable-packages phase 6, step 1; lib/core/code-sandbox.js).
 *
 * A NETWORK LOG, not a claim about a string (HARD RULE #23): a real local HTTP + WebSocket server
 * and two UDP sockets count what reaches them while the same hostile transform runs under four
 * configurations. The CONTROL (no walls) must see every vector fire, or the zeros below would
 * prove a probe that cannot see. Each wall is then measured ALONE, so the claim is "two
 * independent walls", not "some combination happened to hold":
 *
 *   control        an ordinary online browser, an ordinary page    → every vector fires
 *   page walls     an ordinary ONLINE browser, openSandboxPage       → 0
 *   browser wall   the sandbox browser (offline args), a plain page  → 0
 *   both           the sandbox browser, openSandboxPage              → 0
 *
 * Each vector's URL path is unique, so a hit names the vector that made it; the two WebRTC
 * vectors each get their own UDP port. The plain `Worker` vector is the one the control cannot
 * fire (an opaque-origin document may not start a worker from a URL), so it is asserted in the
 * walled arms and exempt from the control's "fires" check.
 *
 * Slow tier: four Chromium launches and ~30 pages each.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const dgram = require('node:dgram');
const { SANDBOX_LAUNCH_ARGS, launchSandboxBrowser, openSandboxPage } = require('../../../lib/core/code-sandbox.js');
const { OFFLINE_CHROMIUM_ARGS } = require('../../../lib/core/offline-chromium.js');

const TIMEOUT = 300000;
const SETTLE_MS = 1500;

describe('code sandbox: a hostile transform reaches nothing', () => {
  let server;
  let hits;
  let udp;
  let H;
  let vectors;

  test.before(async () => {
    hits = [];
    server = http.createServer((req, res) => {
      hits.push(req.url);
      res.end('x');
    });
    server.on('upgrade', (req, sock) => {
      hits.push(req.url);
      sock.destroy();
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    H = `http://127.0.0.1:${server.address().port}`;
    udp = {};
    for (const name of ['webrtc', 'webrtcviaframe']) {
      const s = dgram.createSocket('udp4');
      s.on('message', () => hits.push(`/${name}`));
      await new Promise((r) => s.bind(0, '127.0.0.1', r));
      udp[name] = s;
    }
    const stun = (name) => `stun:127.0.0.1:${udp[name].address().port}`;
    const P = server.address().port;
    vectors = {
      image: `new Image().src='${H}/image'`,
      fetch: `fetch('${H}/fetch').catch(()=>{})`,
      xhr: `var x=new XMLHttpRequest();x.open('GET','${H}/xhr');x.send()`,
      websocket: `try{new WebSocket('ws://127.0.0.1:${P}/websocket')}catch(e){}`,
      beacon: `try{navigator.sendBeacon('${H}/beacon','x')}catch(e){}`,
      eventsource: `try{new EventSource('${H}/eventsource')}catch(e){}`,
      prefetch: `var l=document.createElement('link');l.rel='prefetch';l.href='${H}/prefetch';document.head.appendChild(l)`,
      preload: `var l=document.createElement('link');l.rel='preload';l.as='image';l.href='${H}/preload';document.head.appendChild(l)`,
      stylesheet: `var l=document.createElement('link');l.rel='stylesheet';l.href='${H}/stylesheet';document.head.appendChild(l)`,
      cssbg: `document.body.insertAdjacentHTML('beforeend','<div style="background:url(${H}/cssbg);width:9px;height:9px"></div>')`,
      iframe: `document.body.insertAdjacentHTML('beforeend','<iframe src="${H}/iframe"></iframe>')`,
      metarefresh: `document.head.insertAdjacentHTML('beforeend','<meta http-equiv="refresh" content="0;url=${H}/metarefresh">')`,
      navigate: `setTimeout(function(){location.href='${H}/navigate'},50)`,
      windowopen: `try{window.open('${H}/windowopen')}catch(e){}`,
      windowopenviaframe: `try{var f=document.createElement('iframe');document.body.appendChild(f);f.contentWindow.open('${H}/windowopenviaframe')}catch(e){}`,
      form: `document.body.insertAdjacentHTML('beforeend','<form id=f action="${H}/form" method=post></form>');document.getElementById('f').submit()`,
      worker: `try{new Worker('${H}/worker')}catch(e){}`,
      blobworker: `try{new Worker(URL.createObjectURL(new Blob(["fetch('${H}/blobworker')"])))}catch(e){}`,
      dynimport: `import('${H}/dynimport').catch(function(){})`,
      scriptsrc: `var sc=document.createElement('script');sc.src='${H}/scriptsrc';document.head.appendChild(sc)`,
      svgimage: `document.body.insertAdjacentHTML('beforeend','<svg><image href="${H}/svgimage"/></svg>')`,
      poster: `document.body.insertAdjacentHTML('beforeend','<video poster="${H}/poster"></video>')`,
      audio: `new Audio('${H}/audio').play().catch(function(){})`,
      ping: `document.body.insertAdjacentHTML('beforeend','<a id=p href="#x" ping="${H}/ping">p</a>');document.getElementById('p').click()`,
      speculation: `var sr=document.createElement('script');sr.type='speculationrules';sr.textContent=JSON.stringify({prefetch:[{source:'list',urls:['${H}/speculation']}]});document.head.appendChild(sr)`,
      // Found by the red team: a nonce the transform can read, it can reuse, so script is allowed by hash.
      noncereuse: `var n=document.currentScript&&document.currentScript.nonce;var sr=document.createElement('script');sr.type='speculationrules';sr.nonce=n;sr.textContent=JSON.stringify({prefetch:[{source:'list',urls:['${H}/noncereuse']}]});document.head.appendChild(sr)`,
      // A popup opened by a link or a form, not by window.open.
      blanklink: `document.body.insertAdjacentHTML('beforeend','<a id=b href="${H}/blanklink" target=_blank>b</a>');document.getElementById('b').click()`,
      // Found by the checker: a JavaScript click guard can be walked around; the sandboxed frame cannot.
      shadowlink: `var h=document.createElement('div');document.body.appendChild(h);var r=h.attachShadow({mode:'closed'});r.innerHTML='<a id=s href="${H}/shadowlink" target=_blank>s</a>';r.getElementById('s').click()`,
      patchedlink: `Element.prototype.closest=function(){return null};document.body.insertAdjacentHTML('beforeend','<a id=q href="${H}/patchedlink" target=_blank>q</a>');document.getElementById('q').click()`,
      svglink: `document.body.insertAdjacentHTML('beforeend','<svg><a id=v href="${H}/svglink" target=_blank><text y=10>v</text></a></svg>');document.getElementById('v').dispatchEvent(new MouseEvent('click',{bubbles:true}))`,
      blankform: `document.body.insertAdjacentHTML('beforeend','<form id=g action="${H}/blankform" target=_blank></form>');document.getElementById('g').submit()`,
      font: `try{new FontFace('x','url(${H}/font)').load().catch(function(){})}catch(e){}`,
      webrtc: `try{var pc=new RTCPeerConnection({iceServers:[{urls:'${stun('webrtc')}'}]});pc.createDataChannel('x');pc.createOffer().then(function(o){return pc.setLocalDescription(o)})}catch(e){}`,
      webrtcviaframe: `try{var f=document.createElement('iframe');document.body.appendChild(f);var pc=new f.contentWindow.RTCPeerConnection({iceServers:[{urls:'${stun('webrtcviaframe')}'}]});pc.createDataChannel('x');pc.createOffer().then(function(o){return pc.setLocalDescription(o)})}catch(e){}`,
    };
  });

  test.after(async () => {
    await new Promise((r) => server.close(r));
    for (const s of Object.values(udp)) s.close();
  });

  /**
   * Run every vector at once in its own page; return the vectors that reached a listener. Each
   * vector first logs that it RAN, and the run fails if one did not: a zero from a script that
   * never executed would otherwise pass every walled arm below.
   */
  async function fired(browser, locked) {
    hits.length = 0;
    const ran = new Set();
    const closers = await Promise.all(
      Object.entries(vectors).map(async ([name, body]) => {
        const code = `console.log('ran:${name}');${body}`;
        const onConsole = (text) => (text.startsWith('ran:') ? ran.add(text.slice(4)) : null);
        if (locked) return (await openSandboxPage(browser, { script: code, onConsole })).close;
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        page.on('console', (m) => onConsole(m.text()));
        const doc = `<!doctype html><html><head></head><body><script>${code}</script></body></html>`;
        await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(doc)}`).catch(() => {});
        return () => context.close();
      }),
    );
    // Settle on the hits, not a guess: wait at least SETTLE_MS, then until the list has not changed
    // for SETTLE_MS, within a deadline.
    const deadline = Date.now() + 8 * SETTLE_MS;
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    for (let seen = -1; seen !== hits.length && Date.now() < deadline; ) {
      seen = hits.length;
      await new Promise((r) => setTimeout(r, SETTLE_MS));
    }
    await Promise.all(closers.map((c) => c().catch(() => {})));
    assert.deepEqual([...ran].sort(), Object.keys(vectors).sort(), 'every vector must have RUN, or its zero means nothing');
    // `favicon.ico` is the browser's own follow-up after a vector navigates to this server.
    return [...new Set(hits.map((h) => h.replace(/^\//, '').split(/[/?]/)[0]))].filter((v) => v !== 'favicon.ico').sort();
  }

  const puppeteer = require('puppeteer');
  const plainLaunch = (args = []) => puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage', ...args] });

  test('the sandbox browser launches with its own frozen, offline argument list', () => {
    // Pinned LITERALLY: a change to the deck render's offline arguments must not reach this wall
    // unnoticed, and a copy compared with its own source could never fail.
    assert.deepEqual(SANDBOX_LAUNCH_ARGS, [
      '--proxy-server=http://127.0.0.1:9',
      '--proxy-bypass-list=<-loopback>',
      '--webrtc-ip-handling-policy=disable_non_proxied_udp',
      '--host-resolver-rules=MAP * ~NOTFOUND',
      '--disable-features=Prerender2,SpeculationRulesPrefetchFuture,NoStatePrefetchHoldback',
      '--dns-prefetch-disable',
    ]);
    assert.ok(Object.isFrozen(SANDBOX_LAUNCH_ARGS));
    for (const arg of OFFLINE_CHROMIUM_ARGS) assert.ok(SANDBOX_LAUNCH_ARGS.includes(arg), `the offline list gained ${arg}; add it to the sandbox's own list deliberately`);
  });

  test('CONTROL: with no walls, every vector reaches the listener', { timeout: TIMEOUT }, async () => {
    const browser = await plainLaunch();
    try {
      const got = await fired(browser, false);
      const expected = Object.keys(vectors).filter((v) => v !== 'worker').sort();
      assert.deepEqual(got, expected, 'a vector the control cannot fire proves nothing in the arms below');
    } finally {
      await browser.close();
    }
  });

  test('the PAGE walls alone, in an online browser, stop every vector', { timeout: TIMEOUT }, async () => {
    const browser = await plainLaunch();
    try {
      assert.deepEqual(await fired(browser, true), []);
    } finally {
      await browser.close();
    }
  });

  test('the BROWSER wall alone, with an ordinary page, stops every vector', { timeout: TIMEOUT }, async () => {
    const browser = await launchSandboxBrowser(puppeteer, { headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    try {
      assert.deepEqual(await fired(browser, false), []);
    } finally {
      await browser.close();
    }
  });

  test('both walls together stop every vector, and the page can still lay out and measure text', { timeout: TIMEOUT }, async () => {
    const browser = await launchSandboxBrowser(puppeteer, { headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    try {
      assert.deepEqual(await fired(browser, true), []);
      // The one thing a transform needs from the page (the contract's `measure`): layout.
      const sandbox = await openSandboxPage(browser, {
        body: '<span id="m" style="font:16px serif">Measure me</span>',
        script: "window.__width = document.getElementById('m').getBoundingClientRect().width;",
      });
      try {
        const width = await sandbox.frame.evaluate(() => window.__width);
        assert.ok(width > 40, `expected a laid-out width, got ${width}`);
        // And the transform's own script cannot start another: script is allowed by the hash of
        // the page's one bootstrap, which no other content matches.
        const injected = await sandbox.frame.evaluate(() => {
          const s = document.createElement('script');
          s.textContent = 'window.__ran = true';
          document.body.appendChild(s);
          return window.__ran === true;
        });
        assert.equal(injected, false);
      } finally {
        await sandbox.close();
      }
      // A transform whose text holds `<!--` then `<script` (a helper that builds HTML) must still
      // RUN: inlined raw, the HTML parser swallowed its closing tag, the text stopped matching its
      // hash, and the policy refused it without a word (found by the checker).
      const tricky = await openSandboxPage(browser, { script: "var s = '<!--<script>' + '</script>'; window.__ok = s.length;" });
      try {
        assert.equal(await tricky.frame.evaluate(() => window.__ok), '<!--<script></script>'.length);
      } finally {
        await tricky.close();
      }
    } finally {
      await browser.close();
    }
  });
});
