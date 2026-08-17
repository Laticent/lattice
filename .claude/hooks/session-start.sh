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
npm run build --silent >/dev/null 2>&1 || npm run build

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
#    GATED on the astro bin so a warm container (and every non-docs session)
#    skips the heavy Astro/CodeMirror install. Non-fatal and quiet.
if [ ! -x "$CLAUDE_PROJECT_DIR/docs/node_modules/.bin/astro" ]; then
  ( cd "$CLAUDE_PROJECT_DIR/docs" && npm install --no-audit --no-fund ) >/dev/null 2>&1 || true
fi

# 5. Point every session at the centralized standard-practice digest. The hook's
#    stdout lands in the session's initial context, so this one line is what
#    turns "rediscover the sandbox each time" into "read it once, up front".
echo "Lattice sandbox ready — standard practice (render / docs-site / lint / test cheatsheet): see CLAUDE.md § \"Cloud sandbox\"."
