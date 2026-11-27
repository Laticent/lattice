studio: +94
playground: +94

The toaster now picks its place by width (ui/sonner.tsx `usePlace`, one matchMedia listener): toasts that leave on
their own stand at the top below 1024px, where they no longer cover a sheet's or a panel's buttons at the bottom (the
owner's call on PR 3559, after a Share failure saying "try again" covered the Share sheet's Download button on a
phone). `notify` gained a per-message `position`, and `notifySticky` raises at the bottom, so a notice that never leaves
does not sit over the top bar. Given back first: the hook reads the breakpoint only in its effect (no synchronous first
read, no optional chaining), 16 gzip bytes off `lazy-panel`. CI measured +94 on each route before that trim and the
sticky placement (+88 `lazy-panel`, +6 `notify`); measured locally after them, about +89.
