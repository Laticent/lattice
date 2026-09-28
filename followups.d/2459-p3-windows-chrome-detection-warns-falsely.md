---
origin: 2459
priority: P3
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2459
---

# On Windows every render warns "No Chrome binary detected", and then renders with Chrome

```text
why now   — found by the code-sandbox probe on a windows-latest runner (PR #2459, run 36443137686): every CLI render printed "⚠ No Chrome binary detected. Set PUPPETEER_EXECUTABLE_PATH or CHROME_PATH…", then rendered fine through puppeteer's own default (C:\Users\runneradmin\.cache\puppeteer\chrome\win64-…\chrome-win64\chrome.exe). detectChromeExecutable looks only under process.env.HOME, which Windows does not set (it sets USERPROFILE), and its candidate list has chrome-linux64 and chrome-mac-* but no chrome-win64. The warning tells a Windows user to fix something that is not broken.
where     — lib/core/chrome-exec.js detectChromeExecutable; the warning at lattice-emulator.js "No Chrome binary detected".
done when — on Windows, detectChromeExecutable returns the puppeteer cache's chrome-win64\chrome.exe (via USERPROFILE or os.homedir()), the render prints no warning, and `lattice packages trust` and the render still resolve the SAME binary (the code sandbox depends on that; see the comment above CHROME_EXEC).
evidence  — a windows-latest runner: tools\verify-code-sandbox.cmd --non-interactive shows no "No Chrome binary detected" line and all 8 steps PASS; plus the unit tests for chrome-exec on Linux.
verify    — tier 1 checker: every Chromium launch in the CLI goes through this function.
```
