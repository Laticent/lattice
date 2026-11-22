- **Security: the docs site's strict Content-Security-Policy now covers 199 of its 204 pages, up
  from 75.** It reaches the landing page and every page that shows a slide preview: the
  component and plugin pages, the docs pages with a live example, and the Playground. A preview
  frame inherits its page's policy, and the engine used to write its fit, font and link scripts
  into each frame inline. Under the policy that left the Playground preview blank, so those
  pages had carried no policy at all. The scripts now live in one file beside the engine
  (`lattice-frame-agents.js`). The code-package sandbox and the diagram draw frames, which keep
  their own stricter policies, load through a small same-origin shell, so a page's policy no
  longer refuses them. Measured on Chromium, WebKit and Gecko: every policy page loads with no
  violation, and the previews, a function plot drawn in its sandbox, and the library demos all
  work under it.
- **Firefox previews keep their fonts and fit from the second page on.** Firefox refused a
  preview's own runtime and fonts once the site's offline service worker was in control, so every
  page after the first rendered its previews in a fallback font. The policy now names the site's
  own addresses beside `'self'`, which Firefox honors.
- **A preview whose script file fails to load still shows its slides.** The preview scripts now
  arrive as a file, and a page left open across a deploy can ask for one that is gone. The
  Playground preview then shows the slides unscaled instead of nothing, and the Stage shows the
  deck and tells the presenter to reload, instead of a blank projector. If that deck's player
  arrives late after all (a slow network), the Stage says so, so the presenter does not reload.
- **Five pages still carry no policy, each named by every build:** the Studio and one prototype
  (the export player writes inline scripts into its capture frames), Calco (its font subsetter
  builds code from strings), Cadenza and Suono (their voice code imports a runtime whose own
  requests are not yet listed).
- **Known limit: offline in Firefox, a function plot on a docs page you never opened online does
  not draw, and says why.** Under the policy its sandboxed frame loads a small file that Firefox
  will not take from the offline copy, and the policy refuses the in-page fallback. The slide reads:
  "Offline, this browser can't open this diagram until you have viewed it online once. Reconnect and
  reload this page to draw it." Doing that once fixes it, offline included. A Mermaid diagram in
  the same case draws from the page's own copy. Chromium and exported decks are unaffected.
