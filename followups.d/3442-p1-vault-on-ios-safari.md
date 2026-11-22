---
origin: 3442
priority: P1
recorded: 2026-11-22
area: website
severity: medium
swimlane: engineering/decisions/2026-11-22-vault-slice-1-as-built.md
deferred: blocked — the macOS harness never got a runner: run 45074074084 waited 27 minutes and was cancelled with no steps run; run 45076943209 was still queued behind other sessions' harnesses after 12 minutes and was cancelled to free the queue
source: https://github.com/Laticent/lattice/pull/3442
---
# Run the vault probe on iOS Safari

why now   — slice 1's vault is proved on Chromium, Linux WebKit and Gecko, but not on Mobile Safari, the engine every
            iPhone and iPad uses. Slice 2 gives the vault its first caller, so the iOS answer must be in before it merges.
where     — `docs/scripts/ios-safari/vault-probe.js` (PROBE=vault, `runVaultProbe` in `run.mjs`), driving `/proto/vault/`.
            The probe passes every step on Playwright's Linux WebKit in a persistent profile.
done when — the probe has run on an iPhone and an iPad simulator. Either every step is green (the vault opens, every blob
            goes through `sync-access-handle`, every file reads back after a real reload, and the startup scan verifies
            22/22), or the failure is recorded with the reason Safari gives (for example `unavailable` if Safari refuses OPFS).
evidence  — the harness reply comment, or a `platform-suites` run's `platform-suite-artifacts/vault-<device>.json`.
verify    — dispatch `platform-suites.yml` on the branch with `harness=<PR>`. When it posts "harness ready", post
            `/harness sh` with `PROBE=vault DEVICES=iPhone bash docs/scripts/ios-safari/run.sh`, then the same command
            with `DEVICES=iPad`.
