// Test-only harness: mounts the REAL useReadAloud hook and exposes real <button> controls the
// Playwright nightly spec clicks (real gestures unlock the AudioContext) + a window.__RA state probe.
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { useReadAloud } from '@/components/studio/read-aloud';

const T1 = 'Revenue grew to four point two million dollars. We beat plan by eight points. Margins expanded nicely. The board approved the raise this quarter.';
const T2 = 'A completely different second slide. It has only two sentences.';
function Harness() {
  const [text, setText] = React.useState(T1);
  const [muted, setMuted] = React.useState(false);
  const [finished, setFinished] = React.useState(0);
  // debug:true surfaces `debugLive.mode` (audio vs. silent-estimate) so the spec can prove a mid-slide
  // unmute actually RESUMES the clocked audio path, not merely that the estimate ran to the end.
  const ra = useReadAloud(text, { muted, debug: true, onFinish: () => setFinished((f) => f + 1) });
  (window as unknown as { __RA: () => unknown }).__RA = () => ({ playing: ra.playing, rung: ra.rung, cue: ra.active ? ra.active.cueIndex : -1, word: ra.active ? ra.active.wordIndex : -1, progress: Math.round(ra.progress * 100), cues: ra.track.cues.length, finished, mode: ra.debugLive ? ra.debugLive.mode : null });
  const B = (id: string, on: () => void, label: string) => <button type="button" id={id} onClick={on}>{label}</button>;
  return (
    <div>
      {B('play', () => ra.play(), 'play')}
      {B('pause', () => ra.pause(), 'pause')}
      {B('stop', () => ra.stop(), 'stop')}
      {B('mute', () => setMuted(true), 'mute')}
      {B('unmute', () => setMuted(false), 'unmute')}
      {B('nav', () => setText((t) => (t === T1 ? T2 : T1)), 'nav')}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
