studio: +110

The start grid in StudioShell (StudioIsland's chunk) now puts the caret on a touch `pointerup`, because iOS Safari sometimes delivers a tap with no click, and skips the click that follows within 800 ms. CI measured +96 gzip bytes against main; the extra 14 cover the gzip wobble a rebase onto a moved main can bring.
