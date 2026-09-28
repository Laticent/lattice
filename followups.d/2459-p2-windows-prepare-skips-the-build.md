---
origin: 2459
priority: P2
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2459
---

# `npm ci` on Windows never builds dist/: the prepare script chains with `;`

```text
why now   — found by the code-sandbox probe on a windows-latest runner (PR #2459): after `npm ci`, every render failed with "layout CSS not found: dist\lattice.css". package.json `prepare` is `lefthook install || true; node tools/build.js --only-uncommitted`; npm runs scripts through cmd.exe on Windows, where `;` is not a command separator and `true` is not a command, so the build silently never runs. Every Windows contributor and tester starts from an unbuilt checkout.
where     — package.json "prepare"; tools/build.js --only-uncommitted; the launchers tools/verify-code-sandbox.{sh,cmd} work around it by building when dist/lattice.css is missing.
done when — on a Windows machine, `npm ci` in a fresh clone leaves dist/lattice.css in place (and lefthook installed where it can be), and the same script still works on Linux and macOS; the launchers' workaround can then go.
evidence  — a windows-latest runner (or a Windows machine): `npm ci`, then `dir dist\lattice.css`; plus the same on ubuntu-latest and macos-latest.
verify    — tier 1 checker, because `prepare` runs on every install everywhere, and a shell-portable rewrite (a small node script instead of `;` and `true`) is easy to get subtly wrong on one platform.
```
