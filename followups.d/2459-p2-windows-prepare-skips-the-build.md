---
origin: 2459
priority: P2
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2459
---

# The build does not run on Windows: `prepare` chains with `;`, and `tools/build.js` fails in 15 steps

```text
why now   — found by the code-sandbox probe on a windows-latest runner (PR #2459): after `npm ci`, every render failed with "layout CSS not found: dist\lattice.css". package.json `prepare` is `lefthook install || true; node tools/build.js --only-uncommitted`; npm runs scripts through cmd.exe on Windows, where `;` is not a command separator and `true` is not a command, so the build silently never runs. Every Windows contributor and tester starts from an unbuilt checkout. A second runner pass (run 36438111974) then ran `node tools/build.js --only-uncommitted` directly, and 15 of its steps failed on Windows for four distinct causes: (1) `spawnSync(node_modules/.bin/esbuild)` without the `.cmd` shim or `shell: true` → ENOENT (dagre bundle, PDF writer bundle); (2) `tsc declaration emit failed` in every workspace library (trama, ltt, cadenza, vetrina, lente, suono), which cascades into every bundle that imports them; (3) `python3 tools/ascii-preview.py build` → UnicodeEncodeError under the cp1252 console (doc portal); (4) the lattice-emulator.js bundle marks its own entry point external through a backslash path. Only `tools/build-css.js` (lattice.css, lattice-default.css) and a few docs-site bundles succeeded.
where     — package.json "prepare"; tools/build.js and the step scripts named above; the launchers tools/verify-code-sandbox.{sh,cmd} work around it by running only tools/build-css.js, which is all the sandbox check reads.
done when — on a Windows machine, `npm ci` in a fresh clone runs the whole build cleanly and leaves dist/ in place (and lefthook installed where it can be), and the same script still works on Linux and macOS; the launchers' workaround can then go.
evidence  — a windows-latest runner (or a Windows machine): `npm ci`, then `dir dist\lattice.css`; plus the same on ubuntu-latest and macos-latest.
verify    — tier 1 checker, because `prepare` runs on every install everywhere, and a shell-portable rewrite (a small node script instead of `;` and `true`) is easy to get subtly wrong on one platform.
```
