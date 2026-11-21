studio: +372
home: +331
playground: +75
A preview whose slide engine fails to load now shows the failure card and a working Retry instead of an endless skeleton. DeckPreview catches the rejected `whenReady()`, says why in one sentence (or, over a slide the newcomer bake already painted, a one-row bar that keeps the slide in view), and resets its split-page state. `load-engine.ts` retries a failed import under `?retry=N`, because the browser caches the failure; it rides the shared chunk the Playground loads too. DeckPreview is eager on the Studio and the landing page because both render live slides on load.

After a failed Retry the card offers Reload, because a failed engine sub-file stays failed until the page reloads (a new tab in WebKit), and a slide that reveals after the failure turns the card into the bar: DeckPreview grew 273 gzip bytes in all, 138 of them for these two. The figures are CI's, measured against main at b98392e.
