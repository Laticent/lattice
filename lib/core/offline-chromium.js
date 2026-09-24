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
 * WHY LAUNCH ARGUMENTS AND NOT THE CSP. The live exports' policy has no `default-src`, so a
 * stylesheet `@import` or a script's request still goes out, and it has to be injected into
 * every page of every browser. These arguments apply to the whole browser:
 *   - a dead proxy refuses every http(s) and WebSocket request, host names and IP literals
 *     alike, loopback included (`<-loopback>` removes Chromium's implicit loopback bypass);
 *   - the WebRTC policy stops the one kind of traffic a proxy never sees, UDP;
 *   - the resolver rule fails every host name, so no DNS query leaves either.
 * `file:`, `data:` and `blob:` never go through a proxy or a resolver, so the deck's own local
 * images, the vendored Mermaid and KaTeX, and the fonts all still load.
 *
 * Port 9 is the discard port and normally nothing listens there, so a refused request fails at
 * once. If something DOES listen on 127.0.0.1:9, a request to a raw IP address waits on it
 * (measured: ~30 s per render with a silent listener) — and if that listener were a real
 * proxy, such a request would go out through it. Host names never get that far, because they
 * fail to resolve first.
 *
 * `--allow-remote` on the CLI turns this off for an author who wants a remote image baked into
 * their PDF, which was the default until 2026-09-24.
 *
 * A dependency-free leaf.
 */
const OFFLINE_CHROMIUM_ARGS = Object.freeze([
  '--proxy-server=http://127.0.0.1:9',
  '--proxy-bypass-list=<-loopback>',
  // WebRTC's ICE gathering sends UDP (STUN, TURN) straight past an http proxy, and resolves a
  // STUN host name through the system resolver: a deck script could beacon to any IP, or put
  // slide text into a DNS name. This keeps WebRTC to proxied traffic, i.e. none. Measured on
  // Chromium 131: 12 UDP packets and a DNS query without it, 0 and 0 with it. (The
  // `--force-webrtc-ip-handling-policy` spelling does nothing there.)
  '--webrtc-ip-handling-policy=disable_non_proxied_udp',
  // A second layer: every host name fails to resolve, so nothing reaches DNS and a name never
  // reaches the proxy. The proxy itself is an IP literal, and file:, data: and blob: need no
  // resolver.
  '--host-resolver-rules=MAP * ~NOTFOUND',
]);

/**
 * The launch arguments to add for one render.
 * @param {boolean} allowRemote  the author passed `--allow-remote`
 * @returns {string[]}
 */
function offlineChromiumArgs(allowRemote) {
  return allowRemote ? [] : [...OFFLINE_CHROMIUM_ARGS];
}

module.exports = { OFFLINE_CHROMIUM_ARGS, offlineChromiumArgs };
