// Test-only stub voice-model for the read-aloud transport-edge nightly harness. Only the BYTE SOURCE
// is faked (synthOne → a real 220ms WAV); everything downstream — the Suono stage/sequence, the hook's
// RAF + Cadenza reader + the real AudioContext decode/play/clock — is the REAL production code. These
// edges exercise the HOOK's state machine (pause/resume/barge-in/mute/nav/synth-failed), not TTS, so
// stubbing the byte source is correct. `window.__FAIL` makes synthOne return null bytes to exercise
// the synth-failed → silent-estimate fallback.
function wav(ms, rate = 24000, freq = 440) {
  const n = Math.floor((rate * ms) / 1000), dataLen = n * 2;
  const buf = new ArrayBuffer(44 + dataLen), dv = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0,'RIFF');dv.setUint32(4,36+dataLen,true);w(8,'WAVE');w(12,'fmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);
  dv.setUint32(24,rate,true);dv.setUint32(28,rate*2,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);w(36,'data');dv.setUint32(40,dataLen,true);
  for (let i=0;i<n;i++) dv.setInt16(44+i*2, 0.2*Math.sin(2*Math.PI*freq*i/rate)*0x7fff, true);
  return { size: buf.byteLength, type: 'audio/wav', arrayBuffer: async () => buf.slice(0) };
}
export function createVoiceModel() {
  return { synthOne: async ({ text }) => ({ rung: 'openrouter-tts', bytes: (globalThis.__FAIL || !text) ? null : wav(220), key: text }),
    speakThis: async () => {}, rung: () => 'openrouter-tts', unlock(){}, warm(){}, stop(){}, pause(){}, resume(){},
    availability: () => ({ rung:'openrouter-tts', openRouterReady:true, kokoroReady:false, kokoroCached:false, kokoroSupported:false, webgpu:false, speechAllowed:false }),
    orModel:()=>'m', orVoice:()=>'v', kokoroVoice:()=>'kv', speedPref:()=>1, audioTimeMs:()=>0, audioState:()=>'none', outputLatencyMs:()=>0,
    setOrVoice(){},setOrModel(){},setKokoroVoice(){},setSpeed(){}, previewVoice: async()=>({ok:true}), loadKokoro: async()=>false, probeKokoroCache: async()=>false, kokoroSupported:()=>false };
}
export function listOpenRouterVoiceModels(){ return Promise.resolve([]); }
export function MockRung(){ return { name:'mock', ready:()=>true, calls:[], async synth(){ return wav(220); } }; }
