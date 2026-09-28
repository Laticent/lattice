---
origin: 2435
priority: P2
recorded: 2026-09-28
---

# A code package's worker still has `FontFace`, a network path only the policy closes

```text
why now   — found by the fact-checker on the public code-package guide (p7). `workerScript` removes 13 network globals (WORKER_NETWORK), but `FontFace` and `self.fonts` stay (`typeof FontFace === "function"` in a Chromium 131 worker probe), and `new FontFace(name, 'url(https://…)').load()` is a fetch. Only the frame's content-security policy (`font-src data:`) stops it. The second wall exists because Gecko did not apply the inherited policy to `EventSource` from a worker (contract note §10); nobody has checked whether it applies it to `FontFace`.
where     — lib/packages/code-shape.mjs WORKER_NETWORK and workerScript; the door tests (test/integration/export/code-package-door.test.js, docs/e2e/code-packages.spec.ts, whose hostile package would gain a FontFace arm); contract note §10.
done when — a hostile package's `new FontFace('x', 'url(<log server>)').load()` and `self.fonts.add(…)` are tried on Chromium, Gecko and WebKit, and either reach nothing because FontFace is removed like the other 13 (then `kit.measure` still works: it uses OffscreenCanvas with installed fonts), or the measurement shows the policy holds on all three and the note says why FontFace stays; the public guide's list of removed globals (docs/src/content/docs/guides/code-packages.md "Where the code runs") matches.
evidence  — the door test and the Studio nightly spec with the FontFace arm, on all three engines, with the log server's request count.
verify    — tier 2 (adversarial trio): it changes a security wall that the trio reviewed.
```
