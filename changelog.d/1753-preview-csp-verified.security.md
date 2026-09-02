- **Security: the Playground preview's remote-subresource containment is now measured on the
  real app.** The narrow CSP that stops a deck beaconing out of a preview frame shipped with
  its Playground round trip unverified — asserted on the assembled document, never driven
  through the running Playground. It is now driven: 4 outbound requests with the meta removed,
  0 with it, the payload still in the frame's DOM both times. Pinned by
  `docs/e2e/preview-remote-subresource.spec.ts`.
