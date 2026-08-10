---
status: shipped
summary: The Studio's pre-paint shell and the hydrated app already share boot state through localStorage read by an inline head script, with the storage FORMAT declared once in dependency-free modules both sides import - so the splitter jank reported as "the shell doesn't know where the divider was" was never a sharing gap. Measured on the built site at 1440x900 with the split dragged to editor 25%, the shell had it right from t=320ms; the APP mounted at its hardcoded 46/54 default at t=1467ms and only applied the saved layout at t=3317ms, ~400ms after the shell was dismissed - a 302px jump in plain view. The asymmetry is TIMING, not channel - the shell reads before paint, the app read two animation frames after mount, and those frames queue behind the ~505KB engine fetch. Cookies were considered and rejected - the docs site builds static (no adapter, no per-request render), so a cookie cannot reach a server that does not run, and client-side it is strictly worse than localStorage. Fix - on a client:only surface the saved layout is read during the first render and handed to react-resizable-panels as its defaultLayout; a hydrated surface keeps the post-mount restore, because that seed reaches the panel's inline style during RENDER and React 19 does not patch inline-style hydration mismatches. The first draft of this change seeded both surfaces and froze the Playground's flex-basis permanently - the adversarial trio caught it before merge, and the record of that is kept below rather than tidied away. Remaining known gaps recorded, chief among them the docked side panels the shell does not model.
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
(`react-resizable-panels` v4) accepts a `defaultLayout` on the group. The hook reads
the saved layout during render and hands it over; the group initializes at the user's
widths and the default share is never laid out at all.

**But only on a surface that never server-renders, and the reason is the most
important thing in this note.** `defaultLayout` is NOT confined to the library's init
effect: `getPanelStyles` reads it during RENDER and returns `{flexGrow}` from it
whenever the group has no live state yet (`if (n?.[P]) return { flexGrow: n?.[P] }`).
On a hydrated island the server rendered the panel's `defaultSize` and the client's
first render produces something different, and React 19 does not patch inline-style
hydration mismatches — it says so in as many words: *"this won't be patched up."* The
DOM keeps the server's declarations while React's prop record believes the client's,
so `flex-basis: 0` and `flex-shrink: 1` are never written, `flex-basis` resolves to
`auto`, and the grow values stop deciding the layout — permanently, for the life of
the page.

