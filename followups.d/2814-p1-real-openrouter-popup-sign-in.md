---
origin: 2814
priority: P1
recorded: 2026-10-20
area: website
severity: high
swimlane: engineering/decisions/2026-10-20-openrouter-popup-sign-in.md §Verified
source: https://github.com/Laticent/lattice/pull/2814#issuecomment-6288414527
---

# Connect OpenRouter once for real through the popup

why now   — every test mocks OpenRouter, so nothing yet shows that OpenRouter accepts
            `/sign-in/callback/` as `callback_url`; if it does not, nobody on the web can
            connect
where     — the PR preview's Studio: Workspace → AI → Cloud → Connect OpenRouter; then once
            with "Continue with Google", the opener-cut case
done when — a real sign-in ends in "OpenRouter connected" with the Studio never reloaded,
            by email and by Google
evidence  — a screenshot of the toast, and the connected Cloud pane
verify    — the owner's own account; HARD RULE #24 keeps our key out of it
