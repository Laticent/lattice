studio: +218
home: +188
playground: +70
A preview whose slide engine fails to load now shows the failure card and a working Retry instead of an endless skeleton. DeckPreview catches the rejected `whenReady()`, says why in one sentence (or, over a slide the newcomer bake already painted, a one-row bar that keeps the slide in view), and resets its split-page state. `load-engine.ts` retries a failed import under `?retry=N`, because the browser caches the failure; it rides the shared chunk the Playground loads too. DeckPreview is eager on the Studio and the landing page because both render live slides on load.
