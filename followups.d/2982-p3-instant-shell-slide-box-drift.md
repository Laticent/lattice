---
origin: 2982
priority: P3
recorded: 2026-10-30
area: website
severity: low
swimlane: engineering/jank.md
deferred: off-path — fails identically on #2982's merge base 692ec28; this PR's skeleton change does not move it
source: https://github.com/Laticent/lattice/pull/2982
---

# The Studio's pre-paint shell draws the slide box 3–4px narrower than the app at two write-stop cases

```text
  P3 · [no ticket] studio-instant-shell.spec.ts:252 fails 2 cases on the desktop project.
       why now   — the slide visibly widens by 3–4px when React takes over: hand-off jank
                   the spec exists to catch, and it runs nightly, so it is red there.
       where     — docs/e2e/studio-instant-shell.spec.ts:252, cases "1440x900 @ write (editor
                   collapsed to its 46px rail)" (shell 1207 vs app 1211) and "390x844 @ write
                   (rotated while the engine was still loading)" (shell 301 vs app 304); the
                   tolerance is 2px. The preview footer band itself matches.
       done when — both cases pass on desktop, with the shell's slide-box constants derived
                   from the same numbers the app lays out with.
       evidence  — #2982's session ran both with the merge base's StudioShell, NewSlideButton,
                   StudioChromeSkeleton, studio.astro, MapRail and StudioMap in place: same
                   numbers, same failure (2 of 2), so this predates #2982.
       verify    — cd docs && npx playwright test e2e/studio-instant-shell.spec.ts
                   --grep "46px rail|rotated while the engine" --project=desktop --retries=0
```
