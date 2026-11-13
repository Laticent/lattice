studio: +178
home: +34

Studio: the fix for the multi-second freeze after a deck of pasted phone photos goes into the editor. StudioIsland (+90) carries the editor's large-insert handler and its photo-chip state field, plus `ReshapePicker`'s tiles split into a child component built only when the popover opens. The slide-metadata readers (+54 in the chunk holding `meta-edit`/`meta-record`, +34 in `comment-directive`, which the home route shares) gain the size bound that stops them copying and hashing a 4.5 MB photo slide as a cache key. Measured on a three-photo deck: 34.7 s of main-thread long tasks fell to 4.7 s.
