---
status: in-progress
summary: >
  The plan for npm plugins (phase G) rests on one sentence, "installing it is the trust decision",
  and that sentence does not cover plugin output that reaches other people, the Studio and desktop
  app where the AI key lives, transitive dependencies, or a bake that runs with full Node
  privileges. This note records those gaps and proposes a gate (catches mistakes and drift) plus
  an adversarial harness (contains a hostile plugin) that must both pass before the npm door opens.
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
  It is what contains a hostile plugin. The repo already has the walls for it
  (`lib/core/code-sandbox.js`), and `test/integration/export/plugin-fence-door.test.js` already runs a
  stranger's zip plugin through the locked page with a network log that must read 0 (fetch,
  WebSocket, `sendBeacon`). The npm door has no equivalent test; the harness builds on that one.

The boundary does the protecting. The gate only keeps honest contributors honest.

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

1. **Plugin output travels.** A `hydrate` or `payload` runs in the browser of whoever opens the
   deck or its HTML export. That person never ran `npm i`. The export pins its one script by
   SHA-256 and the hash is computed from the assembled bytes (`2026-09-27` §4.8,
   `lib/export/player-core.mjs:3344`), so the hash certifies the plugin's code rather than
   constrains it. What constrains the page is the rest of the policy:
   `default-src 'none'; … img-src data:; font-src data:; base-uri 'none'; form-action 'none'`.
   **Measured 2026-10-16 on a real export** (`lattice deck.md deck.html --player`, opened from
   `file://`, in Chromium, WebKit and Firefox through Playwright). Each attempt ran inside the page,
   so the CSP shipped in the file decided. The file's policy matched the one in
   `player-core.mjs:3346` exactly, apart from the hash. A copy with the CSP `<meta>` removed was the
   control, and it reached a local listener on every attempt in every engine, so no cell below is
   empty by accident:

   | Exit the script tries | Reached the listener (all three engines) |
   |---|---|
   | `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon` | no |
   | `new Image().src`, CSS `url()`, `<iframe>`, form post | no |
   | **`location.href = 'http://…?x=…'`** | **yes** |
   | **`window.open('http://…')`** | **yes** |

   An earlier replay of the same policy in Chromium alone also saw no request from `<a ping>` or
   `<link rel=prefetch>` (their controls fired); the real-export run did not repeat those two.

   So the export's policy closes every request a script can send, and leaves **navigation** open.
   A hostile `hydrate` can send the page's text (including the speaker notes and glossary in the
   envelope) to a server by redirecting the page. It cannot do it silently, since the page
   visibly leaves. A real browser also blocks a popup without a user gesture, which these headless
   runs do not model, so `window.open` is the weaker of the two exits.
2. **The Studio and the desktop app are not `npm i` projects.** The Studio keeps the user's
   OpenRouter key in same-origin `localStorage` (`lattice-db-or-key`, read in four places on
   2026-10-16). The Tauri exploration note (`2026-05-10-tauri-exploration.md`) mentions the system keychain
   for credentials; whether the desktop app will hold this key there is not decided. If it does, a
   plugin with full Node privileges inside that app's process defeats the keychain. Any plugin
   script in the Studio page sits next to the key today. The plan says npm plugins resolve "at build time" and does not say
   whether the Studio or the desktop app ever loads one.
3. **Transitive dependencies.** An explicit plugin list pins which package Lattice loads. It does
   not pin what that package pulls in. npm runs a dependency's lifecycle scripts (`postinstall`) at
   install, before Lattice sees anything. (Measured 2026-10-16 with a throwaway tarball: a default `npm i` ran its `postinstall`; `--ignore-scripts` did not.)
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
| **G2. npm admission**: explicit list, exact versions, package integrity hash, plugin packages installed with `--ignore-scripts` | A typosquat, a silent update, an install-time script | Does not read the code. A reviewed version can still be hostile |
| **G3. Declared equals contained**: the manifest names every contribution (`hydrate`, `bake`, `payload`) and the build fails both ways (already enforced in-tree by `lib/plugins/resolve.js`: a bake declared with no file, and a file
shipped but not declared) | A plugin carrying a surface it did not declare | A declared surface can still misbehave |
| **G4. Export record** (already planned, §4.10): name plus SHA-256 per non-shipped plugin | Nothing at run time; it makes an incident traceable | After the fact |

### 5.2 The harness (dynamic)

Run the plugin's `render`, `hydrate` and `payload` in the existing locked page with a local
listener on HTTP, WebSocket and UDP, the way `code-sandbox-network.test.js` already measures the
code door. Three parts:

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
3. **An export check**: render a deck that uses the plugin to HTML and confirm the exported file
   makes no request when opened offline (`lib/core/offline-chromium.js` already supplies the
   dead-proxy arguments). The check must include navigation and `window.open`, the two exits the
   export's CSP leaves open (§3.1). Closing them needs a design choice, not a header: a policy
   cannot forbid navigation, so the options are a script that freezes `location` before plugin
   code runs, or accepting it as visible and documenting it.

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
- A hostile `bake`, until §6 decision 3 settles where a bake runs.

## 6. Decisions

The owner answered on 2026-10-17. Rows 1 to 5 keep the original question numbers; row 6 is a new
question that came out of this review.

| # | Question | Decision |
|---|---|---|
| 1 | Add G1 to `build:check`? | **Yes, measure first.** Time the check, show the owner the number, and add it only if the cost is small. |
| 2, 5 | Add the canary harness, and make it plus G1 to G3 the exit criteria for phase G? | **Yes, required.** The npm door does not open while the harness is red. The harness is a test in the integration tier, not a new CI job. |
| 3, 4 | Where does an npm plugin's `bake` run, and does the Studio or desktop app load an npm plugin? | **Locked page only.** npm plugins render in the locked Chromium page, as the code door does. No `bake`, and no loading in the Studio or desktop app, in v1. |
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

This note does not edit `2026-09-13` Axis 2. Decisions 3 and 4 mean that row's npm line ("code,
Node-side, resolved at build time") no longer describes the plan. Superseding it is a follow-up.

## 7. What is not verified

- The §4 grep covers the named identifiers in the named directories. It did not read the vendored
  Mermaid or KaTeX bundles, and it cannot see obfuscated access.
- The gate's run-time cost is unmeasured.
- The `postinstall` measurement used one tarball with no transitive dependencies. It shows the mechanism, not how a real plugin's dependency tree behaves.
- Whether the desktop app will keep the OpenRouter key in the OS keychain is undecided (§3.2).
- Gap 6 (the `@qr` Wi-Fi case) comes from another session's report, not from a reproduction here.
- The §3.1 measurement drove one real export of a two-slide deck with no plugin hydrate in it,
  in headless Chromium, WebKit and Firefox on Linux. It ran each attempt through `page.evaluate`,
  which stands in for plugin code allowed by the hash. It did not run an actual plugin's hydrate,
  and it did not run Safari, Chrome or Firefox on a user's machine. The probe script lives in the
  session scratchpad, not in the repo. If the harness in §5.2 is built, this probe becomes its
  export check.
