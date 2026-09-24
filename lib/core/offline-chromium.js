/**
 * Launch arguments that keep a headless Chromium off the network — ONE copy, for every browser
 * the CLI launches to render a deck: the main render (pdf/pptx/png/imageset and the `.html`
 * sidecar's render), the CSS-prune pass, and the Mermaid worker.
 *
 * WHY THE RASTER RENDERS ARE CONTAINED NOW. The 2026-09-01 posture contained the LIVE exports
 * (`.html`, `--fluid`) with a content-security policy and left the raster ones fetching, on the
 * reasoning that the exporting author chose every image in the deck. Portable packages broke
 * that premise: a stranger's component can put its sample slide into the author's deck on
 * Insert, and every bypass five independent reviews found in the package gate reached the
 * network through exactly this surface, the CLI's PDF render
 * (engineering/decisions/2026-09-01-export-remote-subresource-posture.md, revised 2026-09-24).
 * With this, a gap the gate still has reaches nobody.
 *
 * WHY A PROXY AND NOT THE CSP. The live exports' policy has no `default-src`, so a stylesheet
 * `@import` or a script's request still goes out, and it has to be injected into every page of
 * every browser. A dead proxy is one launch argument per browser, and it refuses EVERY http(s)
 * and WebSocket request those browsers make — host names and IP literals alike, loopback
 * included (`<-loopback>` removes Chromium's implicit loopback bypass). `file:`, `data:` and
 * `blob:` never go through a proxy, so the deck's own local images, the vendored Mermaid and
 * KaTeX, and the fonts all still load. Port 9 is the discard port; nothing listens there, so a
 * refused request fails at once rather than waiting out a timeout.
 *
 * `--allow-remote` on the CLI turns this off for an author who wants a remote image baked into
 * their PDF, which was the default until 2026-09-24.
 *
 * A dependency-free leaf.
 */
const OFFLINE_CHROMIUM_ARGS = Object.freeze(['--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>']);

/**
 * The launch arguments to add for one render.
 * @param {boolean} allowRemote  the author passed `--allow-remote`
 * @returns {string[]}
 */
function offlineChromiumArgs(allowRemote) {
  return allowRemote ? [] : [...OFFLINE_CHROMIUM_ARGS];
}

module.exports = { OFFLINE_CHROMIUM_ARGS, offlineChromiumArgs };
