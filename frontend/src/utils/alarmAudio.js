// Alarm audio for the critical-alert system.
//
// Everything is synthesised with the Web Audio API, so there are no audio assets
// to ship. Browsers refuse to start audio before a user gesture, so the context is
// created lazily and `unlock()` is called from the first click or keypress. An alarm
// that fires before that stays queued and sounds as soon as the context resumes.

const TONE_HI = 960; // Hz, alternating two-tone siren
const TONE_LO = 720;
const TONE_LEN = 0.34; // seconds per tone
const LOOKAHEAD = 0.7; // seconds of tones scheduled ahead of the clock
const SIREN_LEVEL = 0.28;

let ctx = null;
let siren = null; // { master, timer, next, high }
const listeners = new Set();

const AudioCtor = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;

function ensureContext() {
  if (!AudioCtor) return null;
  if (!ctx) {
    ctx = new AudioCtor();
    ctx.onstatechange = () => listeners.forEach((fn) => fn(getState()));
  }
  return ctx;
}

/** 'unsupported' | 'idle' (no context yet) | 'blocked' (suspended) | 'ready' */
export function getState() {
  if (!AudioCtor) return 'unsupported';
  if (!ctx) return 'idle';
  return ctx.state === 'running' ? 'ready' : 'blocked';
}

export function onStateChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Call from a user gesture. Safe to call repeatedly. */
export async function unlock() {
  const c = ensureContext();
  if (!c) return getState();
  if (c.state !== 'running') {
    try { await c.resume(); } catch { /* still blocked; the next gesture retries */ }
  }
  listeners.forEach((fn) => fn(getState()));
  return getState();
}

function scheduleTone(c, master, when, freq) {
  const osc = c.createOscillator();
  const env = c.createGain();
  const lp = c.createBiquadFilter();
  osc.type = 'square';
  osc.frequency.value = freq;
  lp.type = 'lowpass';
  lp.frequency.value = 2400; // takes the buzz off the square wave without dulling it
  // Short ramps stop the click at each tone edge.
  env.gain.setValueAtTime(0.0001, when);
  env.gain.linearRampToValueAtTime(1, when + 0.012);
  env.gain.setValueAtTime(1, when + TONE_LEN - 0.03);
  env.gain.linearRampToValueAtTime(0.0001, when + TONE_LEN - 0.004);
  osc.connect(lp).connect(env).connect(master);
  osc.start(when);
  osc.stop(when + TONE_LEN);
}

/** Start the looping critical siren. No-op if it is already sounding. */
export function startSiren() {
  if (siren) return;
  const c = ensureContext();
  if (!c) return;
  if (c.state !== 'running') c.resume().catch(() => {});

  const master = c.createGain();
  master.gain.value = SIREN_LEVEL;
  master.connect(c.destination);

  const s = { master, timer: null, next: c.currentTime + 0.05, high: true };
  const pump = () => {
    // The clock does not advance while the context is suspended, so nothing piles up.
    while (s.next < c.currentTime + LOOKAHEAD) {
      scheduleTone(c, master, s.next, s.high ? TONE_HI : TONE_LO);
      s.next += TONE_LEN;
      s.high = !s.high;
    }
  };
  pump();
  s.timer = setInterval(pump, 200);
  siren = s;
}

export function stopSiren() {
  if (!siren) return;
  const { master, timer } = siren;
  siren = null;
  clearInterval(timer);
  // Fade rather than cut so the tail does not pop.
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(0.0001, now + 0.06);
  setTimeout(() => master.disconnect(), 150);
}

/** Cockpit-style spoken callout. Silently does nothing where speech is unavailable. */
export function speak(text) {
  try {
    const synth = window.speechSynthesis;
    if (!synth || !text) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.98;
    u.pitch = 0.9;
    u.volume = 1;
    synth.speak(u);
  } catch { /* speech is an extra; the siren is the alarm */ }
}

export function cancelSpeech() {
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}

/** Short siren burst + callout so an operator can check volume before a sortie. */
export async function testAlarm() {
  await unlock();
  startSiren();
  speak('Alarm test. Critical engine alert.');
  setTimeout(() => {
    stopSiren();
  }, 2200);
}
