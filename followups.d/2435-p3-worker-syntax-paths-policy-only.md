---
origin: 2435
priority: P3
recorded: 2026-10-06
---

# A code package's `import()` and string-built code rest on the frame's policy alone

```text
why now   — found by the red team on the worker's second wall (p8). The wall removes names from the worker's global, and `import()` is syntax, not a name, so no property wall can take it away. Measured with the throwaway policy probe: behind the wall alone (no policy), `import("<log>")` reached the loopback server on Chromium, Gecko and WebKit; `eval` and `Function` did not, only because the code they build has no `fetch` left to call. Under the frame's policy all three reach nothing on Chromium, Gecko and WebKit (contract note §10). So `import()` is one engine policy bug away from a request, the shape of the Gecko `EventSource` gap the wall was built for.
where     — lib/packages/code-shape.mjs refuseCode / workerScript; lib/packages/gate.js; contract note §10.
done when — either a package whose source holds a dynamic `import(` (parsed, not grepped: acorn is already a dependency) is refused at add, at render and at the Studio import, with `eval`, `Function` and string timers removed in the worker so built code cannot bring it back, and all 29 conformance packages still pass; or the note records why the policy alone is enough for this path.
evidence  — the probe's "wall alone" row showing dynimport=0 on all three engines, and code-package-parity.test.js green.
verify    — tier 2 (adversarial trio): it changes a security wall.
```
