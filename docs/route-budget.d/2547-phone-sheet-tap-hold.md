studio: +420
playground: +380
home: +380
getting-started: +80
`useSheetTapHold` (docs/src/components/ui/panel.tsx) holds a phone sheet still from the press until the click lands, so a tap after typing reaches the control under the finger (followup 2547-p2). It lives in the shared panel module because every phone sheet needs it, and that module is in the chunk every route loads eagerly, which is why the same bytes show on all four routes. Measured in CI against main 3380d79: studio +352, playground +319, home +319, getting-started +19 owed (palette-label chunk +315 B gz, the hook plus its four listeners); the declared figures leave room for gzip spread. Nothing to give back without making a primitive lazy that every phone sheet calls on open.
