- The docs-suite speedup from pinning 136 DOM-free test files to `environment: 'node'` is
  re-measured on a second sandbox, with the two arms alternating over four rounds: 202.82s →
  188.25s (-7.2%), against -8.3% on the box that first reported it. The `environment` line
  nearly halves on both. No code change — the note now carries both boxes' figures.