The first draft of this change asserted the opposite ("consumes it inside its own
init layout effect rather than rendering from it") and seeded BOTH surfaces on the
strength of it. On the Playground that turned a divider dragged to 472px into 678px
on reload, and left it non-linear afterwards: a keyboard nudge that moved
`aria-valuenow` 25 → 30 moved the pane 34px where its own reported share claims 72px.
The library's state stayed right while the pixels went wrong, which is exactly why
the existing reload test in `docs/e2e/split.spec.ts` — it asserts `aria-valuenow` —
sailed past it. So: the Studio (`client:only`) is seeded, the Playground
(`client:load`) is not, and the option is named `clientOnlyPanelIds` so the
constraint travels with the call rather than living in a comment.

To read storage during render the hook has to know the panel ids *before* the group
mounts — the only runtime source of the real ids is `groupRef.getLayout()`, which is
one mount too late. So the consumer declares them (`panelIds`). On the Studio that
list is derived from the same conditions the JSX uses, and the split's `configKey` is
now derived from the list, so the two cannot drift.

Getting `panelIds` wrong is safe in both directions: an id set that does not match
the rendered panels finds no saved layout for its bucket (and the library ignores a
`defaultLayout` that does not cover every panel), and the post-mount backstop
re-derives the bucket from the actual panels. It costs a jump, never wrong widths.

## A claim this note used to make, and why it is gone

An earlier draft said **"the Playground had never restored its split at all"**, on
the strength of a synthetic layout written into `localStorage` mid-session and a
reload that came back at the default. That is false, and both the independent checker
and a rebuild of `origin/main` refuted it: a real drag to 472px reloads to 472px on
`main`, and the pre-existing `docs/e2e/split.spec.ts` reload test passes there. The
old `useEffect` + double-rAF restore was late on the Studio, not absent on the
Playground.

It is recorded rather than deleted because the false claim did real damage: it was
the justification for seeding the Playground at all, and for a re-assert loop built
on a second bad measurement ("a `setLayout` during init is discarded silently" —
observed only on a build where the seed was already corrupting the layout). Both are
gone. The backstop now does what the old one did, one step earlier (a layout effect
rather than two animation frames) and without the permanent give-up when
`getLayout()` is still empty.

**The lesson worth keeping:** a synthetic value written into storage is not the same
experiment as the value the app itself wrote. The stored share the app produces is a
measured percentage; a hand-picked one exercises clamping and content-sizing paths
the real one never reaches. Drive the real control.

## Verification

Per HARD RULE #23, on the real built surface, driven through the real divider:

- **Studio** — drag the real divider to editor 402px, reload: the pane is 402px on
  the first frame it exists, and never any other width. 3/3 on the drag-then-reload
  journey and 4/4 from a seeded layout. Pinned by
  `docs/e2e/studio-instant-shell.spec.ts`, "the app never lays out the default share
  when a dragged split is stored", which asserts the *whole log* of pane widths is a
  single entry. Confirmed to fail without the fix (it logs the default first) and
  pass with it.
- **Playground** — drag to 472px, reload, still 472px, and a keyboard nudge moves the
  pane by the share it reports. Pinned by a new case in
  `docs/e2e/playground-state.spec.ts` that measures the PANE rather than
  `aria-valuenow`, because the seeded build kept the latter correct while the former
  was 206px out.
- **One residual, observed once in ~10 Studio runs** and worth stating rather than
  averaging away: under extreme CPU load (three agents plus a build on the same box)
  a run mounted at the default share and was corrected by the backstop at t=3636ms —
  the old jank, back for one load. The seed is what makes the common case exact; the
  backstop is what makes the pathological case merely late.

## The Playground's pre-paint, which is the same problem with a different cure

Fixing the Studio left the Playground looking worse than either of us realized, and a
screen recording on a real iPad is what surfaced it — not any measurement taken here.

That island server-renders, and until it hydrates its two panel wrappers carry **no
`flex-grow` at all** and an inline `flex-basis:45`. A unitless number is not a valid
CSS length, so the parser discards it. The panes therefore size to their CONTENT and
leave the rest of the row empty. Measured at iPad width with the CPU throttled 6x, on
a reload with a dragged split saved:

| t | editor | preview | row covered |
|---|---|---|---|
| 410ms | **123px** | 300px | **35%** — the rest of the viewport blank |
| 1460ms | 557px | 636px | 100% (the 45/55 default) |
| 1550ms | 337px | 856px | 100% (the saved share, at last) |

Three states, two of them wrong, on every reload — and the first one is not "the
default painting early", it is no layout at all.

The cure is not the Studio's. `defaultLayout` is exactly the thing that must not touch
a hydrated surface. But the same property that made the SSR paint broken makes a
STYLESHEET able to own it: the inline basis is invalid and the inline grow is absent,
so CSS wins that window and loses it again the moment React commits a real inline
`flex-grow`. So the pre-paint CSS-var seed is back — `playground.astro` writes
`--pg-split-a/b` from the same saved layout the app will restore, and `playground.css`
consumes them with the panels' own defaults as fallbacks.

The 2026-07-19 migration note retired that seed on the reasoning that "the library owns
the panel's inline flex, so a CSS var can't seed it". Before hydration the library owns
no such thing. Worth remembering as a shape: *a claim about who owns a value is only
true for the window in which that owner exists.*

After: **one state**, 317px at 100% coverage from the first frame it is measurable.
Pinned by the `@smoke` Playground case, which now asserts the panes cover the row in
every frame it sampled — an assertion that fails on the old build with the three-state
log printed in the message.

## What the Studio does that the Playground did not

The split seed above fixed the pane WIDTHS and the reporter still called the
Playground janky, which was correct. Filming both surfaces reloading, side by side at
the same size and throttle, shows why — and the difference is not the splitter:

| | Studio | Playground (before) |
|---|---|---|
| shell | `position:fixed; inset:0`, opaque, the app's real chrome | `.pg-ssr-shell`, `position:absolute` INSIDE the preview pane |
| shown to | every visitor, unconditionally, from HTML-parse time | only when a snapshot replay passes its gate |
| preview area | a Nacre placeholder at the box's EXACT final rect | empty until the engine renders |
| island | `client:only` — nothing server-rendered to hydrate in view | `client:load` — the real DOM assembles on screen |

The Studio's guarantee is that **you never watch it being built**: one skeleton, at
the geometry the app is about to use, dismissed only once the live preview has
painted. The Playground builds in front of you.

And the mechanism that was supposed to soften that was **dead code**. The Playground's
pre-paint snapshot replay gates on
`snap.srcHash === fp(localStorage['lattice-docs-pg-source'])` — but `pg-source` holds
the visitor's DRAFT, written only once they type in the editor. A visitor who only
picks components never writes one, so the comparison was the snapshot's real hash
against the hash of the empty string. Measured on a fresh profile: `v`, `palette`,
`mode`, `html`, `css` all passed; `srcHash` compared `96ae8e9b` to `1505` and
rejected. `data-pg-shell` was never set, `.pg-ssr-shell` stayed `display:none`, and
the pane was a void for ~4s on every reload.

With no draft, the identity of what will render is the INSERTED hash — which the very
same script already reads for its `pristine` test two lines earlier. The cached slide
now paints at ~510ms and hands off to the live filmstrip at ~2.9s.

**Why no test caught it, which is the transferable part:** every assertion on this
surface waited for the LIVE filmstrip, and that arrives either way. A silent pre-paint
mechanism needs a test that asserts *the mechanism ran*, not that the content
eventually appeared. There is one now.

## Known gaps, recorded rather than fixed

- **`defaultSize="45"` / `"55"` on the Playground's panels are invalid CSS lengths.**
  A unitless number is not a length, so the `flex-basis` the library server-renders
  from them is dropped by the parser. It is inert today — the client render replaces
  it — but it is the latent fragility that made the hydration mismatch destructive
  rather than merely noisy, and it deserves its own fix. Genuinely pre-existing (it is
  on `main`), genuinely off this change's path.
- **A COLLAPSED pane still jumps, and the headline claim does not cover it.** The
  collapse restore is a separate effect, still `ready` + a double rAF, and this change
  deliberately leaves it alone. Measured on this branch at 1440x900 with a collapsed
  pane and a saved layout: the editor lands at 360px and snaps to its 46px rail 867ms
  later; with the preview collapsed the jump is 1033px. Both also fire a toast — "Editor
  collapsed." — on a plain reload the user never touched. The pre-paint shell has this
  RIGHT the whole time (it reads the collapse key and draws the rail from t~75ms), so
  whether a human sees the wrong state is a race against shell dismissal. Identical on
  `main`, so pre-existing and not a regression — but it is squarely on this change's path
  and is the obvious next slice, because it is the same bug in the same hook.
- **A legally-saveable share can silently collapse a pane on a narrower window, and
  persist it.** The editor's minimum is 300px, so at 1440 the smallest saveable share is
  ~20.85%; restore 21% into a 700px window and it falls below the library's collapse
  midpoint, so the pane snaps to its rail and `pollCollapse` writes the collapse to
  sessionStorage. The user collapsed nothing. Identical on `main`.
- **A mouse drag of the Playground divider did not re-engage after a reload** in
  Playwright, on this branch AND on `main` alike, while a keyboard nudge of the same
  separator works. Most likely a synthetic-input artifact rather than a product
  defect, but it is unexplained, it reproduced 3/3 on both builds, and it is written
  down here rather than forgotten.
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
