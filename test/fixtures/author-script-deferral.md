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
setTimeout(function () {
  var el = document.getElementById('late-target');
  if (el) el.textContent = 'LATE ARRIVED';
}, 400);
</script>
