/**
 * Whether handing focus back to `el` can raise a touch screen's software keyboard: `el` is editable
 * text and the pointer is coarse. A dialog or sheet that closes skips the hand-back then, and focus
 * stays with the page, as a tap elsewhere would leave it. Opened from Compose, a closing gallery put
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
if (typeof document !== "undefined") {
  document.addEventListener("keydown", (e) => { if (!e.isComposing) viaKeyboard = true }, true)
  document.addEventListener("pointerdown", () => { viaKeyboard = false }, true)
}

/** For tests: forget the last input. */
export function resetLastInput(): void {
  viaKeyboard = false
}

function isTextField(el: HTMLElement): boolean {
  if (el.isContentEditable || el.closest('[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]')) return true
  if (el instanceof HTMLTextAreaElement) return !el.readOnly
  return el instanceof HTMLInputElement && !el.readOnly && !/^(button|checkbox|color|file|hidden|image|radio|range|reset|submit)$/.test(el.type)
}

function finePointer(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(hover: hover) and (pointer: fine)").matches
}
