// Runs the device profile's CPU probe off the main thread and posts back its score: the probe is about 140 ms of
// deliberate work (device-capability-tiers.md §3.2), so it never runs on the page's own thread at load.
import { runCpuProbe } from './device-profile';

postMessage(runCpuProbe({ now: () => performance.now() }).score);
