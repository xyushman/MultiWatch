import { ref, watch } from 'vue';

/**
 * Syncs the wall to a server so it survives reboots and follows you across
 * devices.
 *
 * Only the "broadcast" state is shared - the source URL, screen count, mirror
 * mode and layout. Nothing personal, no history.
 *
 * Contribution model: the server is authoritative once it holds a state. On
 * load the page adopts it; local changes are pushed back (debounced). If no
 * server is reachable the composable quietly reports "offline" and the app
 * works exactly as before, purely from localStorage.
 */

const ENDPOINT = '/api/state';
const DEBOUNCE_MS = 1500;

const status = ref('idle'); // idle | loading | syncing | synced | offline
const lastSyncedAt = ref(0);

let started = false;
let pushTimer = null;
let applying = false;   // suppress the push caused by adopting remote state
let lastSent = '';
let hadSource = false;  // whether the last shared state contained a source

function snapshot(store) {
  return {
    // The server stores one source. Only advertise it while mirror mode is on;
    // otherwise a non-mirror wall would be restored as a mirrored wall.
    source: store.mirrorMode ? (store.mirrorSource ?? null) : null,
    screenCount: store.screenCount,
    mirrorMode: store.mirrorMode,
    layout: store.layout,
  };
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function loadRemote(store) {
  status.value = 'loading';
  const before = JSON.stringify(snapshot(store));
  try {
    const res = await fetch(ENDPOINT, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const remote = await res.json();
    if (!remote || remote.empty || remote.cleared || !remote.source) {
      // Endpoint exists but nothing has been shared yet - push ours later.
      status.value = 'idle';
      return false;
    }

    // If the user pasted something while the request was in flight, their
    // wall wins; do not clobber it with an older server copy.
    if (JSON.stringify(snapshot(store)) !== before) {
      status.value = 'idle';
      return false;
    }

    const remoteState = {
      source: remote.source,
      screenCount: remote.screenCount ?? null,
      mirrorMode: remote.mirrorMode ?? true,
      layout: remote.layout ?? 'auto',
    };
    const localState = snapshot(store);

    if (!same(remoteState, localState)) {
      applying = true;
      const adopted = store.applyRemoteState(remoteState);
      // Vue flushes watchers in a microtask, before this macrotask runs, so
      // the change is ignored by schedulePush().
      setTimeout(() => { applying = false; }, 0);
      if (!adopted) {
        status.value = 'idle';
        return false;
      }
    }

    hadSource = true;
    lastSent = JSON.stringify(snapshot(store));
    status.value = 'synced';
    lastSyncedAt.value = Date.now();
    return true;
  } catch {
    status.value = 'offline';
    return false;
  }
}

async function push(store) {
  const state = snapshot(store);
  const payload = JSON.stringify(state);
  if (payload === lastSent) return;   // already up to date

  // Nothing has ever been shared and there is still no source: skip the write.
  if (!state.source && !hadSource) {
    lastSent = payload;
    return;
  }

  lastSent = payload;
  hadSource = Boolean(state.source);
  status.value = 'syncing';
  try {
    const res = await fetch(ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    const saved = await res.json().catch(() => null);
    if (!res.ok || !saved || saved.error) throw new Error(`HTTP ${res.status}`);
    status.value = 'synced';
    lastSyncedAt.value = Date.now();
  } catch {
    status.value = 'offline';
    lastSent = ''; // allow a retry on the next change
  }
}

function schedulePush(store) {
  if (applying) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => push(store), DEBOUNCE_MS);
}

/**
 * Explicitly blank the server wall. Without this, clearing the local wall would
 * leave the old source on the server and it would come back on the next load.
 */
async function clearRemote() {
  clearTimeout(pushTimer);
  lastSent = '';
  hadSource = false;
  applying = true;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cleared: true, source: null }),
    });
    const saved = await res.json().catch(() => null);
    if (!res.ok || !saved || saved.error) throw new Error(`HTTP ${res.status}`);
    status.value = 'synced';
    lastSyncedAt.value = Date.now();
    return true;
  } catch {
    status.value = 'offline';
    return false;
  } finally {
    setTimeout(() => { applying = false; }, 0);
  }
}

async function init(store, { adopt = true, push = true } = {}) {
  if (started) return false;
  started = true;

  const adopted = adopt ? await loadRemote(store) : false;
  // A share-link view must not overwrite the wall it was created from.
  if (push) watch(() => snapshot(store), () => schedulePush(store), { deep: true });
  return adopted;
}

export function useCloudSync() {
  return { status, lastSyncedAt, init, clearRemote };
}
