studio: +60
home: +60
A preview whose slide engine fails to load now shows the failure card and Retry instead of an endless skeleton: DeckPreview catches the rejected `whenReady()` (a try, one sentence for the card, a `console.warn`, and the split-page reset a failed render already does). DeckPreview is eager on both routes because the Studio's preview and the landing page's live slides render on load.
