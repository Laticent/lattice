- **Fixed: a `~~~mermaid` fence now draws its diagram in the PDF, not five lines of
  source.** CommonMark fences with tildes as well as backticks, and the live preview always
  rendered either — but the CLI substituted only the backtick form, so a tilde fence rendered
  in the preview an author was writing in and printed as raw Mermaid in the file they sent.
  One walker now, `lib/core/mermaid-fences.js`, read by both the substitution and the
  narrator that speaks a diagram slide. It handles a closing run longer than its opener, and
  a fence documented inside another fence stays a code sample. No deck's export bytes move:
  measured against the pattern it replaces across all 1387 tracked markdown files.
- **Fixed: a `~~~` fence's contents are no longer read aloud.** The three fence trackers
  behind narration were backtick-only, so a tilde-fenced code block was not fenced as far as
  speech was concerned and its source narrated. They share one reader now.
