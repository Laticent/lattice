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
let tappedAt = Number.NEGATIVE_INFINITY
if (typeof document !== "undefined") {
  document.addEventListener("keydown", (e) => {
    if (e.isComposing) return
    viaKeyboard = true
    lastTapped = null
  }, true)
  document.addEventListener("pointerdown", (e) => {
    viaKeyboard = false
    tappedAt = performance.now()
    const t = e.target instanceof Element ? e.target.closest('button, a[href], [role="button"]') : null
    lastTapped = t instanceof HTMLElement ? t : null
  }, true)
}

/**
 * The control a sheet was opened from, read when it opens: the control the last tap landed on, only when that tap is
 * the one that opened it. A key since the tap (a keyboard open) clears it, and a sheet that opens itself from code
 * well after a tap does not inherit it (the checker on #3150). A lazy sheet that opens more than a second after its
 * tap falls back to the page, the behavior before the launcher was recorded.
 */
export function tappedLauncher(): HTMLElement | null {
  return lastTapped && performance.now() - tappedAt < 1000 ? lastTapped : null
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

/** Where the caret was, as the selection's two ends, and the text each end sat in when it was taken. */
export type Caret = { anchor: Node; anchorOffset: number; focus: Node; focusOffset: number; anchorText: string | null; focusText: string | null }

/**
 * The caret inside `el` when a sheet opens over it, so the close can give it back: the page's selection, when `el` is
 * editable text (`contenteditable`) and holds both of its ends, else null. An input or a textarea keeps its own
 * selection and needs none.
 *
 * WHY. A sheet that takes focus (the gallery's search field) takes the page's selection with it, so refocusing an
 * editor on close finds no caret inside. The browser then puts one at the start of the text, and ProseMirror puts its
 * own back only when that reset arrives within 200 ms of the focus event (prosemirror-view `DOMObserver.flush`; CodeMirror
 * has the same window). On a loaded machine it arrives later and the author's caret jumps to the first slide
 * (compose-stress.spec.ts, closing the add-slide gallery, red under a 4-worker desktop run).
 *
 * The ends are kept as nodes and offsets, not as a `Range`: a Range is live, and when its text is rewritten the browser
 * moves it to a surviving parent, so it would always look valid. The text each end sat in is kept to tell.
 */
export function caretWithin(el: HTMLElement | null): Caret | null {
  if (!el?.isContentEditable) return null
  const sel = typeof getSelection === "function" ? getSelection() : null
  if (!sel?.anchorNode || !sel.focusNode || !el.contains(sel.anchorNode) || !el.contains(sel.focusNode)) return null
  return {
    anchor: sel.anchorNode,
    anchorOffset: sel.anchorOffset,
    focus: sel.focusNode,
    focusOffset: sel.focusOffset,
    anchorText: sel.anchorNode.textContent,
    focusText: sel.focusNode.textContent,
  }
}

/**
 * Give focus back to `el`, with the caret `caretWithin` took when the sheet opened, in the same task. The
 * `selectionchange` that follows then reads the author's caret, not the browser's reset, however late it is handled.
 * Direction is kept (anchor and focus, not start and end). A caret whose text changed while the sheet was open (an edit,
 * a re-render) is not put back: the editor's own mapping, through its 200 ms window, is the better guess then.
 */
export function returnFocus(el: HTMLElement, caret: Caret | null): void {
  el.focus({ preventScroll: true })
  if (!caret || document.activeElement !== el) return
  const same = (n: Node, text: string | null) => n.isConnected && el.contains(n) && n.textContent === text
  if (!same(caret.anchor, caret.anchorText) || !same(caret.focus, caret.focusText)) return
  getSelection()?.setBaseAndExtent(caret.anchor, caret.anchorOffset, caret.focus, caret.focusOffset)
}

/** For tests: forget the last input. */
export function resetLastInput(): void {
  viaKeyboard = false
  lastTapped = null
  tappedAt = Number.NEGATIVE_INFINITY
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
