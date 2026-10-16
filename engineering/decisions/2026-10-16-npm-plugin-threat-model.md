---
status: proposed
summary: >
  The plan for npm plugins (phase G) rests on one sentence, "installing it is the trust decision",
  and that sentence does not cover plugin output that reaches other people, the Studio and desktop
  app where the AI key lives, transitive dependencies, or a bake that runs with full Node
  privileges. This note records those gaps and proposes a gate (catches mistakes and drift) plus
  an adversarial harness (contains a hostile plugin) that must both pass before the npm door opens.
---

# npm plugins: the threat model the plan does not have yet (2026-10-16)

Status: proposed. Nothing here is built. The owner's decisions are in §6.

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
  (`lib/core/code-sandbox.js`); the npm door has no test that aims them at a plugin.

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
   **Measured 2026-10-16** (Chromium 131 headless, that policy replayed around a script allowed by
   its own hash, a local listener, and a no-CSP control that reached the listener on every probe
   but one):

   | Exit the script tries | Reached the listener |
   |---|---|
   | `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon` | no |
   | `new Image().src`, CSS `url()`, `<iframe>`, form post, `<a ping>`, `<link rel=prefetch>` | no |
   | **`location.href = 'http://…?x=…'`** | **yes** |
   | **`window.open('http://…')`** | **yes** |

   So the export's policy closes every request a script can send, and leaves **navigation** open.
   A hostile `hydrate` can send the page's text (including the speaker notes and glossary in the
   envelope) to a server by redirecting the page. It cannot do it silently, since the page
   visibly leaves. A real browser also blocks a popup without a user gesture, which this headless
   run does not model.
2. **The Studio and the desktop app are not `npm i` projects.** The Studio keeps the user's
   OpenRouter key in same-origin `localStorage` (`lattice-db-or-key`, read in four places on
   2026-10-16). The planned Tauri app will hold it in the OS keychain. A plugin with full Node
   privileges inside that app's process, or any plugin script in the Studio page, sits next to the
   key and defeats the keychain. The plan says npm plugins resolve "at build time" and does not say
   whether the Studio or the desktop app ever loads one.
3. **Transitive dependencies.** An explicit plugin list pins which package Lattice loads. It does
   not pin what that package pulls in. npm runs a dependency's lifecycle scripts (`postinstall`) at
   install, before Lattice sees anything. (Standard npm behavior; not tested here.)
4. **Version drift.** Phase G turns version ranges on. A routine update then changes the code that
   renders every deck on the machine. The export record tells you afterward which hash ran; it does
   not stop the change.
5. **`bake` is the one surface no sandbox holds.** `code-sandbox.js` records why: Node's
   permission model did not block the network when measured, so code packages run in a locked
   Chromium page instead. `bake` runs in the CLI's own process.

## 4. The principle that makes this tractable

A plugin is smart about what it controls and dumb about what is around it. It takes data in and
returns markup out. It never calls AI, never reads storage, never reaches the network. Authors
write plugins through the coach, and the plugin renders what the author typed or accepted.

**Checked 2026-10-16: it holds for in-tree code.** A grep for `fetch`, `XMLHttpRequest`,
`WebSocket`, `sendBeacon`, `localStorage`, `sessionStorage`, `indexedDB` and `openrouter` across
`lib/plugins`, `lib/components` and `lib/runtime` (vendored libraries and generated files
excluded) found one hit: `lib/runtime/index.js:618`, which fetches the deck's own markdown. AI
calls live in the Studio's coach side (`architect-model.js`, `chat-agent.ts`, `voice-model.js`)
and two library pages (`suono`, `cadenza`). **No gate enforces it.**

For npm, the principle becomes the admission contract: a plugin that needs the network or the key
is refused, not sandboxed.

## 5. Proposal

### 5.1 The gate (static)

| Check | Catches | Honest limit |
|---|---|---|
| **G1. Purity scan** of plugin and component code: no network, storage, or key-name identifiers; an allowlist entry needs a justification and fails when stale | An in-tree contributor adding `fetch` by accident | Obfuscation passes. For npm it is a tripwire, not a defense |
| **G2. npm admission**: explicit list, exact versions, package integrity hash, plugin packages installed with `--ignore-scripts` | A typosquat, a silent update, an install-time script | Does not read the code. A reviewed version can still be hostile |
| **G3. Declared equals contained**: the manifest names every contribution (`hydrate`, `bake`, `payload`) and the build fails both ways (already true in-tree, `spec/LPM.md` §3.3) | A plugin carrying a surface it did not declare | A declared surface can still misbehave |
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
   proves nothing (HARD RULE #19's arm-that-can-fail, applied here), so the canary must be shown
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

- A Chromium renderer exploit. The CLI launches Chromium with `--no-sandbox`
  (`code-sandbox.js`, "NOT CLAIMED HERE"). That header points at
  `followups.d/2314-p4-code-packages.md`, which does not exist in `followups.d/` today, so the
  question has no live record. Recreating it is part of this note's follow-up.
- Anything the plugin does through legitimate output: a misleading chart is still a chart.
- A hostile `bake`, until §6 decision 3 settles where a bake runs.

## 6. Decisions for the owner

1. **Add G1 to `build:check`?** Recommend yes. It makes the principle in §4 enforced instead of
   hoped for. It changes the CI contract, so it needs your OK; I would measure its cost first.
2. **Add the canary harness to the integration tier?** Recommend yes. This is a test, not a CI
   job, so it adds no step to the pipeline.
3. **Where does an npm plugin's `bake` run?** (a) Not at all in v1: npm plugins render in the
   locked page, as the code door does. Recommended. (b) In the locked Chromium page. (c) In the CLI
   process, behind an explicit per-plugin consent and an OS sandbox.
4. **Does the Studio or the desktop app ever load an npm plugin?** Recommend no for v1. Those
   surfaces hold the key, and the Hollywood principle says plugins never need it.
5. **Make the harness and G1 to G3 the exit criteria for phase G.** The door does not open while
   any is red.

This note does not edit `2026-09-13` Axis 2. If you accept decisions 3 and 4, that row gets
superseded in a follow-up.

## 7. What is not verified

- The §4 grep covers the named identifiers in the named directories. It did not read the vendored
  Mermaid or KaTeX bundles, and it cannot see obfuscated access.
- The gate's run-time cost is unmeasured.
- The `--ignore-scripts` and lifecycle-script claims are standard npm behavior, not exercised here.
- The §3.1 measurement replays the policy string from `lib/export/player-core.mjs:3346` in a
  `data:` page. It did not drive a real exported file, and it ran headless Chromium 131 only. The
  probe script lives in the session scratchpad, not in the repo. If the harness in §5.2 is built,
  this probe becomes its export check.
