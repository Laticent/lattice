- **Security: the docs site's strict Content-Security-Policy now covers 198 of its 204 pages, up
  from 75.** It reaches every page that shows a slide preview: the component and plugin pages,
  the docs pages with a live example, and the Playground. A preview frame inherits its page's
  policy, and the engine used to write its fit, font and link scripts into each frame inline. Under
  the policy that left the Playground preview blank, so those pages had carried no policy at all.
  The scripts now live in one file beside the engine (`lattice-frame-agents.js`). The code-package
  sandbox and the diagram draw frames, which keep their own stricter policies, load through a small
  same-origin shell, so a page's policy no longer refuses them. Measured on Chromium, WebKit and
  Gecko: every policy page loads with no violation, and the previews, a function plot drawn in its
  sandbox, and the library demos all work under it.
- **Six pages still carry no policy, each named by every build:** the Studio and one prototype
  (the export player writes inline scripts into its capture frames), Calco (its font subsetter
  builds code from strings), Cadenza and Suono (their voice code imports a runtime whose own
  requests are not yet listed), and the landing page, held back until its page-size ceiling is
  decided.
