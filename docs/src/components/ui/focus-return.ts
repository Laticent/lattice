/**
 * Whether handing focus back to `el` would raise a touch screen's software keyboard: `el` is editable
 * text and the pointer is coarse. A dialog or sheet that closes skips the hand-back then, and focus
 * stays with the page, as a tap elsewhere would leave it. Opened from Compose, a closing gallery put
 * the keyboard back up after every insert (#3150; followups.d/2927-p18). A mouse has no keyboard to
 * raise and still gets its caret back. Shared by `PersistentSurface` and `SheetContent`.
 */
export function raisesTouchKeyboard(el: HTMLElement): boolean {
  return isTextField(el) && !finePointer()
}

function isTextField(el: HTMLElement): boolean {
  if (el.isContentEditable || el.closest('[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]')) return true
  if (el instanceof HTMLTextAreaElement) return !el.readOnly
  return el instanceof HTMLInputElement && !el.readOnly && !/^(button|checkbox|color|file|hidden|image|radio|range|reset|submit)$/.test(el.type)
}

function finePointer(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(hover: hover) and (pointer: fine)").matches
}
