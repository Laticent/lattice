// How long a Studio toast stays on screen.
//
// The default is deliberately short: a confirmation ("PDF ready.") has nothing in it
// to act on, and a notice that lingers is a notice in the way.
//
// A DEGRADATION is the exception, and the reason this constant is shared rather than
// inlined. It names a file path the author has to go and fix, and it is the ONLY
// record that the export shipped something lesser — the progress line it was
// announced on is gone by the time the file lands. At 2.6 s, on the case that
// motivates it (a long export, the author working in another tab), it is gone before
// they look, which would make the whole "tell them" half of the degradation design
// decorative. Long enough to come back to, short enough to still be a toast.
export const DEGRADED_TOAST_MS = 15_000;
