studio: +1600
playground: +127
home: +27
The Studio's live lint, the shared inline-code dispatcher and the plugin door grew, in three parts. The journey
change, the `@kind{…}` row and step 2's `@` autocomplete and `unknown-inline-kind` rule are 1,279 bytes on the Studio,
as CI measured them. Step 3 (a zip plugin's inline kinds: the door's state in door.ts, the consent strip's and Plugins
tab's wording, the lint core's missing-plugin branch) adds 316, measured locally against the same build without it;
the total is rounded up by 5 because a local and a CI measurement of one build differed by 10 bytes before. The
playground and home figures are local measurements: they carry the dispatcher and lint core the Studio does. Nothing
to give back: each piece is a rule, a table row or a line of state the editor runs on every keystroke.
