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
   is hidden from the menus, and the CLI prefers the shipped theme over an installed one.
   **The CLI half now warns** (PR for the portable-packages continuation): a render that
   resolves a shipped theme, or uses a shipped component, that an installed package also
   names says so on stderr with the re-add fix, and `packages list` marks the installed row
   "hidden by the shipped … of this name". **Still open, and the owner's call:** the Studio
   half (the Library still lists a hidden saved theme, but the menus drop it without a word)
   and a user namespace as the long-term fix.

Items 2 (gallery gating), 3 (motion art's remote references), 4 (the streaming inflate), 9
(escaped selectors), 12 (the workspace restore), 13 (the resolver rule's test) and 14 (relative
scripts) are fixed, and item 6 is declined; the decision note's §10 says how and why. The
numbers are kept so a reference to item 5 still means item 5.

5. **`rgb(from …)` is the repo's first relative-color syntax** (the finish BOTTOM-LAYER
   RULE). It needs Chrome 119+ / Safari 18+; on an older engine (an old WebKitGTK behind
   the desktop wrapper) the export-face variable fails and prints no wash at all — no worse
   than before #2336, but nobody has decided that browser floor.
7. **Studio theme exports carry `type`/`format`**, which `themes/theme.schema.json` does not
   accept yet; phase 5 (themes into folders) must accept or strip them.
8. **A Studio Markdown export with a saved theme embeds that theme's CSS, but the CLI still
   fails with `palette not found`** and now suggests installing a zip the recipient may not
   have. Pre-existing; the CLI could register an embedded theme block.
10. **Studio e2e specs that fail on `main` itself.** Re-run 2026-09-24 on a current build: the
    four below that were re-run still failed. `studio-reserved-slots.spec.ts:122` and `:144`
    are now FIXED (they read
    page-wide locators while the pre-paint shell was still mounted, so each found two
    elements; they now wait for the shell to go, as the first test in the file does). The
    others stay open (`split.spec.ts:206` still fails its collapsed-preview assertion, and
    the `minfont` parity arm is still 21px off). Originally (found by a full local run for #2336; each
    reproduced against `main` at the merge base, so none is that PR's): `split.spec.ts:206`,
    `studio-reserved-slots.spec.ts:122` and `:144`, and the `minfont` project's
    `studio-shell-parity.spec.ts:160` at 1280px/Craft ("Previous slide" 21px off). The three in
    #2035 fail too. `studio-instant-shell.spec.ts:539` is flaky on both (1 of 2 on `main`, 1 of
    4 on the branch: "shell 0 vs app 16"). WebKit and Gecko projects were not run: this sandbox
    has Chromium only.
11. **A DECK may still load remote images, and that is the root of items 2 and 3.**
    `sanitizeSlideHtml` keeps remote images on purpose, because a deck's own images are
    legitimately remote, so a deck someone sends you beacons in the preview and in every
    export. The package gates close the doors where markup rides in under a trusted name;
    they do not close this one. The fix belongs at the render boundary: an `img-src 'self'
    data: blob:` policy on the preview frames with a visible "this deck loads N remote images —
    load them?" switch, and an export option that inlines or strips them. A product call
    (it changes what a pasted deck shows by default), so it is the owner's. Found by the
    inversion lens on the continuation PR.
15. **A workspace backup's outer archive has no size cap.** `restoreWorkspace` reads
    `manifest.json`, `workspace.json`, `library-unreadable-scenes.json` and `refdocs.json` with
    a plain `async('string')`, and inflates `library.zip` in full with `async('blob')` before
    `unpackBundle` applies its limits. A backup whose `workspace.json` is a deflate bomb takes
    the tab down. Item 12 gated the items; this is the size half of the same door. The fix is
    not simply `readBudget` at the `.lattice` cap: a real backup carries reference docs (up to
    5 MB each) and can legitimately exceed 64 MB, so the cap needs its own number, measured on
    a large real workspace. Found by the checker on the continuation PR (2026-09-25).
16. **The unreadable-scenes lane keeps the backup's own record `id`.** `scene-library.ts`
    `putUnreadableScene` saves `{ ...rec, kind: 'scene' }`, so a hostile row carrying the `id`
    of one of your saved themes overwrites that theme with a scene record, and scenes keep no
    version history. No ungated CSS lands (the kind is forced), so this is data loss, not a
    gate bypass. Pre-existing; the fix is to key an unreadable scene by its name, as a
    readable one is. Found by the checker on the continuation PR (2026-09-25).
