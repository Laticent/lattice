---
status: shipped
summary: >
  The Studio's diagram preview, measured on the same machine and bench for the build of 2026-10-08
  (6c85a7f, before the sandbox draw frame) and for #2822 with the frame on and off. Nothing visible
  regressed: 0 source and 0 blank frames on every edit arm, in all three builds. What is slower: an edit
  to a diagram takes 231 ms to repaint against 211 ms (+20 ms), and a reload shows the slide 120 ms
  later. What is faster: the first diagram in a session (275 ms; the in-page library is 683 ms since the
  plugin host fetches it). Records the biggest costs, what was tried, and three questions to explore.
---

# The preview, 8 October against today (2026-10-22)

**Why this note exists.** The owner asked for real numbers from two weeks ago, not inferred ones, after
#2822 moved Mermaid's drawing into a sandboxed frame. "Things seem to be working, just not as well."
This is the record, so the next change can be judged against it.

## Method

`docs/scripts/diagram-flash-bench.mjs` on the built Studio, one machine, one afternoon, 5 runs per arm,
Chromium. Three builds, back to back:

- **Oct 8** — `6c85a7f` (`origin/main` on 2026-10-08), built in its own worktree with `npm ci`.
- **Frame** — #2822 at `de6d511`, as shipped.
- **In page** — the same build with the host's name defined as `{ kinds: [] }` before the page's code runs,
  so the runtime draws in the page as it did before the frame. This isolates the frame from everything
  else that changed in two weeks.

Run-to-run noise on this machine is about ±15 ms; read the frame counts first.

## The numbers

| Arm | Oct 8 | In page today | Frame today |
|---|---|---|---|
| `edit`, warm: blank / source frames | 0 / 0 | 0 / 0 | 0 / 0 |
| `edit`, warm: diagram repaints in | 211 ms | 213 ms | 231 ms |
| `edit`, cold: diagram repaints in | 229 ms | 244 ms | 242 ms |
| `edit-burst` (8 keys at 120 ms), warm | 1201 ms | 1197 ms | 1238 ms |
| `nav`, first diagram: source / blank frames | 10 / 10 | 10 / 10 | 11 / 14 |
| `nav`, first diagram: time to diagram | 275 ms | 683 ms | 275 ms |
| `nav`, revisit (cached) | 8 ms | 7 ms | 8 ms |
| `mount`: reload to `.lattice` in the DOM | 820 ms | 995 ms | 940 ms |
| `mount`: reload to preview revealed | 1292 ms | 1109 ms | 1106 ms |
| wrong ink, layout shift, every arm | 0 | 0 | 0 |

A keystroke inside a diagram label measured about 300 ms in page and 350 ms through the frame earlier in
#2822 (flat in the number of diagrams).

## The Playground column (2026-10-23)

`diagram-flash-bench.mjs --surface playground`, the same machine and build as the Studio rows, 5 runs per arm, Chromium,
frame on. The Playground shows the whole deck in one scrolling frame, so its edit arms use a one-diagram deck (with two
diagrams, the sampler's "first SVG" flips to the other diagram while the edited one redraws and scored 13 wrong frames that
were not wrong). The rail arms (`nav`, `type`) are the Studio's.

| Arm | Studio | Playground, as found | Playground, fixed |
|---|---|---|---|
| `edit`, warm: source / blank frames | 0 / 0 | 0 / **11** | 0 / 0 |
| `edit`, warm: held frames | 13 | **0** | 11 |
| `edit`, warm: diagram repaints in | 211 ms | 215 ms | 201 ms |
| `edit-burst`, warm: blank / held frames | 0 / 71 | **59** / 0 | 0 / 64 |
| `edit-burst`, warm: diagram repaints in | 1180 ms | 1095 ms | 1091 ms |
| `mount`: reload to `.lattice` in the DOM | 977 ms | 1004 ms | |
| `mount`: reload to preview revealed | 1087 ms | 1105 ms | |
| Mermaid fetched into the page, any run | 0 of 5 | 0 of 5 | |
| wrong ink, layout shift | 0 | 0 | 0 |

**One gap, found and fixed.** The Playground did not hold the previous diagram on an edit: the slot was empty for about 11
frames per keystroke and for 59 of the burst's frames. Cause, traced with the runtime's own guards logged: the host stamps
the swap `in-place` and the runtime moves the old SVG into the new slot, but only when the old and new sections have the
same diagram scope key, and that key reads the section's class list. The Playground marks the slide in focus with
`db-active` (`reading-page.ts`), and the replacement section did not carry it, so the keys differed and the hold was
refused. `patchSections` (`docs/src/playground/deck-render.js`) now copies `db-active` onto the replacement. The alternative,
adding `db-active` to `RUNTIME_MARKER_CLASSES` in `lib/core/diagram-scope.js`, would fix every host but changes the bytes of
`lattice-runtime-min.js`, which exports embed, so it needs the owner's export sign-off; it is the more general fix and is
worth considering. `playground-draw-frame.spec.ts` (Chromium, Firefox, WebKit) pins the matching rows and the hold.

## What the numbers say

1. **The tag-at-once and hold-the-last rules survived the frame.** Zero source frames and zero blank
   frames on every edit arm. Getting there needed one fix in #2822: the frame answers the library
   request at once, and the pass that tags the fence never ran again (100 source frames before the fix).
2. **The frame costs a constant, about 20 ms per repaint and about 50 ms per label keystroke.** Round
   trip and message copy 15–20 ms, sanitizing the drawing 8–10 ms, Mermaid built as ES modules 5–11 ms.
   Running the frame in its own process gave no speedup (299 ms against 305 ms same-process).
3. **The largest share of an edit is not the draw.** The editor-to-preview pipeline takes about 200 ms in
   every build, and the 150 ms render debounce overlaps it. Mermaid's render is about 30 ms.
4. **The first diagram got faster through the frame**, because the in-page library is fetched on first
   use and the frame is warmed.
5. **Reload shows the slide 120 ms later than on Oct 8** in both modes (820 against 940–995 ms). That is
   not the frame; it is something else that landed in the two weeks, and nobody has bisected it.

## Open questions (each has a `followups.d/` file)

- **Can Fuoco's focus hub own preview state?** The Playground now has one hub for caret, scroll and slide
  (`2026-10-21-playground-focus-sync.md`). The Studio has its own. Which pane renders what, and when, is
  decided in several places. A single owner of "what is on screen and what is stale" could split work
  across threads (the frame, workers) and drop the debounce chain.
- **Does the Playground do what the Studio does?** It installs the same host (`load-engine.ts`) and warms
  it (`render-engine.ts`), and the runtime fix is shared. No bench or e2e drives the Playground's draw
  frame. UNVERIFIED.
- **Should the deck-wide diagram check run at chat send instead of 3 s after typing stops?** Raised by the
  owner on 2026-10-22; deferred.
