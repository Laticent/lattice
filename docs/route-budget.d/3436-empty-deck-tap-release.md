studio: +175

The start grid in StudioShell (StudioIsland's chunk) now arms a fallback on a touch `pointerup` that puts the caret when the tap's click never comes, because iOS Safari sometimes delivers a tap with no click; the fallback stands down on the click, on the next press anywhere, when the grid hides, and on unmount. CI measured +159 gzip bytes against main; the rest covers the gzip wobble a moved main can bring.
