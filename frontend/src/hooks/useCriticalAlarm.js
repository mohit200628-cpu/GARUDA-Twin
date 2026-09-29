import { useCallback, useEffect, useRef, useState } from 'react';
import * as audio from '../utils/alarmAudio';
import { voiceLine } from '../utils/playbooks';

// A critical flag that drops out for less than this is treated as the same episode,
// so a noisy threshold cannot re-open the pop-up over and over.
const CLEAR_DEBOUNCE_MS = 3000;
const VOICE_FIRST_MS = 1200;
const VOICE_REPEAT_MS = 9000;
const CLEARED_NOTICE_MS = 6000;
const MUTE_KEY = 'garuda.alarm.muted';

function readMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

/**
 * Drives the critical-alert pop-up and alarm.
 *
 * An episode starts when severity becomes CRITICAL. The pop-up opens and the alarm
 * sounds until the operator acknowledges. Acknowledging silences it but keeps the
 * episode open, so a persistent banner remains. A root-cause code not seen earlier in
 * the episode re-opens the pop-up and re-sounds the alarm. The episode ends once
 * severity has stayed below CRITICAL for CLEAR_DEBOUNCE_MS.
 */
export function useCriticalAlarm({ severity, rootCauses }) {
  const isCritical = severity === 'CRITICAL';
  const codes = (rootCauses || []).map((c) => c.code).sort().join('|');

  const [active, setActive] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const [episode, setEpisode] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [clearedAt, setClearedAt] = useState(null);
  const [muted, setMutedState] = useState(readMuted);
  const [audioState, setAudioState] = useState(audio.getState());

  const seenCodes = useRef(new Set());
  const clearTimer = useRef(null);
  const activeRef = useRef(false);
  const causesRef = useRef(rootCauses);
  causesRef.current = rootCauses;

  // Start, re-alert and end episodes.
  useEffect(() => {
    if (isCritical) {
      clearTimeout(clearTimer.current);
      clearTimer.current = null;

      const current = codes ? codes.split('|') : [];
      const fresh = current.filter((c) => !seenCodes.current.has(c));
      const starting = !activeRef.current;

      if (starting) {
        activeRef.current = true;
        seenCodes.current = new Set();
        setActive(true);
        setStartedAt(Date.now());
        setEpisode((e) => e + 1);
        setClearedAt(null);
      }
      // `starting` covers a critical with no diagnosed cause yet; `fresh` covers a new fault.
      if (starting || fresh.length) {
        current.forEach((c) => seenCodes.current.add(c));
        setAcknowledged(false);
        setPopupOpen(true);
      }
    } else if (activeRef.current && !clearTimer.current) {
      clearTimer.current = setTimeout(() => {
        clearTimer.current = null;
        activeRef.current = false;
        seenCodes.current = new Set();
        setActive(false);
        setAcknowledged(false);
        setPopupOpen(false);
        setClearedAt(Date.now());
      }, CLEAR_DEBOUNCE_MS);
    }
  }, [isCritical, codes]);

  useEffect(() => () => clearTimeout(clearTimer.current), []);

  // Clock for the "critical for mm:ss" readouts.
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  // Auto-hide the "cleared" notice.
  useEffect(() => {
    if (!clearedAt) return undefined;
    const id = setTimeout(() => setClearedAt(null), CLEARED_NOTICE_MS);
    return () => clearTimeout(id);
  }, [clearedAt]);

  // Siren and voice run while an episode is unacknowledged.
  const ringing = active && !acknowledged;
  useEffect(() => {
    if (!ringing || muted) return undefined;
    audio.startSiren();
    const speakNow = () => audio.speak(voiceLine(causesRef.current));
    const first = setTimeout(speakNow, VOICE_FIRST_MS);
    const repeat = setInterval(speakNow, VOICE_REPEAT_MS);
    return () => {
      clearTimeout(first);
      clearInterval(repeat);
      audio.stopSiren();
      audio.cancelSpeech();
    };
  }, [ringing, muted]);

  // Browsers block audio until a gesture, so unlock on the first click or keypress.
  useEffect(() => {
    const off = audio.onStateChange(setAudioState);
    const unlock = () => {
      audio.unlock().then(setAudioState);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      off();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Flash the tab title so an alarm is visible from another tab.
  useEffect(() => {
    if (!ringing) return undefined;
    const original = document.title;
    let on = false;
    const id = setInterval(() => {
      on = !on;
      document.title = on ? '\u{1F534} CRITICAL ENGINE ALERT' : original;
    }, 900);
    return () => {
      clearInterval(id);
      document.title = original;
    };
  }, [ringing]);

  const acknowledge = useCallback(() => {
    setAcknowledged(true);
    setPopupOpen(false);
  }, []);

  const reopen = useCallback(() => setPopupOpen(true), []);

  const setMuted = useCallback((next) => {
    setMutedState(next);
    try { localStorage.setItem(MUTE_KEY, next ? '1' : '0'); } catch { /* not persisted */ }
  }, []);

  const enableAudio = useCallback(() => audio.unlock().then(setAudioState), []);
  const testAlarm = useCallback(() => audio.testAlarm().then(() => setAudioState(audio.getState())), []);

  return {
    active,
    ringing,
    acknowledged,
    popupOpen,
    episode,
    elapsedS: active && startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0,
    clearedAt,
    muted,
    setMuted,
    audioState,
    audioBlocked: ringing && !muted && audioState !== 'ready',
    enableAudio,
    testAlarm,
    acknowledge,
    reopen,
  };
}
