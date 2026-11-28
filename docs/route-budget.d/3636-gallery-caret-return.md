studio: +219
playground: +219
home: +219
getting-started: +219

`ui/focus-return.ts` gains `caretWithin` and `returnFocus`, which `PersistentSurface` and `SheetContent` use to give an
editor its caret back when a sheet closes (#3636). Before, the close refocused the editor alone, and the caret came back
only if the browser's reset reached ProseMirror within 200 ms of the focus; under load it landed at the start of the
first slide. The helpers keep the selection's two ends, their offsets and their text, and restore them only when the
text is unchanged. Both surfaces are on every route's shared overlay chunk (`_astro/overlay-back`), so each route grows
by the same 219 bytes. components grows too, but it sits under its soft target and owes no line.
