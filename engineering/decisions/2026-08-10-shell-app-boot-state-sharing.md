---
status: shipped
summary: The Studio's pre-paint shell and the hydrated app already share boot state through localStorage read by an inline head script, with the storage FORMAT declared once in dependency-free modules both sides import - so the splitter jank reported as "the shell doesn't know where the divider was" was never a sharing gap. Measured on the built site at 1440x900 with the split dragged to editor 25%, the shell had it right from t=320ms; the APP mounted at its hardcoded 46/54 default at t=1467ms and only applied the saved layout at t=3317ms, ~400ms after the shell was dismissed - a 302px jump in plain view. The asymmetry is TIMING, not channel - the shell reads before paint, the app read two animation frames after mount, and those frames queue behind the ~505KB engine fetch. Cookies were considered and rejected - the docs site builds static (no adapter, no per-request render), so a cookie cannot reach a server that does not run, and client-side it is strictly worse than localStorage. Fix - the saved layout is read during the first render and handed to react-resizable-panels as its defaultLayout, with a self-verifying backstop for config changes. Remaining known gaps recorded, chief among them the docked side panels the shell does not model.
---

# What the Studio's shell and app share, and why the splitter still jumped

**Date:** 2026-08-10 · **Status:** shipped

## The report

> The shell placeholder in the Studio assumes the splitter placement and isn't aware
> of the previous position. If the user changed the splitter and you refresh, the
> splitter starts in the middle and shifts after hydration.

The symptom is real and was reproduced exactly. The diagnosis in it is not: the
shell knows precisely where the divider was, and draws it there.

## What the measurement showed

Built site, `astro preview`, Chromium at 1440x900, the editor|preview split
persisted at editor 25% / preview 75%, sampling every animation frame from document
start through a reload:

| t | shell's split line | app's editor / preview | what a person sees |
|---|---|---|---|
| 320ms | **360.75px** ✅ | — | the placeholder draws the divider at the remembered position |
| 1467ms | 360.75px | **662 / 777** ❌ | the app mounts at the hardcoded 46/54 default, hidden behind the shell |
| 2896ms | — | 662 / 777 | **the shell is removed — the wrong split is now on screen** |
| 3317ms | — | **360 / 1079** ✅ | the divider jumps 302px |

Both numbers are the same stored value resolved correctly: 25% of the group
(1440 minus the 1px separator) is 359.75px, which is what the shell drew and what
the app eventually landed on. Nothing was unknown. The two halves simply asked at
different times.

## What we already share, and how

The Studio has a mature, deliberate boot-state channel — it is just not written
down as one:

- **The writer** is the React app, persisting to `localStorage` (preferences,
  layouts) and `sessionStorage` (per-session posture, such as a collapsed pane).
- **The reader** is an inline `<script>` in `studio.astro`'s `<head>`, given
  build-time constants through `define:vars`, which runs before first paint and
  publishes its answers as `data-*` attributes and CSS custom properties on
  `<html>`. The CSS in the same head then draws the shell from those.
