---
status: in-progress
summary: >
  The plan for npm plugins (phase G) rests on one sentence, "installing it is the trust decision",
  and that sentence does not cover plugin output that reaches other people, the Studio and desktop
  app where the AI key lives, transitive dependencies, or a bake that runs with full Node
  privileges. This note records those gaps and proposes a gate (catches mistakes and drift) plus
  an adversarial harness (contains a hostile plugin). The owner decided on 2026-10-17 that the harness and the G5 check must pass before the npm door opens.
---

# npm plugins: the threat model the plan does not have yet (2026-10-16)

Status: in progress. The owner decided on 2026-10-17 (§6); nothing is built yet.

Parents: `2026-09-13-plugin-architecture.md` (Axis 2, the trust channels),
`2026-09-27-plugin-system.md` (§4.10 and phase G), `2026-09-24-code-package-contract.md` (the
sandbox), `spec/LPM.md` (a draft until the npm door opens).

## 1. The answer

**Yes, the npm door needs both a gate and a harness, and they do different jobs.**

- A **gate** is a static check in `build:check`. It catches mistakes and drift: a plugin that
  starts calling `fetch`, an unlisted package, an undeclared contribution. It cannot stop a
  hostile author, because `globalThis['fe'+'tch']` passes any identifier scan.
- A **harness** is a test that runs plugin code inside the locked page and tries to get data out.
  It proves the walls hold against the exits it tries. It does not prove a plugin is benign: a
  hostile plugin can test where it runs (the worker's `blob:null` origin, `navigator.webdriver`, a
  date) and behave only in a real export, so the canary proves the walls and a conformance run
  proves nothing about intent. The repo already has the walls for it
  (`lib/core/code-sandbox.js`), and `test/integration/export/plugin-fence-door.test.js` already runs a
  stranger's zip plugin through the locked page with a network log that must read 0 (fetch,
  WebSocket, `sendBeacon`). The npm door has no equivalent test; the harness builds on that one.

The boundary does the protecting, and it protects only on the surface where the code really runs. The gate only keeps honest contributors honest.

## 2. What the plan says today

- `2026-09-13` Axis 2: an npm plugin carries code, Node-side, resolved at build time. The reason
  given: "you ran `npm i`. You already execute the engine and 15 transitive dependencies in that
  process; a plugin there is no more privileged than any dependency you chose."
- `2026-09-27` §4.10: npm plugins may carry every code contribution, including `bake.js`, after
  the `LICENSE-EXCEPTIONS` plugin grant. Discovery is by an explicit list, not a name prefix.
  Every export records each non-shipped plugin's name and SHA-256.
- The same section says a `bake` "runs with full Node privileges … so no sandbox the code-package
  door has can hold one."

The explicit list and the export record are good. Neither limits what an admitted plugin can do.

## 3. Why "installing it is the trust decision" is not enough here

