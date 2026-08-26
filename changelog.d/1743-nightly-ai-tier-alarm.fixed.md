- **Fixed: the nightly live-AI Studio tier can now report its own failures.** `e2e-ai` was
  the only job in the nightly family that filed no tracking issue when it failed, so when it
  broke on a real regression it failed eight nights running with nothing but a red X on a
  scheduled run to say so. It now opens or appends one rolling issue, on the same shape its
  siblings use: the run is teed to a report, the step stays green so the alarm can run, and
  the step timeout sits below the job's so a mid-flight kill still files. Because this tier
  holds a live key, the report is redacted before it reaches an issue body — Actions masks
  secrets in the log, not in a file posted verbatim.
