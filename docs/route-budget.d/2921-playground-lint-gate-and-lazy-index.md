playground: +140
The Playground editor's lint gate (#2921 P1, `docs/src/playground/editor.js`) is +102 B gz on the playground route against
main, as CI measured it: a client-rects check and a `ResizeObserver` that re-lints when a hidden editor is shown. It pays
for itself at runtime, because an Explore load no longer fetches the 95 KB (Brotli) lint core at all; that file is served
from `/playground/v/` and loaded with `import()`, so this ledger does not count it. The component picker's lazy search
index (#2921 P2, `ComponentPicker.tsx`) is +22 B gz more, measured locally between the two builds. Declared +140 over the
measured 124 for gzip variation.