- **The format** is declared once, in modules with no imports of their own, so both
  sides depend on the same strings: `components/ui/split-storage.ts` (the bucket
  derivation and the `-collapsed` suffix) and `components/studio/preview-rect.ts`
  (the storage keys, the panel ids, the chrome constants). They are dependency-free
  precisely so an Astro page can import them without dragging React into its module
  graph — see the header note in `split-storage.ts` (#1495).

What the shell already resolves pre-paint: palette, color mode, `color-scheme`, the
boot posture (Read/Write/Build), the deck title, the deck's authored aspect ratio,
the tours preference, the breakpoint-derived chrome bands, **the split fraction**,
the collapsed side, and a replay of the app's own last measured preview rect.

So "do we do this today?" — yes, extensively, and better than the cookie proposal
would be.

## Why not cookies

Two reasons, in ascending order of importance.

**1. There is no server to read them.** The docs site builds static — `astro build`
reports `output: "static"`, there is no adapter, and it deploys to GitHub Pages /
Cloudflare Pages as a static bundle. A cookie's one advantage over `localStorage` is
that it rides the request, and here no request renders anything. Client-side,
cookies are strictly worse: a ~4KB budget shared across the whole origin (the layout
store plus the persisted preview rect would eat it), sent on every asset request on
a site that ships a ~505KB engine, no structured values, and no protection from the
same private-mode blocking `localStorage` already degrades gracefully under.

Cookies only become interesting if the Studio moves to SSR or edge rendering, which
would let the HTML itself ship with the right widths. The Studio is `client:only` by
design (it is a browser app surface with no SEO need), so today the only consumer
would be the shell, which already has the answer before paint.

**2. It would not have fixed anything.** Both halves already read the same store.
The app was not late because it lacked the value; it was late because it did not ask
until two animation frames after mount — and on this page those frames queue behind
the engine fetch. Changing the channel moves that by zero milliseconds.

## The actual asymmetry: read at render, or write after paint

The shell reads its state **before first paint** and paints once. The app read its
state **after mounting** and corrected what it had already painted:

- `StudioShell` rendered its panels with hardcoded `defaultSize="46"` / `"54"`.
- `useResizableSplit` then applied the saved layout in a `useEffect`, gated on a
  post-mount `ready` flag and deferred by a double `requestAnimationFrame`.

That is a correction pass, and a correction pass is only invisible if it wins a race
it does not control. Here it lost: the shell's own dismissal is triggered by the
live preview's first render, which lands *before* those starved frames do.

**The fix is to remove the correction pass, not to speed it up.** The library
(`react-resizable-panels` v4) accepts a `defaultLayout` on the group, and — this is
what makes it usable on both surfaces — consumes it inside its own init layout
effect rather than rendering from it. So it can be computed during the client render
without changing the markup React hydrates, which means no style mismatch for React
19 to silently drop. The hook now reads the saved layout during render and hands it
over; the group initializes at the user's widths and the default share is never laid
out at all.

To read storage during render the hook has to know the panel ids *before* the group
mounts — the only runtime source of the real ids is `groupRef.getLayout()`, which is
one mount too late. So the consumer declares them (`panelIds`). On the Studio that
list is derived from the same conditions the JSX uses, and the split's `configKey` is
now derived from the list, so the two cannot drift.

Getting `panelIds` wrong is safe in both directions: an id set that does not match
the rendered panels finds no saved layout for its bucket (and the library ignores a
`defaultLayout` that does not cover every panel), and the post-mount backstop
re-derives the bucket from the actual panels. It costs a jump, never wrong widths.

## Two things the measurement turned up on the way

**The Playground had never restored its split at all.** Its group reports no layout
for ~245ms after its panels are in the DOM, and the old restore treated the empty
`getLayout()` as "nothing to do" and returned for good — so a dragged divider there
was persisted on every drag and dropped on every load. The restore now keeps the
want as a pending flag, satisfied by whichever signal arrives first.

**A `setLayout` issued while the library is initializing is discarded silently.**
Measured: the Playground's saved 25/75 went in at t=393ms and the library reported
its own 46.667/53.333 at t=417ms. So the backstop cannot treat "I called setLayout"
as done — it re-asserts until the group reports the target back, bounded by attempts
(a share below a pane's px minimum is legitimately clamped and will never match) and
by a deadline.

## Verification

Per HARD RULE #23, on the real built surface, driven through the real divider:

- **Studio** — drag the divider to editor 402px, reload: the pane is 402px on the
  first frame it exists, and never any other width. Pinned by
  `docs/e2e/studio-instant-shell.spec.ts`, "the app never lays out the default share
  when a dragged split is stored", which asserts the *whole log* of pane widths is a
  single entry. Confirmed to fail without the fix (it logs the default first) and
  pass with it.
- **Playground** — the saved layout is now asserted onto the group (it previously
  was not at all). Its panes do not land at the dragged pixel position; see below.

## Known gaps, recorded rather than fixed

- **The Playground's panes do not land where the drag left them.** Restoring the
  stored 28.599% re-applies that share and the pane lays out at 649px where the drag
  left it at 412px. The library expresses a layout as `flex-grow` with
  `flex-basis: auto`, so once the two panes' content bases overflow the row, flex
  SHRINKS them in proportion to those bases and the grow values stop deciding. The
  Studio never shows it because its pane content collapses to nothing. This is a
  Playground flex-sizing question, not a timing one, and it is pre-existing — before
  this change the Playground did not restore at all. Not pulled into this diff
  (HARD RULE #17, #18's off-path rule). Note that `.pg-pane` is on the INNER div; the
  flex item is the library's outer wrapper, so a `flex-basis` rule on that class is
  inert — tried and reverted.
- **The shell models only the bare editor|preview configuration.** A visitor who
  leaves with Settings, the Assistant, the Library or the tablet Inspector docked
  gets a shell drawn without that column and with the default editor|preview share,
  and `StudioShell` also declines to persist a preview rect in that state — so both
  the replay and the compute path are working from the wrong layout. This is the
  largest remaining hand-off jump.
- **`docs/e2e/studio-instant-shell.spec.ts` "a rect from another orientation › is
  not replayed in portrait" is flaky**, independent of this change: 2 failures in 6
  runs on a clean tree, 4 in 7 on this branch (same order of magnitude, small
  samples). The intermittency is already recorded in `studio.astro`'s note on the
  post-paint measure-and-republish race. Off the path of this change.
- **The inline seed still restates a few storage keys by hand**
  (`lattice-tour-enabled`, `lattice-studio-settings`, `lattice-studio-active`) that
  the shared-format modules do not cover. A single dependency-free boot-state module
  plus a build gate — fail if the seed references a key literal not exported from it,
  in the shape of the existing `check-studio-shell.mjs` — would close that drift risk
  the way `#1495` closed it for the split.

## The rule this leaves behind

> Boot state shared between the pre-paint shell and the hydrated app travels through
> `localStorage`/`sessionStorage`, with its format declared once in a
> dependency-free module both sides import. **Both sides read it at the same
> fidelity: before they paint.** A value the shell resolves pre-paint and the app
> corrects post-paint is not shared state — it is two answers, and the user sees
> both.
