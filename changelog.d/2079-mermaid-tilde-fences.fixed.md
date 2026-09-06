- **Fixed: a `~~~mermaid` fence now draws its diagram in the PDF, not five lines of
  source.** CommonMark fences with tildes as well as backticks, and the live preview always
  rendered either — but the CLI substituted only the backtick form, so a tilde fence rendered
  in the preview an author was writing in and printed as raw Mermaid in the file they sent.
  Both callers now read one matcher, `lib/core/mermaid-fences.js`: the substitution and the
  narrator, which speaks a diagram slide from the same fence it renders. Nothing else about
  the pattern was relaxed — a backtick fence exports byte-identical output.
