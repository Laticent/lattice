/**
 * Whether handing focus back to `el` can raise a touch screen's software keyboard: `el` is editable
 * text and the pointer is coarse. A dialog or sheet that closes skips the hand-back then, and focus
 * goes to the control that opened it (`focusLauncher`), or stays with the page when that is gone. Opened from Compose, a closing gallery put
 * focus back in the editor after every insert (#3150; followups.d/2927-p18). A mouse has no keyboard to
 * raise and still gets its caret back, and so does a close made from a hardware keyboard (the last
 * input a key, not a tap). Shared by `PersistentSurface` and `SheetContent`.
 */
export function raisesTouchKeyboard(el: HTMLElement): boolean {
  return !viaKeyboard && isTextField(el) && !finePointer()
}

// Was the last input a key? An iPad with a hardware keyboard reports a coarse pointer but raises no software keyboard,
// and its author closing a sheet with Escape expects the caret back (the checker on #3150). A tap clears it.
let viaKeyboard = false
// The control the last tap landed on: the launcher of a sheet opened by a tap.
let lastTapped: HTMLElement | null = null
if (typeof document !== "undefined") {
  document.addEventListener("keydown", (e) => { if (!e.isComposing) viaKeyboard = true }, true)
  document.addEventListener("pointerdown", (e) => {
    viaKeyboard = false
    const t = e.target instanceof Element ? e.target.closest('button, a[href], [role="button"]') : null
    lastTapped = t instanceof HTMLElement ? t : null
  }, true)
}

/** The control a sheet was opened from, read when it opens: the last control tapped, if any. */
export function tappedLauncher(): HTMLElement | null {
  return lastTapped
}

/**
 * Where focus goes when `raisesTouchKeyboard` skipped the hand-back: the control that opened the sheet, which raises no
 * keyboard and keeps a screen reader's place (the checker on #3150), when it is still on the page. Returns false when
 * there is none, and the caller leaves focus with the page.
 */
export function focusLauncher(launcher: HTMLElement | null): boolean {
  if (!launcher?.isConnected || isTextField(launcher)) return false
  launcher.focus({ preventScroll: true })
  return document.activeElement === launcher
}

/** For tests: forget the last input. */
export function resetLastInput(): void {
  viaKeyboard = false
  lastTapped = null
}

function isTextField(el: HTMLElement): boolean {
  // The nearest `contenteditable` decides: a button in Compose's slide bar (`contenteditable=false`) inside the editor is
  // not text. (`isContentEditable` says the same in a browser; the walk also serves jsdom, which lacks it.)
  const host = el.closest("[contenteditable]")
  if (el.isContentEditable || (host && host.getAttribute("contenteditable") !== "false")) return true
  if (el instanceof HTMLTextAreaElement) return !el.readOnly
  return el instanceof HTMLInputElement && !el.readOnly && !/^(button|checkbox|color|file|hidden|image|radio|range|reset|submit)$/.test(el.type)
}

function finePointer(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(hover: hover) and (pointer: fine)").matches
}
