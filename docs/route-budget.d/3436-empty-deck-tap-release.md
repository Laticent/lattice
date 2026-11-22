studio: +140

The start grid in StudioShell (StudioIsland's chunk) now arms a fallback on a touch `pointerup` that puts the caret when the tap's click never comes, because iOS Safari sometimes delivers a tap with no click. CI measured +96 gzip bytes for an earlier version of the handler; the declaration covers this one and the gzip wobble a moved main can bring.
