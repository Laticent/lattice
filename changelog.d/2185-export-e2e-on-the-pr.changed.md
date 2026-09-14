- **Changed: the two export end-to-end arms that carry #2147's claim now run on every PR.**
  `docs/e2e/mermaid-unavailable-export.spec.ts` carried no `@smoke` tag, so the export
  arms ran nightly — after merge — and the fix's "verified on the real surface" artifact
  was hand-produced and not re-derivable from a PR. The give-up arm (a stalled
  `mermaid.render`) and the regression arm (a diagram drawing between the export's two
  waits) are tagged; the other three stay nightly because they exercise the older
  `releaseUnrenderableFences` path or are the control. Measured on the whole `@smoke`
  tier: 55 tests/278s to 57 tests/291s, **+13s** in a 4-core sandbox, roughly +20s on the
  runner — well under the isolated 43.7s, because two workers let the arms fill idle
  worker time. No cap change needed, and `studio-smoke` stays advisory, so a red arm
  reports on the PR without blocking the merge.
