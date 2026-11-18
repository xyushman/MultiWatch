import { computed, ref } from 'vue';

/**
 * Best-effort "always active" mode.
 *
 * A web page cannot force its window to stay focused or on top, and it cannot
 * stop the browser from throttling a hidden tab. What it *can* do is:
 *   1. hold a Screen Wake Lock so the display does not sleep;
 *   2. play a near-silent audio loop so the tab is treated as "playing audio"
 *      and is less likely to be frozen/discarded by the browser;
 *   3. re-acquire the wake lock whenever the tab becomes visible again.
 *
 * Browsers may still pause video in hidden tabs — keep this window visible.
 */

const STORAGE_KEY = 'multiwatch_keep_awake';

const wakeLockSupported =
  typeof navigator !== 'undefined' && 'wakeLock' in navigator;

const audioSupported =
  typeof window !== 'undefined' &&
  Boolean(window.AudioContext || window.webkitAudioContext);

const enabled = ref(readBool());
const wakeLockActive = ref(false);
const audioActive = ref(false);
const error = ref('');

let wakeLock = null;
let audioCtx = null;
let oscillator = null;
let listenersBound = false;
let initialized = false;

function readBool() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // Default to ON: "always active" is the point of this mode. Users who
    // explicitly turned it off stay off.
    if (raw === null) return true;
    return raw === '1';
  } catch {
    return true;
  }
}

function persist(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch { /* storage unavailable */ }
}

function startAudio() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;

    if (!audioCtx) {
      audioCtx = new AudioCtor();
      audioCtx.onstatechange = () => {
        audioActive.value = audioCtx?.state === 'running';
        // Browsers sometimes suspend the context when the tab is hidden. Try
        // to bring it back so the tab stays in the "playing audio" set and is
        // less likely to be frozen.
        if (audioCtx?.state === 'suspended' && enabled.value) {
          audioCtx.resume().catch(() => {});
        }
      };
    }

    // Autoplay policies usually start the context suspended. Calling resume()
    // from a user gesture (or again later) is what actually starts it.
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});

    if (!oscillator) {
      // 30 Hz at a tiny gain: inaudible, but keeps the tab in the
      // "playing audio" state so browsers are less aggressive about freezing it.
      oscillator = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.value = 0.00001;
      oscillator.frequency.value = 30;
      oscillator.connect(gain).connect(audioCtx.destination);
      oscillator.start();
    }

    audioActive.value = audioCtx.state === 'running';
  } catch (e) {
    audioActive.value = false;
    error.value = e?.message || 'Silent keep-alive audio could not start.';
  }
}

function stopAudio() {
  try { oscillator?.stop(); } catch { /* already stopped */ }
  oscillator = null;
  try { audioCtx?.close(); } catch { /* already closed */ }
  audioCtx = null;
  audioActive.value = false;
}

async function acquireWakeLock() {
  if (!enabled.value) return;
  if (!wakeLockSupported) {
    error.value = 'Screen Wake Lock is not supported in this browser.';
    return;
  }
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return;
  }
  // Do not stack wake locks when the tab becomes visible repeatedly.
  if (wakeLock && wakeLockActive.value) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLockActive.value = true;
    error.value = '';
    wakeLock.addEventListener('release', () => {
      wakeLockActive.value = false;
    });
  } catch (e) {
    wakeLockActive.value = false;
    error.value = e?.message || 'Screen Wake Lock was refused by the browser.';
  }
}

function releaseWakeLock() {
  try { wakeLock?.release(); } catch { /* already released */ }
  wakeLock = null;
  wakeLockActive.value = false;
}

function onVisibilityChange() {
  if (!enabled.value) return;
  if (document.visibilityState === 'visible') {
    startAudio();
    acquireWakeLock();
  } else {
    // The browser releases screen wake locks when the page is hidden.
    wakeLockActive.value = false;
    // Keep the silent audio alive while hidden; a tab that is playing audio is
    // far less likely to be frozen or discarded by the browser.
    startAudio();
  }
}

function bindListeners() {
  if (listenersBound || typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', onVisibilityChange);
  // A virtual-desktop switch can blur the window without changing the tab's
  // visibility. Keep the keep-alive audio alive in that case too.
  window.addEventListener('blur', onWindowBlur);
  window.addEventListener('focus', onWindowFocus);
  window.addEventListener('pagehide', releaseWakeLock);
  listenersBound = true;
}

function onWindowBlur() {
  if (!enabled.value) return;
  startAudio();
}

function onWindowFocus() {
  if (!enabled.value) return;
  startAudio();
  acquireWakeLock();
}

// Wake locks and audio contexts need a user gesture in most browsers. Until
// the first click/keypress, keep a one-shot listener ready so "always active"
// arms itself as soon as the user interacts with the page.
let gestureBound = false;

function unbindGesture() {
  if (!gestureBound || typeof window === 'undefined') return;
  window.removeEventListener('pointerdown', onFirstGesture);
  window.removeEventListener('keydown', onFirstGesture);
  gestureBound = false;
}

function onFirstGesture() {
  if (!enabled.value) {
    unbindGesture();
    return;
  }
  startAudio();
  acquireWakeLock().then(() => {
    // Stay armed until the audio context is actually running: a granted wake
    // lock alone does not keep the tab out of the browser's frozen set.
    if (audioActive.value || !audioSupported) {
      unbindGesture();
    }
  });
}

function bindGesture() {
  if (gestureBound || typeof window === 'undefined') return;
  if (audioActive.value || !audioSupported) return;
  window.addEventListener('pointerdown', onFirstGesture, { passive: true });
  window.addEventListener('keydown', onFirstGesture);
  gestureBound = true;
}

async function enable() {
  enabled.value = true;
  persist(true);
  startAudio();
  await acquireWakeLock();
  if (audioActive.value || !audioSupported) unbindGesture();
  else bindGesture();
}

function disable() {
  enabled.value = false;
  persist(false);
  stopAudio();
  releaseWakeLock();
  unbindGesture();
  error.value = '';
}

async function toggle() {
  if (enabled.value) disable();
  else await enable();
}

function init() {
  if (initialized) return;
  initialized = true;
  bindListeners();
  if (enabled.value) {
    // Try immediately; keep retrying on every visibility change so the audio
    // context is running as soon as the browser allows it. The gesture listener
    // remains as a fallback for browsers that require one.
    startAudio();
    acquireWakeLock().then(() => bindGesture());
    document.addEventListener('visibilitychange', onKeepAwakeVisibility);
  }
}

function onKeepAwakeVisibility() {
  if (!enabled.value) return;
  if (document.visibilityState === 'visible') {
    startAudio();
    acquireWakeLock();
  }
}

const active = computed(
  () => enabled.value && (wakeLockActive.value || audioActive.value)
);

export function useKeepAwake() {
  return {
    enabled,
    active,
    wakeLockActive,
    audioActive,
    wakeLockSupported,
    error,
    init,
    enable,
    disable,
    toggle,
  };
}
