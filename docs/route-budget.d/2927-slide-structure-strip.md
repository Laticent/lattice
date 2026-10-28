studio: +5600
playground: +40
home: +40
components: +40
getting-started: +40
The Studio's slide strip now acts on the slide you see (2026-10-27-slide-structure-strip.md): deck-ops cuts a
heading-split block at the slide's heading, keeps each `say:` entry on its slide and touches only the slides it changes,
the deck outline carries slide ids by text, and a slide history gives the strip an Undo that holds after typing and
Live edits. All of it runs on the first click, so it ships with the Studio. Given back first: the `say:` rewriter moved
out of `resolve-narration.mjs` into its own module, which took 274 bytes off the home page and the Playground. The
13 bytes on the other routes are the tooltip's `forceOpen`, which holds the delete confirm's name on screen.
The second raise (+4392 to +5378, measured on 10ed2a8) is the New slide door's Before | After split, which asks
where the slide goes in place and confirms in the door, and the strip's own note with its Undo, which replaced two
toasts.
