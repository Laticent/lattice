---
origin: 2336
priority: P3
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2336
---

# Portable packages: what the adversarial trio found and PR #2336 did not fix

Spec: `engineering/decisions/2026-09-23-portable-packages.md` (§10 lists what WAS fixed).

```text
why now   — found by the red team, inversion and checker on #2336; each is pre-existing,
            off that PR's path, or a design call, so it was recorded rather than folded in.
where     — see each item.
done when — each item is fixed or explicitly declined in the decision note.
evidence  — a failing test before the fix, per item.
verify    — unit + the package e2e specs.
```

1. **A name is not an identity over time.** Every shipped name a release adds silently
   changes how existing user work renders: a saved theme that later becomes a shipped name
   is hidden from the menus, and the CLI prefers the shipped theme over an installed one
   without a word (`lattice-emulator.js` palette lookup, `lib/packages/render.js`). At least
   warn when a shipped name hides an installed or saved one; longer term, consider a user
   namespace. Owner decision.
2. **A component's sample slide (`gallery.md` / skeleton) is not gated on import.** A remote
   `<img>`, markdown image or inline `style="…url()"` in it becomes the user's own deck
   content on Insert. `findSkeletonHtml` refuses ANY tag, which shipped galleries use, so
   it cannot simply be switched on; a narrower rule (remote URLs only) is needed. Red team,
   plausible, not run.
3. **Motion art keeps remote references** (`<image href>`, `<feImage href>`,
   `style="fill:url(https://…)"`) through `sanitizeSceneAssets`, and the Library renders it
   with `dangerouslySetInnerHTML` on the main origin. Pre-existing; #2336 closed the new
   `.lattice` route to it but not the Library zip route.
4. **A zip that understates its entry sizes still inflates fully** — in the CLI as in the
   Studio (`zip-limits.ts` documents the residual). A streaming inflate with a running cap
   would close it.
5. **`rgb(from …)` is the repo's first relative-color syntax** (the finish BOTTOM-LAYER
   RULE). It needs Chrome 119+ / Safari 18+; on an older engine (an old WebKitGTK behind
   the desktop wrapper) the export-face variable fails and prints no wash at all — no worse
   than before #2336, but nobody has decided that browser floor.
6. **`lattice packages` spawns `process.execPath`**, which assumes the CLI runs under Node.
   A single-executable or embedded build needs another dispatch.
7. **Studio theme exports carry `type`/`format`**, which `themes/theme.schema.json` does not
   accept yet; phase 5 (themes into folders) must accept or strip them.
8. **A Studio Markdown export with a saved theme embeds that theme's CSS, but the CLI still
   fails with `palette not found`** and now suggests installing a zip the recipient may not
   have. Pre-existing; the CLI could register an embedded theme block.
9. **The escaped selector form (`.\6b pi`) is not renamed by `renameComponentSelectors`.**
   Low impact while the component gate does not refuse selectors outside the component's
   own class anyway.
10. **Studio e2e specs that fail on `main` itself** (found by a full local run for #2336; each
    reproduced against `main` at the merge base, so none is that PR's): `split.spec.ts:206`,
    `studio-reserved-slots.spec.ts:122` and `:144`, and the `minfont` project's
    `studio-shell-parity.spec.ts:160` at 1280px/Craft ("Previous slide" 21px off). The three in
    #2035 fail too. `studio-instant-shell.spec.ts:539` is flaky on both (1 of 2 on `main`, 1 of
    4 on the branch: "shell 0 vs app 16"). WebKit and Gecko projects were not run: this sandbox
    has Chromium only.
