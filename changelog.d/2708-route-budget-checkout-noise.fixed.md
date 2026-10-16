- **Fixed: the route budget no longer charges a pull request for bytes it did not add.** Two
  esbuild plugins in `tools/build-playground.js` gave modules absolute paths, and esbuild names
  the engine's shared chunks from those paths, so the engine's eager JS moved by a few bytes with
  the folder the repo sat in. `measure-route-base.sh` builds the base in a temp folder, so a PR
  with no bundled change failed the docs build on +2 bytes. The plugins now return repo-relative
  paths, and the build fails if any module path is absolute.
- **Fixed: a route's `htmlRaw` now measures the same in every checkout.** Astro's island `uid`
  hashed each component's absolute path at a variable length, so page sizes moved 1–3 bytes
  between folders. It never failed a PR, because only eager JS is compared against `main`.
  `docs/scripts/stable-island-uids.mjs` rewrites each uid after the build at a fixed length, which
  makes pages with islands a one-time 1–17 bytes larger.
