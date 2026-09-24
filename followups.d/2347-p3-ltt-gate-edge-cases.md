---
origin: 2347
priority: P3
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2347
---

# Harden the LTT/Cadenza import gate and the LTT validator against the last checker's edge cases

why now   — every later LTT step (the HTML player, video export, Vetrina actions) runs through
            these gates and this validator; each item is cheap now and costs a debugging session
            later. None blocked #2347: the fourth checker confirmed each and judged none a
            regression.
where     — tools/check-ownership.js `unreadableModuleCalls` and `stripJsComments`;
            docs/src/lib/ltt/track.ts `validateTrack`; docs/src/lib/ltt/validate.ts `validateLtt`;
            tools/build-ltt-schema.js `docOf`. The seven findings:
            (a) the gate cannot see a non-literal `require` behind a property
                (`module.require(x)`, `globalThis.require(x)`), `eval` or `new Function` —
                `lib/integrations/markdown-it/plugins.js:757` shows the pattern is real;
            (b) it over-reports uses that load nothing: `typeof require`, `type R = typeof require`,
                `require.resolve('a')`, `require.main`;
            (c) `import fs = require(x)` with a non-literal argument is missed (an
                ExternalModuleReference, not a CallExpression; TS may reject it — confirm);
            (d) `validateTrack` throws `Invalid array length` on a Proxy whose `length` is
                ≥ 2^32 (it has no try/catch; `validateLtt`'s guard catches the same input);
            (e) when `validateLtt`'s guard catches a throw, it drops the reports collected before it;
            (f) `docOf` silently drops a doc comment alone inside an empty `{ }` (predates #2347);
            (g) `stripJsComments` can erase code when a string literal holds `/*` before a later
                `*/`, which blinds the static-import regexes (predates #2347; not reproduced).
done when — each item is fixed with a test that fails before the fix, or recorded in
            engineering/ltt.md / the gate's header as deliberately out of scope, with the reason.
evidence  — the per-item tests; `npm run build:check` and the live Cadenza/LTT trees still clean.
verify    — tier 1 checker, because it edits shared gates that every future PR runs.
