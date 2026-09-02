#!/bin/bash
set -euo pipefail

# SessionStart hook — makes a fresh Claude Code on the web container able to
# run the full quality pipeline (lint, unit + integration tests, build, and
# PDF rasterization for visual review). Fresh containers clone the repo with
# NONE of the following, so every one of those commands fails until set up:
#
#   1. node_modules        → biome (lint), node --test, the build toolchain
#   2. poppler-utils        → pdfinfo / pdftoppm: PDF page counts (integration
#                            tests) AND rasterize-for-review.sh / pixel-check
#   3. CHROME_PATH         → marp-cli's headless Chromium (integration tests,
#                            any deck render). puppeteer caches the binary but
#                            it isn't on PATH.
#
# Web-only: local checkouts already have all three and we don't want to mutate
# a developer's machine on session start.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# 1. JS deps. npm install (not ci) is idempotent and benefits from
#    container-state caching after the first run; the lockfile pins versions.
#    Its `prepare` step also runs `lefthook install`, wiring the git hooks so
#    the pre-commit / pre-push gates are actually active in this session.
npm install --no-audit --no-fund

# 1b. The generated bundles. dist/ and the docs-site bundles are BUILT, not
#     committed (.gitignore, 2026-08-17), so a fresh container has neither. Almost
#     everything here needs them: `node dist/lattice-emulator.js`, the unit and
#     integration suites, the docs site, and the agent-facing catalog
#     dist/docs/components.pick.md that CLAUDE.md tells you to grep. ~16s, no
#     browser. Idempotent — a no-op when they are already current.
# `|| true` is deliberate under `set -euo pipefail`: a build failure must NOT abort
# the hook, because everything below it — poppler-utils and CHROME_PATH — is what
# the render pipeline needs, and losing those to a build error would strand the
# session with a far more confusing failure than a missing dist/. The build also
# self-bootstraps a cold tree, so this is a no-op on a warm one.
npm run build >/dev/null 2>&1 || echo "  (build failed — run 'npm run build' to see why; continuing)" 

# 2. System deps for the PDF pipeline. A fresh container's apt index is often
#    stale, so refresh it once before installing — a stale index 404s on the
#    pinned .deb and silently leaves pdfinfo missing, which fails the integration
#    gate (and, under set -e, aborts the rest of this hook before CHROME_PATH is
#    exported). Only pay the update cost when something actually needs installing.
if ! command -v pdfinfo >/dev/null 2>&1 || ! command -v mogrify >/dev/null 2>&1 \
   || ! fc-list 2>/dev/null | grep -qi "noto color emoji"; then
  apt-get update || sudo apt-get update || true
fi

# 2a. poppler-utils → pdfinfo / pdftoppm (PDF page counts + rasterize-for-review).
#     Non-fatal: a transient apt outage must not abort the rest of setup; the
#     pre-push gate re-checks pdfinfo loudly anyway.
if ! command -v pdfinfo >/dev/null 2>&1; then
  apt-get install -y poppler-utils || sudo apt-get install -y poppler-utils || true
fi

# 2b. ImageMagick → mogrify / identify, used by tools/rasterize-for-review.sh
#     for --crop / --region detail shots. Best-effort and non-fatal: the script
#     degrades to a poppler-only path (plain + --overview render, with PNG sizes
#     read via python3) when ImageMagick is absent, so a transient apt outage
#     only costs the crop feature, not visual review.
if ! command -v mogrify >/dev/null 2>&1; then
  apt-get install -y imagemagick || sudo apt-get install -y imagemagick || true
fi

# 2c. Color emoji font. The owned render paths (lattice-engine, lattice-emulator)
#     emit raw unicode emoji as plain text (no twemoji <img>), so a color emoji
#     font must be present for them to render in color in headless Chromium. The
#     webfont @import in lattice.css is a portable bonus, but an installed font
#     is the reliable guarantee. Idempotent: skip if already present.
if ! fc-list 2>/dev/null | grep -qi "noto color emoji"; then
  apt-get install -y fonts-noto-color-emoji || sudo apt-get install -y fonts-noto-color-emoji || true
fi

# 3. Point marp-cli at the puppeteer-cached Chromium for the whole session
#    (and thus for the pre-push integration gate, which inherits this env).
CHROME_BIN="$(ls /root/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome 2>/dev/null | head -1 || true)"
if [ -n "$CHROME_BIN" ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export CHROME_PATH=\"$CHROME_BIN\"" >> "$CLAUDE_ENV_FILE"
fi

# 4. Docs-site deps. docs/ is a SEPARATE npm package (not a root workspace), so
#    the root install above never touches it — yet any docs/src/** preview or
#    screenshot needs it. Install best-effort so docs work is never blocked on a
#    manual `cd docs && npm install` (the single most-rediscovered friction).
#    Non-fatal and quiet.
#
#    DELIBERATELY UNGATED. This used to be wrapped in a test for the astro BIN
#    existing, to spare a warm container the heavy Astro/CodeMirror install. That
#    gate could tell an EMPTY tree from an installed one, but not a STALE tree
#    from a current one — and a stale docs/node_modules is exactly what a warm
#    container carries. The bin exists in every astro version, so the gate
#    short-circuited on precisely the tree that needed repairing, silently, and
#    the next `npm run build` died at config load blaming one package's missing
#    export (see engineering/gotchas/docs-site.md, "Docs build dies at config
#    load"). Measured cost of dropping it: ~2.4s when the tree is already current,
#    ~4s when it is stale — in which case it heals the drift (astro 6.3.7 ->
#    7.2.10, verified). That is what the gate was buying, against a silent dead end.
#
#    --no-save IS LOAD-BEARING, not tidiness. A plain `npm install` REWRITES
#    docs/package-lock.json even when the tree is already current (measured: it
#    re-derives `dev: true` on optional platform packages), so an unconditional
#    install would hand every session a dirty lockfile before the first prompt —
#    noise in `git status`, and a real chance of being swept into an unrelated
#    commit. --no-save still reconciles node_modules against package.json, so it
#    heals the drift; it just does not write the lockfile back. Verified: lockfile
#    clean across repeated runs, stale tree still healed.
( cd "$CLAUDE_PROJECT_DIR/docs" && npm install --no-save --no-audit --no-fund ) >/dev/null 2>&1 || true

# 5. Point every session at the centralized standard-practice digest. The hook's
#    stdout lands in the session's initial context, so this one line is what
#    turns "rediscover the sandbox each time" into "read it once, up front".
echo "Lattice sandbox ready — standard practice (render / docs-site / lint / test cheatsheet): see CLAUDE.md § \"Cloud sandbox\"."
