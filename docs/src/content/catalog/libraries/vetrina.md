---
kind: library
name: Vetrina
order: 3
promise: A product tour that drives your real app, then steps aside.
intro: Vetrina plays a guided tour inside your live app. A narrated cursor points, types and clicks, and every change goes through your app's own code, so what the viewer sees is real. The moment they click or type anything themselves, the tour stops and hands them control.
group: Showing and reading
inLattice: Runs the Studio tour, lessons and the Present-mode guide.
useWhen: You want to show people how your app works — onboarding, tutorials, a kiosk loop — without a video that goes stale or tooltips that only point.
mark: /vetrina-mark.svg
facts:
  - { k: Package, v: '@laticent/vetrina' }
  - { k: Status, v: Coming to npm with Lattice 1.0 }
  - { k: Runs in, v: The browser, any framework }
  - { k: Dependencies, v: One — '@laticent/ltt'. React optional }
  - { k: License, v: AGPL-3.0 }
reference:
  - label: The README
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/vetrina/README.md
    note: The three ways to write a tour, theming, narration, accessibility and recording.
  - label: The runner
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/vetrina/runner.ts
    note: How a run starts, how take-over works, and the "your turn" hand-off.
  - label: Worked examples
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/vetrina-exemplars/reference-tour.ts
    note: A complete tour, written the way the README recommends.
  - label: Why we built it
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-07-05-vetrina-walkthrough-library.md
    note: The design note — what it is for, and what it deliberately leaves out.
---

## The problem

A new user opens your app. You want to show them how to create something and publish it. There are three usual answers, and each falls short:

- **A video** goes stale with the next interface change, and the viewer can't try the step themselves halfway through.
- **A row of tooltips** says "click here" but never shows what happens next, so the viewer learns where the button is and not what it does.
- **A scripted demo with fake clicks** fires synthetic mouse and keyboard events. That can set off side effects the app never planned for, and the script can't tell the viewer's own click from its own.

And all three make handing control back awkward: a modal you have to close, or an "Exit the tour?" box to confirm.

## The idea

Vetrina separates the **show** from the **substance**.

- **The show is an overlay.** The cursor, the captions and the gestures are drawn on a layer that can't touch your app — it ignores the mouse entirely.
- **The substance is your code.** Every real change happens because a step calls a function you passed in, such as `save()` or `addNote()`. Vetrina never fakes a click, so it never does anything your app didn't offer.
- **The first real input wins.** A genuine click or keystroke ends the tour on the spot, and it lands on whatever the viewer aimed at. After that, the functions you passed in stop working for the tour, so it can never change your app again.
- **A tour is a script of steps.** Say a line, point at an element, type, click, run an action, wave or circle something. Write it as a chain, as a plain list of steps, or as an `async` function when you need branches.
- **It can hand over and wait.** A "your turn" step pauses the tour until the viewer does the expected thing themselves, with a timeout so a distracted viewer can't stall it.

It is accessible by default: the caption is announced to screen readers, the Exit control is reachable by keyboard, and with reduced motion turned on the cursor stops sweeping but the pacing stays readable.

## How to use it

Install the package:

```sh
npm install @laticent/vetrina
```

> Vetrina publishes to npm with Lattice 1.0. Until then it lives in the Lattice repository at `docs/src/lib/vetrina`. React is optional, needed only for `@laticent/vetrina/react`.

A complete tour over a title field and a Save button:

```html
<input id="title" /> <button id="save">Save</button> <button id="demo">Show me</button>

<script type="module">
  import { run, scene } from '@laticent/vetrina';

  const title = document.querySelector('#title');
  // Your app's real functions. The tour changes things only through these.
  const actions = { save: () => alert(`Saved "${title.value}"`) };

  const tour = scene()
    .say('Give your deck a title…')
    .point('#title').type('#title', 'Q4 Board Update')
    .say('…then save it.')
    .point('#save').click().act((a) => a.save()).check()
    .hold(800)
    .build();

  document.querySelector('#demo').addEventListener('click', () =>
    run({
      root: document.body, actions, play: tour,
      type: { set: (t) => { title.value = t; }, append: (t) => { title.value += t; } },
      onStop: (reason) => console.log('tour ended:', reason), // complete, takeover, exit or error
    }));
</script>
```

Notice that `.click()` only *shows* a click. The `.act(...)` that follows does the work, through your function.

| Call | What it gives you |
| --- | --- |
| `run({ root, actions, play })` | Plays a tour. Returns a handle with `stop()`. One tour at a time |
| `scene()` | The chainable builder: `say`, `point`, `type`, `click`, `act`, gestures, `hold`, `build` |
| `storyboard(seed, steps)` | The same tour as a plain array of steps |
| `ctx.awaitUser({ match, timeout })` | Wait for the viewer to do a step themselves |
| `useWalkthrough(ref, configure)` | The React hook, from `@laticent/vetrina/react` |
| `theme` and `--vt-*` CSS variables | Accent color, pointer, caption style, speed and motion |

## Where else it fits

- **Onboarding** in any web app: watch it once, then do it yourself.
- **Interactive tutorials and guided support**, confined to one embedded widget if you like.
- **Show-don't-tell documentation**: put a live component in a docs page and let the cursor demonstrate it.
- **Kiosk and trade-show loops** that repeat until a visitor touches the screen.
- **Narrating what an assistant changed**: each step waits for the real edit, so the cursor walks through the changes as they happen.

## How Lattice uses it

In the **Studio**, Lattice's editor in the browser, the first-run tour and the step-by-step lessons run on Vetrina's React hook. In **Present** mode, the Guide option uses the same cursor and gestures to point at the part of the slide being narrated. That pointer is bundled into **narrated HTML exports**, so a deck sent as a file can still point at what it's talking about.

## What it doesn't do

- **It isn't a test runner.** It sends no synthetic events, so it can't prove a button works. Your functions do the work.
- **One cursor, one viewer, one tour.** No multiple cursors, no syncing several viewers, no jumping into the middle of a live tour.
- **It has no voice of its own.** Narration is a plug-in point; bring your own text-to-speech.
- **Web pages only.** It draws a page-level overlay and doesn't reach inside shadow DOM.
