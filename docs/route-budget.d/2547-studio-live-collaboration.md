studio: +3600
playground: +800
Live collaboration needs a little always-loaded wiring: the Live button on the toolbar, the presence dots on the slide navigator, the follow bar, the Share sheet's Collaborate live row, the editor's `collab` binding prop (shared with the playground, which is why that route moves too), and the hook that scrubs a `#live=` link from the address bar and decides whether to load anything.
Given back first: every piece of session code — Yjs, the CodeMirror binding, Tavola, Trystero, the controller, the Live panel, the lobby, the header pill and the preview-corner avatars — loads only when a session starts or a link is opened, which took this PR from +6918 to about +3300 bytes on the studio route.
