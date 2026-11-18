import { ref } from 'vue';

/**
 * Playback nudge for backgrounded tabs.
 *
 * Browsers may pause a player when the tab is hidden, when the window loses
 * focus, or when Windows moves it to another virtual desktop. This composable
 * periodically bumps `resumeToken`; VideoPanel uses it to ask the player to
 * continue — NOT to re-create the iframe. Re-creating a player restarts the
 * video and looks like the whole site reloaded, which is exactly what we want
 * to avoid when switching desktops or apps.
 *
 * Switching Windows virtual desktops does not always fire `visibilitychange`,
 * so this also watches `blur`/`focus` and keeps nudging while the window is
 * unfocused. The interval is best effort: a frozen tab cannot run timers, and
 * no web page can force Chrome to keep a discarded tab alive. Keep-alive audio
 * plus the launcher (scripts/start-multiwatch.ps1) are what make background
 * playback reliable.
 *
 * There is deliberately no player reload here: the video keeps running until
 * the user changes it. Use Stream rotation if a scheduled refresh is wanted.
 */

const NUDGE_MS = 10_000; // ask backgrounded players to continue every 10s

const resumeToken = ref(0);
let hiddenAt = 0;
let blurredAt = 0;
let watchdogTimer = null;
let initialized = false;

function bump() {
  resumeToken.value += 1;
}

function keepPlaying() {
  if (typeof document === 'undefined') return false;
  // `hidden` covers a background tab; `!hasFocus()` covers another desktop or
  // application where the tab can still report itself as "visible".
  return document.visibilityState === 'hidden' || !document.hasFocus();
}

function stopWatchdog() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

function startWatchdog() {
  stopWatchdog();
  watchdogTimer = setInterval(() => {
    if (keepPlaying()) bump();
  }, NUDGE_MS);
}

function onVisibilityChange() {
  if (typeof document === 'undefined') return;
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    startWatchdog();
    bump(); // resume immediately, not 10s later
    return;
  }
  stopWatchdog();
  if (hiddenAt && Date.now() - hiddenAt > 1000) bump();
  hiddenAt = 0;
  // The window can still be unfocused after the tab becomes visible again.
  if (!document.hasFocus()) startWatchdog();
}

function onBlur() {
  if (typeof document === 'undefined') return;
  blurredAt = Date.now();
  startWatchdog();
  bump();
}

function onFocus() {
  stopWatchdog();
  if (blurredAt && Date.now() - blurredAt > 1000) bump();
  blurredAt = 0;
}

function onPageShow(event) {
  // Restored from the back/forward cache: the script did not re-run, but the
  // page may have been frozen while away. Ask players to continue, not reload.
  if (event.persisted) bump();
}

function onResume() {
  // Page Lifecycle API: the browser unfroze the page. Continue in place.
  bump();
}

function init() {
  if (initialized || typeof document === 'undefined') return;
  initialized = true;
  document.addEventListener('visibilitychange', onVisibilityChange);
  document.addEventListener('resume', onResume);
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  window.addEventListener('pageshow', onPageShow);
  if (keepPlaying()) startWatchdog();
}

export function useResume() {
  return { resumeToken, init };
}