1. **Plugin output travels, and Lattice writes two different HTML exports.** A plugin's browser
   code (`hydrate`, `payload`) runs in the browser of whoever opens a deck export. That person never
   ran `npm i`. The two exports carry different policies, and only one of them runs plugin code:
   - **`--player`** (`default-src 'none'`, the one script pinned by SHA-256,
     `lib/export/player-core.mjs:3344-3347`, hash at 3344, policy at 3345-3347). It ships no `hydrate` code: a real export of a
     two-slide deck has 0 mentions of it, and `playerJs` bundles first-party code only.
   - **Plain `.html`** (what every render writes beside its output, and `--fluid`). Its policy is
     only `img-src … ; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'`
     (`lib/core/subresource-csp.mjs:169-176`; the `…` below hides `media-src` and `font-src`). It has no `default-src`, no `script-src` and no
     `frame-src`. It ships the runtime, so it is the export where plugin `hydrate` code runs.

   **Measured 2026-10-17 on real exports** (opened from `file://`; headless Chromium; a local HTTP
   and UDP listener; each attempt ran inside the page; a control copy with the policy removed
   reached the listener on every attempt, so no cell is empty by accident, except where noted):

   | Exit the script tries | `--player` export | Plain `.html` export |
   |---|---|---|
   | `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `Image`, CSS `url()`, form post | blocked (all three engines) | blocked (Chromium; the control reached the listener on each) |
   | `<script src>`, `<iframe>`, CSS `@import`, `<link rel=stylesheet>`, `<link rel=prefetch>`, meta refresh | `<iframe>` blocked (all three engines); the rest not tried | **reach the listener** (`<script src>` carried the slide text) |
   | `location.href`, `window.open` | **reach the listener** (all three engines) | **reach the listener** |
   | **WebRTC** (a TURN server's username field carries the text) | **reaches the listener** (Chromium; hidden by the offline launch arguments) | not tried |

   So the earlier reading, that the export's policy "closes every request a script can send", was
   wrong. `--player` leaves navigation, `window.open` and WebRTC open; the plain export, which is
   the one that runs plugin code, leaves nearly everything open. A freeze of `location` would not
   close WebRTC. The WebRTC leak is a UDP packet to a server the page names, with no visible sign.
   An earlier replay in Chromium alone also saw no request from `<a ping>` or `<link rel=prefetch>`
   on the `--player` policy; the real-export run did not repeat those two. Changing either policy
   changes the bytes of an exported artifact, so it needs the owner's inspection (CLAUDE.md,
   QUALITY BAR); this note proposes nothing there.
2. **The Studio and the desktop app are not `npm i` projects.** The Studio keeps the user's
   OpenRouter key in same-origin `localStorage` (`lattice-db-or-key`, read in four places on
   2026-10-16). The Tauri exploration note (`2026-05-10-tauri-exploration.md`) mentions the system keychain
   for credentials; whether the desktop app will hold this key there is not decided. If it does, a
   plugin with full Node privileges inside that app's process defeats the keychain. Any plugin
   script in the Studio page sits next to the key today. The plan says npm plugins resolve "at build time" and does not say
   whether the Studio or the desktop app ever loads one (answered: not in v1, §6 rows 3 and 4).
3. **Install-time code and transitive dependencies.** A normal `npm i` runs a dependency's
   lifecycle scripts (`postinstall`) before Lattice sees anything, and a plugin's dependencies pull
   in more packages. (Measured 2026-10-16 with a throwaway tarball: a default `npm i` ran its
   `postinstall`; `--ignore-scripts` did not.) The owner's decision of 2026-10-17 removes the
   exposure by design: a plugin is a self-contained bundle built with all its dependencies, and
   Lattice downloads that bundle as it is. Lattice never runs `npm install` for a plugin and never
   resolves its dependencies (§6, decision 8).
4. **Version drift.** Phase G turns version ranges on. A routine update then changes the code that
   renders every deck on the machine. The export record tells you afterward which hash ran; it does
   not stop the change.
5. **`bake` is the one surface no sandbox holds.** `code-sandbox.js` records why: Node's
   permission model did not block the network when measured, so code packages run in a locked
   Chromium page instead. `bake` runs in the CLI's own process.
6. **A plugin that is off can leak what it was meant to draw.** The video/image plugins session
   reported on PR #2727 that an inline `@qr{…}` record leaves its typed text on the slide when its
   plugin is off, so a Wi-Fi record would print its password. This is a degradation leak: no
   network, storage or key is involved, so neither the gate (§5.1) nor the harness (§5.2) can see
   it. The fix is QR slice 2 on #2727 (inline dispatch honoring `degradesTo`). Not verified here:
   I read this from that session's report and did not reproduce it.

## 4. The principle that makes this tractable

A plugin is smart about what it controls and dumb about what is around it. It takes data in and
returns markup out. It never calls AI, never reads storage, and loads nothing but its own deck's files and
author-supplied URLs. Authors
write plugins through the coach, and the plugin renders what the author typed or accepted.

**Checked 2026-10-16: it holds for in-tree code.** A grep for `fetch`, `XMLHttpRequest`,
`WebSocket`, `sendBeacon`, `localStorage`, `sessionStorage`, `indexedDB` and `openrouter` across
`lib/plugins`, `lib/components` and `lib/runtime` (vendored libraries and generated files
excluded) found one code hit once comment lines are filtered out: `lib/runtime/index.js:618`, which
fetches the deck's own markdown. The grep cannot see loads that use none of those names. A
fact-check pass found these, all first-party files or author-supplied URLs and none a leak of
stored data: script tags for the dagre engine (`lib/runtime/index.js:90`) and plugin data
(`:145`); the author's `logo` as `img.src` (`:1391`); the payload loader's `<script src>`
(`lib/plugins/host-browser.mjs:141`); and Mermaid's author-written click links via `window.open`
(`lib/plugins/mermaid/mermaid.hydrate.js:1077`). G1 must allowlist these by name. AI calls live in the Studio's coach side (`architect-model.js`, `chat-agent.ts`, `voice-model.js`)
and two library pages (`suono`, `cadenza`). **No gate enforces it.**

For npm, the principle becomes the admission contract: a plugin that needs the network or the key
is refused, not sandboxed.

## 5. Proposal

### 5.1 The gate (static)

| Check | Catches | Honest limit |
|---|---|---|
| **G1. Purity scan** of plugin and component code: no network, storage, or key-name identifiers; an allowlist entry needs a justification and fails when stale | An in-tree contributor adding `fetch` by accident | Obfuscation passes. For npm it is a tripwire, not a defense |
| **G2. Plugin admission**: explicit list, exact versions, an integrity hash, and the plugin downloaded as one self-contained bundle and never installed with `npm install` (so no lifecycle script or dependency runs); a bundle with anything left external is refused, as the code-package bundler already does (contract note §8) | A typosquat, a silent update, an install-time script, a hidden dependency | Does not read the code. A reviewed version can still be hostile |
| **G3. Declared equals contained**: the manifest names every contribution (`hydrate`, `bake`, `payload`) and the build fails both ways (already enforced in-tree by `lib/plugins/resolve.js`: a bake declared with no file, and a file shipped but not declared) | A plugin carrying a surface it did not declare | A declared surface can still misbehave |
| **G4. Export record** (already planned, §4.10): name plus SHA-256 per non-shipped plugin | Nothing at run time; it makes an incident traceable | After the fact |
| **G5. Never load a plugin in Node**: the host reads a plugin's files as bytes and never `require`s or `import`s it; a test plugin whose `index.js` writes a file when loaded must leave no file | A plugin running with full computer access before any sandbox exists | Covers the code paths the test reaches; a new loader added later needs the same test |

### 5.2 The harness (dynamic)

Run the plugin's `render` in the existing locked page with a local listener on HTTP, WebSocket and
UDP, the way `code-sandbox-network.test.js` already measures the code door. `hydrate` and
`payload` do not run in the locked page; they run in a recipient's browser (§3.1), so v1 admits
neither (§6 rows 3 and 4 and decision 10: plugins never send code) and part 3 covers the export. Five parts:

1. **A canary plugin** kept in test fixtures. It is deliberately hostile and tries every exit:
   `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, an `<img>` or CSS `url()` beacon,
   `window.open`, navigation, WebRTC, DNS, `postMessage` to the parent, `localStorage`,
   `IndexedDB`, cookies, a service worker, `eval`, dynamic `import()`. The test passes only if
   the listener sees zero packets and no storage read returns data. A harness that cannot fail
   proves nothing (HARD RULE #9's "the arm that proves the thing can fail", applied here), so the canary must be shown
   red against a deliberately weakened wall.
2. **A conformance run per admitted npm plugin**: the same locked page, the plugin's real fixtures,
   zero network, and output that passes `sanitizeSlideHtml` and `sanitizeStyleText` unchanged
   (HARD RULE #22: markup and stylesheet are separate channels).
3. **An export check**: render a deck that uses the plugin to each HTML export and open it with
   NORMAL browser arguments and a listener on HTTP and UDP, including a TURN responder for WebRTC.
   Do not use `lib/core/offline-chromium.js`'s arguments here: they set
   `--webrtc-ip-handling-policy=disable_non_proxied_udp`, which hid the WebRTC leak in §3.1. The
   check passes only when navigation, `window.open`, WebRTC and the subresource exits all read
   zero. Today they do not, so the check cannot pass without an export change (owner sign-off), and
   it must not pass by recording the exit and accepting it. Accepting an exit is a separate owner
   decision.
4. **Data-return case (decision 10).** The canary hands the host hostile data (a script, an event handler, a `javascript:` link, a `</style>` break-out, oversized values) and checks two things: the host sanitizes or drops it, and the host disables the plugin and alerts the user.
5. **Keep the canary open-ended.** It is pinned to the listener and policy surface, not to a fixed
   list. Any exit a reviewer names is added before the door opens, and the canary runs in
   Chromium, WebKit and Firefox as §3.1 did.

**Owner decisions, 2026-10-18.** Add G1 (`checkPluginPurity`, built). Run the export check nightly, not per PR
(`test/integration/export-nightly/`), with WebKit and Firefox driven through Playwright in `integration-nightly.yml`. The owner
asked when the export gaps should be closed and about the `unmeasured` layer; this PR answers neither on its own authority (see
`followups.d/2749-p2-export-csp-gaps.md` for the recommended timing).

**Built 2026-10-18 (parts 1, 2 and 5 in the locked page; part 3 as a measuring check; part 4 not yet).**
`test/integration/export/npm-plugin-canary.test.js` runs a hostile fence renderer
(`test/fixtures/npm-plugin-canary.js`, 29 attempts: network, storage, code from strings, the runner) through the
real plugin door and reads a local HTTP, WebSocket and UDP listener. Beside every zero sits a control that reaches
the listener: the same code in an ordinary online page reads the planted `localStorage`, `sessionStorage` and
cookie and reaches the listener on seven network vectors plus WebRTC; the canary's markup half (24 tags, 23 addresses) fires in
an online page raw and reads zero after the host's sanitizer. A committed WEAKENED arm runs the same renderer in a worker with no wall and reaches the listener on eleven vectors, so the door arm's zero is not an API that was never there. With the browser flags, the page policy and the worker
wall all removed (a manual run, not committed), the door arm goes red and names `fetch`, `importscripts`, `websocket` and `xhr`; with the first
three removed and the worker wall left, it stays green, because the worker wall holds alone. `export-nightly/npm-plugin-export-check.test.js` (nightly) opens the real
`--player` and plain exports with normal browser arguments in Chromium, WebKit and Firefox and is `todo` because it
reads open exits (below); it must lose the `todo` only by closing them. The red team found a bypass the first canary missed: an address held in a custom property and read through `image-set(var(--q))` survived the door's sanitizer (`cssRefTargets`). The first fix was bypassable and over-broad (the checker found an inherited variable, a space, backslashes and a comment slipped past, and a plain `--sep:"/"` label was stripped); the second lists an address-shaped string (a network scheme, `//` or a backslash pair) from any custom property, and the canary now carries the inherited, spaced and backslash forms in real Chromium; the same hole in the package stylesheet gate is closed (2026-10-19): `findCssExfil` (`lib/core/css-scan.js`) reports an address-shaped string in a custom property or an `@property` `initial-value` as `css-var-address`, which `firstRefusal` refuses, so a component, theme or plugin package carrying one is refused. The same walk replaced the `image-set()` regex, which stopped at the first `)` and missed `image-set(url(data:…) type(…) 1x, "//evil" 2x)`. The canary's STYLESHEET arm renders each form as an installed component through the real CLI and opens the export in an online browser; with the fix reverted all five forms reached the listener. Part 4 waits on the data-return surface
(`followups.d/2749-p4-plugin-data-return-surface.md`). What stays open is in
`followups.d/2743-p1-npm-plugin-canary-harness.md`.

**Measured 2026-10-18 on real exports, normal browser arguments, each cell with a control that reached the
listener** (Chromium 131, WebKit 26.0, Firefox 142.0.1; the control is the same export with its policy removed;
WebKit's control cannot fire `prefetch` and Firefox's cannot fire `prefetch` or `<a ping>`, so those are
UNVERIFIED in those engines): the `--player` export leaves `navigate`, `windowopen`, `webrtc`, `metarefresh` and a
`target=_blank` link open in all three engines; the plain export additionally leaves `scriptsrc`, `iframe`,
`cssimport`, `linkstyle` and (Chromium) `prefetch` open. `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`,
`sendBeacon`, `Image`, CSS `url()`, `@font-face` and form posts read zero in both exports.

### 5.3 What neither covers

- A Chromium renderer exploit on a machine where the OS layer reads OFF. The code sandbox's two
  walls are browser policy. Under them, `lib/core/os-sandbox.js` turns Chromium's own OS sandbox
  on wherever the machine allows it (as root on Linux it runs the browser as `nobody`; owner
  decision 2026-09-26) and reports which layer it got. Where the layer reads OFF, the consent text
  says so and the approval is pinned to that layer (contract note §9). An escape there is not
  contained. The "NOT CLAIMED HERE" header in `code-sandbox.js` was stale next to `os-sandbox.js` (the
  contract note's §4 has the same stale line, now annotated), and the first draft of this note
  repeated it as if no OS layer existed; that was wrong and is fixed.
  **Measured 2026-10-17 in this cloud container (root), with the real launcher:** a Chromium under
  `/root` read OFF with the renderer running as root (`nobody` gets `EACCES`); a world-readable
  Chromium under `/opt/pw-browsers` read ON, measured, with the renderer running as `nobody`.
  Edge case: if the layer probe at approval time fails, nothing is pinned, and no later render of
  that approval is refused for a weak layer.
- Anything the plugin does through legitimate output: a misleading chart is still a chart.
- A hostile `bake`: none runs in v1 (§6 decisions 3 and 4; the owner's answer on what a plugin may contribute is decision 10). A later version that admits one reopens this.
- State carried across slides: one worker serves every slide a package claims in a render, so a
  plugin can carry text from an earlier slide into later output. It stays inside one deck and
  reaches the page only as sanitized markup.

### 5.4 The exits a policy cannot close, and the owner's decision (2026-10-18)

The export check (§5.2 part 3) found ten exits open in the plain `.html` export and five in `--player`. A
content-security policy closes some and cannot close the rest. Measured on real exports in Chromium 131,
WebKit 26.0 and Firefox 142.0.1, each cell beside a control that reached the listener:

| Exit a running script tries | Plain export, before | Plain export, after the lock | `--player` |
|---|---|---|---|
| `<script src>`, `<iframe>`, CSS `@import`, `<link rel=stylesheet>`, `<link rel=prefetch>` | open | **closed** (`default-src`, `script-src`, `style-src`, `frame-src`) | closed already (`default-src 'none'`) |
| `location.href`, `window.open`, WebRTC, a `<meta http-equiv=refresh>`, a `target=_blank` link | open | **open** | **open** |

No content-security directive governs the second row: `navigate-to` was removed from the spec, and WebRTC and
popups have no directive at all. `--player` already has the strictest policy a page can carry and still
leaves all five open, which is the proof. The only things that would close them are running the deck in a
sandboxed frame (no popups, no top navigation; WebRTC still open) or never letting a hostile script run.

**Decision (owner, 2026-10-18): close the five a policy can, accept the five it cannot.** The plain export adds
the four directives from `lib/core/export-load-lock.js` (the CLI's `lattice.js` only; the Playground preview keeps the
narrow default because it loads KaTeX's stylesheet from a remote origin, and the shared `subresource-csp.mjs` stays
untouched so the Studio bundle gains no bytes). A deck that deliberately loads its own remote script, frame or stylesheet in the plain `.html` keeps them by exporting with `--allow-remote`, the flag that already means "this export may reach the network"; the lock is on by default. (A deck author's raw HTML stays live in the plain export by design, `design/skill.md` §Raw HTML, so this is a visible change for such decks and the changelog fragment leads with **Breaking:**.) The accepted five are named in the
nightly export check, which fails if a sixth opens and fails if an accepted one closes, so the list cannot
rot. The exit criterion for phase G therefore rests on **no hostile script ever reaches an export**:
v1 sends no plugin code to an export (§6 decision 10), and `--player` pins its one script by SHA-256. A later
version that delivers plugin script to an export must first reopen this decision (sandboxed frame, or refuse).

Checked that the lock costs no rendering: 5 decks (KaTeX, Mermaid, function-plot, charts, the export
coverage deck) exported with and without the four directives, opened in all three engines, produce
0 policy violations and byte-identical screenshots; the check was re-run on Chromium 141.0.7390.37 (a second Chrome) and on exports served over http instead of `file://`, with the same five open exits and every control firing.

### 5.5 The loader (2026-10-19)

`lib/packages/npm-plugin-loader.js` builds the `source: 'npm'` entries the door admits. It does two
separate jobs, and only the first touches the network:

- **`lattice packages fetch [dir] [--trust]`** finds the nearest `lattice-plugins.json` (the deck's
  folder, then each folder above it, stopping at a folder that holds `.git` and at the home folder),
  prints which file it uses, downloads each listed plugin's registry tarball, reads ONE
  file out of it (`bundle`, default `lattice-plugin.js`, below the tarball's top folder), and caches
  it at `$LATTICE_HOME/npm-plugins/<sha256>.js` only when `admitNpmBundle` accepts the bytes against
  the pinned hash. It then gates the plugin as a zip plugin is gated (`refusePackage`: shape, syntax,
  a reserved name, a shipped fence, a highlighted language) and asks for consent at its digest. The
  consent text names the list file, the package, the version, the bundle's pinned hash, and a registry
  that is not npm's, because the list is the root of trust: the pin protects an honest list from a
  swapped download, and does nothing against a hostile list. A plugin left unapproved makes `fetch`
  exit 1. Nothing is installed and nothing runs: no `npm`, no lifecycle script, no dependency (decision 8).
- **A render** reads the cache only, and reads the list only when the deck's front matter lists a
  plugin, so a list planted in a parent folder costs a deck without plugins nothing. A plugin the deck's front matter lists (`plugins: [name]`) and
  the list names becomes `{ source: 'npm', pin, code: bytes }`; one that is not fetched is named with
  the command that fetches it. An export never reaches a registry.

The list entry is `{ name, package, version, fence, sha256, bundle? }`, with an optional top-level
`registry` (`https:`, or `http:` on loopback). `version` must be exact; a range, a tag or `latest`
is refused, because G2 pins versions and the hash pins the bytes. The list is read only if it is a
regular file under 1 MB (a symlink to `/dev/zero` ran a render out of memory and one to a FIFO hung it),
with at most 64 entries.

The tar reader must read the file a reviewer reads with `tar`, or the review proves nothing. It takes
regular files, folders and pax headers, and refuses the whole tarball on any other entry type (a GNU
long name, a contiguous file, a link, a device). It parses pax records by their length and refuses two
`path` records, requires a strictly octal size, refuses `..`, and refuses a bundle path that appears
twice after `./` and `//` are normalized (tar keeps the last). It caps the download (8 MB), the unpacked
size (32 MB) and the bundle (4 MB). Redirects are followed by hand, at most five, and each must keep the
scheme and pass the registry rule; every download failure reads the same, so a list cannot use the
loader to learn which local ports answer.

Admission (`externalRefusal`) also refuses an HTML-like comment (`<!--`, or `-->` first on a line). The
worker runs a bundle as a classic script, which reads those as comments, and the check parses it as a
module, which does not, so a `<!--` line could hide an `importScripts` line from the check.

**At approval, as well as at render, an npm plugin is refused where the OS layer reads OFF or cannot be
determined** (decision 7). `--trust` does not override it. Refusing it at approval is the safe default
for the followup's question (3): an approval at OFF would approve something the door will never run.

**`unmeasured` on macOS and Windows stays admitted, for now.** `npmLayerRefusal` admits it because
those platforms have no `/proc` to probe and Chromium's sandbox is on there by default; on Linux,
`unmeasured` means the probe failed and it refuses. Decision 7 says a failed probe counts as OFF and
does not say whether "no probe exists" is a failed probe. That call is the owner's
(`followups.d/2749-p3-npm-plugin-unmeasured-layer.md`); the default keeps today's behavior, and
reversing it is one line in `npmLayerRefusal`.

**One approval per plugin name.** An approval is stored under `plugin/<name>` with one digest, so two
projects that pin different versions of one plugin replace each other's approval at each `fetch`. It
fails safe (the render refuses and names the command), and per-pin approvals are a change to the trust
file the code-package door also reads (`followups.d/2749-p3-npm-plugin-approval-per-pin.md`). `fetch`
refuses a name a shipped or installed plugin already uses, so the npm door never replaces their approval.

The adversarial trio reviewed the loader on 2026-10-19. The red team found no way to run code without
consent, past the pin, in Node or outside the cache folder. It did find the list crash, the forged
output lines, the redirect SSRF, the four tar differences and the HTML-comment parse gap above, all
fixed with tests. The inversion review added the consent text, the search boundary, the exit code
and the name refusal. The checker added the render's warning for a broken list and three tests that
mutation showed were missing.

Verified: the unit tests (`test/unit/cli/npm-plugin-loader.test.js`) cover every refusal against a local
registry, a real `npm pack` tarball is read byte-for-byte, and the G5 probe shows that fetching,
caching, gating and building the door entry never load the bundle in Node (its control imports the
same bytes and the marker appears). The integration arm (`npm-plugin-admission.test.js` LOADER) runs
the real `lattice packages fetch` against a local registry, then renders a deck that lists the plugin
through the real CLI, and checks that the render made no request. In this sandbox Chromium runs as
root, so the layer reads OFF and that arm takes its refusal branch; the approving branch was driven by
hand with a Chromium copy the `nobody` user can run (layer on): `fetch --trust` approved the plugin and
the rendered PDF holds its output. Not verified: a fetch from the real
`registry.npmjs.org` (the test registry is local), and the macOS and Windows layer readings.

## 6. Decisions

The owner answered on 2026-10-17. Rows 1 to 5 keep the original question numbers; row 6 is a new
question that came out of this review.

| # | Question | Decision |
|---|---|---|
| 1 | Add G1 to `build:check`? | **Yes, measure first.** Time the check, show the owner the number, and add it only if the cost is small. |
| 2, 5 | Add the canary harness, and make it plus G1 to G3 the exit criteria for phase G? | **Yes, required.** The npm door does not open while the harness is red. G1 is an exit criterion only if decision 1 adds it; if its measured cost is too high, the exit criteria are the harness, G2, G3 and G5. The harness is a test in the integration tier, not a new CI job. |
| 3, 4 | Where does an npm plugin's `bake` run, and does the Studio or desktop app load an npm plugin? | **Locked page only.** npm plugins render in the locked Chromium page, as the code door does. No `bake`, and no loading in the Studio or desktop app, in v1. **What a plugin may contribute is not settled by "render only".** Asked whether v1 npm plugins may contribute drawing code only, the owner answered (2026-10-17): plugins mostly render today, but more kinds are coming, including plugins that return data and render nothing, so "a plugin can render something, but it can also return data which can be used as data attributes added to either the context or the HTML, beyond their own rendered HTML fragments." Recorded as decision 10 below. The owner then said (2026-10-17): "plugins should never be allowed to send code." and, asked whether first-party plugins are exempt, answered that the planned model is the one for all plugins: a plugin renders in the sandbox and returns a fragment, and the host sanitizes it and shows it. So the rule has no first-party exception. Today it is not true of at least three built-in plugins, found by an independent check: mermaid (its `bake` JS loads into the command line's own Node process and starts Chromium from there, and its `hydrate` runs `mermaid.min.js` in the viewer's browser), function-plot (`hydrate` and a vendored `function-plot.js` payload that run in the browser), and math (no browser code, but `math.render.js` loads KaTeX into the engine's own Node process, so it does not render in the sandbox either). These are known exceptions to migrate, not a permitted pattern (`followups.d/2749-p3-migrate-in-tree-plugins-to-sandbox-model.md`). |
| 6 | Should a code package be refused outright where the OS layer reads OFF? | **Keep today's behavior, and investigate.** Today the consent text names the layer, the approval is pinned to it, and the owner or user may approve at OFF. Log an investigation into what refusing OFF would break (below). |

**Decision 6 in plain terms.** Lattice runs a code package in a browser with no network. Under that
browser it tries to use the operating system's own lock (Chromium's OS sandbox), and it says which
level it got: on, on by the platform's default, or OFF. OFF happens when the machine cannot start
that lock, for example Ubuntu 24.04 CI runners (AppArmor blocks it) or a Chromium kept under
`/root` that the `nobody` user cannot run. Today an OFF machine is told so in plain words and may
still run a package the user approved at OFF. A package approved at "on" is refused on a weaker
browser. The question is whether OFF should be refused outright. The owner chose to keep the
current behavior and to measure first. The investigation is `followups.d/2314-p4-code-packages.md`:
count how often the layer reads OFF in the places packages run (CI, containers, the Studio, the
future desktop app) and report what refusing OFF would break.

Three more decisions came out of the red team and inversion reviews. The owner answered them on
2026-10-17:

| # | Question | Decision |
|---|---|---|
| 7 | Do npm plugins inherit "may be approved at OFF"? | **No, refuse.** An npm plugin does not run when the OS layer reads OFF. A failed probe (the layer cannot be determined) counts as OFF, so it refuses too (owner, 2026-10-17). Code packages keep today's behavior (decision 6). |
| 8 | Must an npm plugin have zero runtime dependencies? | **Reframed by the owner:** plugins are not npm packages whose dependencies Lattice installs. A plugin is a self-contained bundle built with all its dependencies, and Lattice downloads it as it is. Lattice never runs `npm install` for a plugin. |
| 9 | Add G5, a check that Lattice never loads a plugin in Node? | **Yes.** The owner's reason: "we need to be safe." **G5 is also an exit criterion for phase G, like the harness (owner, 2026-10-17): the npm door does not open while the G5 test is red.** |
| 10 | May an npm plugin return data (instead of, or besides, an HTML fragment) that the host writes onto the page or into the shared context? | **Yes, with the host in control** (owner, 2026-10-17). A plugin hands data to the host. The host sanitizes it and the host, which is our engine, attaches it to the slide or the deck. The plugin never writes onto the page itself. The first data provider is the embedded meta plugin in PR #2762 (`@meta{…}`; its design note `2026-10-17-meta-record.md` is in that PR and not yet on `main`), which is first-party and built in. **Detect and disable:** the host catches any plugin that tries to inject a script or do something malicious, disables it, and alerts the user. The owner said "for now", so this is the first version, not the last word. Today's disabled-with-a-diagnostic path (`2026-09-27-plugin-system.md` §4.10) only disables a data-layer plugin whose name collides, at resolve time. Detecting an injected script at render time, and alerting the user, is new work. **CSS:** plugins may provide CSS in the future. All of it must go through `sanitizeStyleText` (HARD RULE #22) before it reaches a document. **Code:** plugins never send code (row 3, 4). Still open: the exact limits on what data may be attached (names, length, which elements). |

Decision 8 is a different model from the one this note started with, and it settles two of the
gaps in §3. Gap 3 (install scripts and transitive dependencies) is closed by design, because
nothing is installed. Gap 4 (version drift) shrinks to "which bundle and hash is pinned", which G2
covers. Implementing 7 to 9 is done: the door enforces them, and the loader that produces its entries is §5.5.

This note does not edit `2026-09-13` Axis 2 beyond a pointer. Decisions 3 and 4 mean that row's npm line ("code,
Node-side, resolved at build time") no longer describes the plan. Superseding it is `followups.d/2749-p1-supersede-plugin-architecture-axis2-npm-row.md`.

## 7. What is not verified

- The §4 grep covers the named identifiers in the named directories. It did not read the vendored
  Mermaid or KaTeX bundles, and it cannot see obfuscated access.
- The gate's run-time cost was measured on 2026-10-18: 33 ms (regex) or 436 ms (parsed prototype) against a 34.8 s `build:check`; the built gate takes about 0.3 s and finds one hit. G1 is now an exit criterion alongside the harness, G2, G3 and G5 (decision 1).
- The `postinstall` measurement used one tarball with no transitive dependencies. It shows the mechanism, not how a real plugin's dependency tree behaves.
- Whether the desktop app will keep the OpenRouter key in the OS keychain is undecided (§3.2).
- Gap 6 (the `@qr` Wi-Fi case) comes from another session's report, not from a reproduction here.
- The §3.1 measurements drove real exports of a two-slide deck with no plugin `hydrate` in it, on
  Linux, in headless browsers. Each attempt ran through `page.evaluate`, which stands in for plugin
  code. The `--player` rows were run in Chromium, WebKit and Firefox; the plain-export rows and the
  WebRTC row were run in Chromium only. `<a ping>` and `<link rel=prefetch>` on `--player` were
  not repeated on real exports. Nothing ran an actual plugin's `hydrate`, and
  nothing ran Safari, Chrome or Firefox on a user's machine. The probe scripts live in the session
  scratchpad, not in the repo. If the harness in §5.2 is built, they become its export check.
- Two review findings were read and not run: that the sanitizer's `FORBID_TAGS`
  (`lib/core/sanitize-slide-html.mjs:40`) strips `meta`, `link`, `style`, `form`, `iframe`, `base`
  and `input` from plugin markup, and that the Studio's code-package frame runs `allow-scripts`
  without `allow-same-origin`, so it cannot reach `lattice-db-or-key` (`runner.ts`).
- That a plugin could stay dormant under the harness is reasoned, not run.
- Which exports run plugin code comes from the shipped files (a real `--player` export has no
  `hydrate`; the plain export does) and from `player-core.mjs`, not from a run of an npm plugin,
  because none exists yet.
