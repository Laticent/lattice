/**
 * lib/core/settle-delay.js
 *
 * How long the runtime waits after a mutation burst before its content pass.
 *
 * THE WAIT HAS ONE JOB: coalescing. Marp re-renders a slide as a burst of mutations, and a typist's keys land
 * 100-250 ms apart; the pass is trailing-edge debounced so a run of keystrokes costs ONE `mermaid.render` on a
 * strictly serial queue instead of one each (lib/runtime/index.js, `DEBOUNCE_MS`). That reasoning is about
 * DIAGRAMS. A burst with no diagram waiting to be drawn has nothing to coalesce a render for, and the 150 ms was
 * simply added to every edit: measured on the built Studio, the last change in the preview frame landed 169 ms
 * after a prose keystroke on a desktop and 229 ms at 4x CPU, of which the host's own patch is done at 24 ms.
 *
 * SO THE RULE IS NARROW, and each half is load-bearing:
 *
 *   · `hostSwap`: only a swap the HOST stamped (`data-lattice-swap`, set by `patchSlideBody` and `patchSections`)
 *     may settle early. The host has already coalesced the burst on its side (the frame scheduler renders once
 *     per frame) and has already patched the DOM it is about to hand over; the runtime's own mutations, and any
 *     host that does not stamp (marp-vscode, an export), keep the full wait. An export never stamps, so this rule
 *     changes nothing it does.
 *   · no pending fence: a fence still waiting to be drawn (`data-lattice-settle="pending"`) is exactly what the
 *     wait is for. A flat cut of the wait made an eight-key burst into a diagram cost 8 renders instead of 1
 *     (engineering/decisions/2026-10-23-startup-bake-off.md E3), the failure `2026-09-06-diagram-edit-holds-the-last.md`
 *     §5 cut a second delay for. Navigating onto a cold diagram also lands here, with its fence pending, so
 *     navigation keeps the full wait too (that was the other half of what got the old second delay cut).
 *
 * It is a pure function of two booleans so the rule is pinned by a table, not by a source regex.
 * Measured with it (Studio, Chromium, medians): prose edit settles at 24 ms (was 169; 100 ms was 229 at 4x CPU);
 * edit / edit-burst / edit-broken / nav arms unchanged in blank, held and render counts; main-thread time per
 * prose keystroke unchanged (82 ms at 4x).
 *
 * @param {boolean} hostSwap        the document's `.lattice` carries the host's `data-lattice-swap` stamp
 * @param {boolean} pendingFence    some fence is still `data-lattice-settle="pending"`
 * @param {number}  debounceMs      the full wait
 * @returns {number} milliseconds to wait before the content pass
 */
function settleDelay(hostSwap, pendingFence, debounceMs) {
  return hostSwap && !pendingFence ? 0 : debounceMs;
}

module.exports = { settleDelay };
