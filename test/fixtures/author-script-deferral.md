---
theme: indaco
title: Author script deferral
---

<!-- _class: title -->

# Author script deferral

A fixture for #1792

---

## Synchronous script lands

<div id="sync-target">placeholder</div>

<script>
document.getElementById('sync-target').textContent = 'SYNC LANDED';
</script>

---

## Deferred script does not

<div id="late-target">placeholder</div>

<script>
// WHY TEN MINUTES, AND WHY IT MUST NOT BE "TIDIED" BACK DOWN. #1835.
//
// This delay is not a realistic author animation — it is the thing that makes the
// suite's verdict independent of runner load. The assertion is that this timer has
// NOT fired when the export captures, so the test is only sound while
// delay >> the script-start-to-capture window.
//
// That window was MEASURED, not assumed (#1835): 125 ms, 245 ms and 335 ms across
// three runs on an IDLE sandbox. Against the original 400 ms that is 65 ms of
// headroom in the worst of three, with 210 ms of spread on a machine doing nothing
// else — so a loaded merge-queue runner crossed it and ejected #1824.
//
// Ten minutes is chosen against the SUITE's own 120 s timeout rather than against a
// measured window, which is what makes it structural instead of a wider tolerance:
// for this timer to win, the render would have to take longer to reach capture than
// the test is allowed to run at all. Load can no longer decide the outcome — a
// pathological render fails loudly as a timeout, never quietly as a wrong assertion.
setTimeout(function () {
  var el = document.getElementById('late-target');
  if (el) el.textContent = 'LATE ARRIVED';
}, 600000);
</script>
