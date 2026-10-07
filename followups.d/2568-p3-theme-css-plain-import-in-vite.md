---
origin: 2568
priority: P3
recorded: 2026-10-07
---

# A plain `import` of a shipped theme fails in Vite

```text
why now   — found while proving the themes/<name>/ move (PR #2568) resolves through Vite. A consumer
            who writes `import '@laticent/lattice/themes/cuoio.css'` gets "[postcss] ENOENT: open
            'lattice'" from Vite 8.2.2: the theme's first line is Marp's `@import 'lattice'`, which
            Vite's CSS pipeline treats as a file path. The flat layout fails identically (measured on
            a flat copy of the package), so the move did not cause it. `?raw` imports and the manifest
            work. The README calls a theme "a Marp theme file, not a standalone stylesheet", but
            nothing stops or explains the plain import.
where     — README.md (the `@laticent/lattice/themes/<name>.css` row), docs/src/content/docs/guides/
            themes.md; possibly a `./themes/*.css?standalone`-style export of the theme with the engine
            import resolved, the shape lib/engine/css.js composeCss already produces.
done when — either a documented recipe a Vite user can follow (and a test that runs it), or a
            published stylesheet form of each theme that imports cleanly in Vite.
evidence  — a scratch Vite project importing the packed tarball builds, and the bundle carries the
            theme's tokens.
verify    — tier 1 checker, because it touches the published package surface.
```
