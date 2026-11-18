import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

const STORAGE_KEY = 'multiwatch_session';
const RUNS_KEY = 'multiwatch_runs';
const MIN_SCREENS = 1;
const MAX_SCREENS = 60;
// First paste should fill a full wall without the user having to choose a
// screen count first. 12 is the documented starting point.
const DEFAULT_SCREENS = 12;

const LAYOUTS = ['auto', 'focus', 'rows', 'cols'];
const PLATFORM_META = {
  youtube: { label: 'YouTube', color: '#ff0000' },
  twitch:  { label: 'Twitch',  color: '#9146ff' },
  kick:    { label: 'Kick',    color: '#53fc18' },
};

function clampScreenCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_SCREENS, Math.max(MIN_SCREENS, Math.round(n)));
}

function generateId() {
  return `v_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const KICK_RESERVED = ['video', 'category', 'categories', 'browse', 'following', 'search', 'dashboard', 'settings'];
const TWITCH_RESERVED = ['directory', 'search', 'settings', 'subscriptions', 'inventory', 'wallet', 'drops', 'friends', 'downloads', 'turbo', 'videos'];

function isValidSourceId(type, subtype, sourceId) {
  if (type === 'youtube') return /^[A-Za-z0-9_-]{6,20}$/.test(sourceId);
  if (type === 'twitch') {
    if (subtype === 'vod')  return /^\d{1,20}$/.test(sourceId);
    if (subtype === 'clip') return /^[A-Za-z0-9_-]{1,100}$/.test(sourceId);
    return /^[A-Za-z0-9_]{1,25}$/.test(sourceId)
      && !TWITCH_RESERVED.includes(sourceId.toLowerCase());
  }
  if (type === 'kick') {
    return /^[A-Za-z0-9_-]{1,50}$/.test(sourceId)
      && !KICK_RESERVED.includes(sourceId.toLowerCase());
  }
  return false;
}

/**
 * Turns anything that came from localStorage, a share link, or the sync server
 * into a trusted source object. Unknown platforms and bad IDs are rejected so
 * they can never become an empty/recursive iframe URL.
 */
function normalizeSource(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const type = raw.type;
  if (!Object.prototype.hasOwnProperty.call(PLATFORM_META, type)) return null;

  const sourceId = typeof raw.sourceId === 'string' ? raw.sourceId.trim() : '';
  if (!sourceId || sourceId.length > 120) return null;

  let subtype = null;
  if (type === 'twitch') {
    subtype = ['channel', 'vod', 'clip'].includes(raw.subtype) ? raw.subtype : 'channel';
  }
  if (!isValidSourceId(type, subtype, sourceId)) return null;

  const meta = PLATFORM_META[type];
  return {
    type,
    sourceId,
    subtype,
    rawUrl: typeof raw.rawUrl === 'string' ? raw.rawUrl.slice(0, 2048) : '',
    label:  typeof raw.label === 'string' && raw.label.trim()
      ? raw.label.slice(0, 80)
      : meta.label,
    color:  typeof raw.color === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw.color)
      ? raw.color
      : meta.color,
  };
}

function normalizeVideo(raw) {
  const source = normalizeSource(raw);
  if (!source) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 64) : generateId(),
    ...source,
    muted: raw.muted !== false,
  };
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const seenIds = new Set();
    const videos = (Array.isArray(parsed.videos) ? parsed.videos : [])
      .slice(0, MAX_SCREENS)
      .map(normalizeVideo)
      .filter(Boolean)
      .map((video) => {
        let id = video.id;
        while (seenIds.has(id)) id = generateId();
        seenIds.add(id);
        return id === video.id ? video : { ...video, id };
      });

    const screenCount = parsed.screenCount == null ? null : clampScreenCount(parsed.screenCount);
    let layout = LAYOUTS.includes(parsed.layout) ? parsed.layout : 'auto';
    // Focus only makes sense for four or fewer slots; never restore it for a
    // wall that would render as an unusable sidebar.
    if (layout === 'focus' && Math.max(screenCount ?? 0, videos.length) > 4) {
      layout = 'auto';
    }

    return {
      videos,
      layout,
      screenCount,
      mirrorMode: typeof parsed.mirrorMode === 'boolean' ? parsed.mirrorMode : true,
      mirrorSource: normalizeSource(parsed.mirrorSource),
    };
  } catch {
    return null;
  }
}

function saveToStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* storage unavailable */ }
}

// ── Playback counter ─────────────────────────────────────────────────────────
// Counts how many times a source was started in this app on this device. It is
// NOT YouTube's view count: the official number is only available through the
// YouTube Data API and cannot be changed by this app.

function sourceKey(source) {
  if (!source || !source.type || !source.sourceId) return '';
  return `${source.type}:${source.subtype ?? ''}:${source.sourceId}`;
}

function loadRunStats() {
  try {
    const raw = JSON.parse(localStorage.getItem(RUNS_KEY) || 'null');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    for (const [key, entry] of Object.entries(raw)) {
      if (typeof key !== 'string' || key.length > 160) continue;
      const count = Math.floor(Number(entry?.count));
      if (!Number.isFinite(count) || count < 1) continue;
      const lastRunAt = Number(entry?.lastRunAt);
      out[key] = {
        count: Math.min(count, Number.MAX_SAFE_INTEGER),
        lastRunAt: Number.isFinite(lastRunAt) ? lastRunAt : 0,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function persistRunStats(stats) {
  try {
    localStorage.setItem(RUNS_KEY, JSON.stringify(stats));
  } catch { /* storage unavailable */ }
}


export const useVideosStore = defineStore('videos', () => {
  const saved = loadFromStorage();

  // ── State ──────────────────────────────────────────────────────────────────
  const videos      = ref(saved?.videos  ?? []);
  const layout      = ref(saved?.layout  ?? 'auto');
  const screenCount = ref(saved?.screenCount ?? null); // null = not chosen yet
  // One URL on every screen is the default: paste once, fill the wall.
  const mirrorMode  = ref(saved?.mirrorMode ?? true);
  const soloId      = ref(null); // ID of the video that has audio unmuted
  // The source last broadcast to the wall. Kept separately from `videos` so
  // changing the screen count (12 -> 60) re-fills without a new paste, and so
  // the wall survives a reload even if the panels were cleared.
  const mirrorSource = ref(saved?.mirrorSource ?? null);
  // Per-source "how many times this wall started it" counters (separate from
  // the session so share links and cloud state do not copy them).
  const runStats = ref(loadRunStats());

  // ── Persistence ────────────────────────────────────────────────────────────
  // Write the sanitized state back once on load. A corrupt or outdated session
  // is normalized in memory anyway, but without this the bad values would stay
  // in localStorage and be re-parsed on every visit.
  saveToStorage({
    videos: videos.value,
    layout: layout.value,
    screenCount: screenCount.value,
    mirrorMode: mirrorMode.value,
    mirrorSource: mirrorSource.value,
  });

  watch(
    [videos, layout, screenCount, mirrorMode, mirrorSource],
    () => saveToStorage({
      videos: videos.value,
      layout: layout.value,
      screenCount: screenCount.value,
      mirrorMode: mirrorMode.value,
      mirrorSource: mirrorSource.value,
    }),
    { deep: true }
  );

  watch(runStats, () => persistRunStats(runStats.value), { deep: true });
  // Clean stale/corrupt stats on load so they are rewritten in a known shape.
  persistRunStats(runStats.value);

  // ── Playback counter actions ───────────────────────────────────────────────

  function recordRun(source) {
    const key = sourceKey(source);
    if (!key) return;
    const previous = runStats.value[key];
    runStats.value = {
      ...runStats.value,
      [key]: {
        count: (previous?.count || 0) + 1,
        lastRunAt: Date.now(),
      },
    };
  }

  function runCountFor(source) {
    const key = sourceKey(source);
    return key ? (runStats.value[key]?.count || 0) : 0;
  }

  function recordCurrentRun() {
    const source = mirrorSource.value ?? videos.value[0] ?? null;
    if (source) recordRun(source);
  }

  function resetRunStats() {
    runStats.value = {};
    try {
      localStorage.removeItem(RUNS_KEY);
    } catch { /* storage unavailable */ }
  }

  const totalRuns = computed(() =>
    Object.values(runStats.value).reduce((sum, entry) => sum + (entry?.count || 0), 0)
  );

  const currentRunCount = computed(() => {
    const source = mirrorSource.value ?? videos.value[0] ?? null;
    return source ? runCountFor(source) : 0;
  });

  // ── Actions ────────────────────────────────────────────────────────────────

  function addVideo(meta) {
    const source = normalizeSource(meta);
    if (!source) return false;

    // In mirror mode a new URL replaces the whole wall.
    if (mirrorMode.value) {
      const ok = setMirroredVideo(source);
      if (ok) recordRun(source);
      return ok;
    }

    // Keep the wall inside the documented 1-60 screen limit.
    if (videos.value.length >= MAX_SCREENS) return false;

    videos.value.push(makeVideo(source));
    recordRun(source);
    return true;
  }

  function makeVideo(meta, muted = true) {
    return {
      id:       generateId(),
      type:     meta.type,
      sourceId: meta.sourceId,
      subtype:  meta.subtype  ?? null,
      rawUrl:   meta.rawUrl   ?? '',
      label:    meta.label    ?? '',
      color:    meta.color    ?? '#7c5cfc',
      muted,
    };
  }

  /**
   * Mirror one URL to every configured screen. Used both when mirror mode is
   * turned on and when a new URL is added while it is on.
   *
   * Falls back to the last broadcast source, so changing the screen count or
   * reloading the page re-fills the wall without a new paste.
   */
  function setMirroredVideo(meta = mirrorSource.value ?? videos.value[0]) {
    const source = normalizeSource(meta);
    if (!source) return false;
    // No screen count chosen yet -> fill the default wall instead of one panel.
    const count = screenCount.value ?? DEFAULT_SCREENS;
    screenCount.value = count;
    videos.value = Array.from({ length: count }, () => makeVideo(source));
    mirrorSource.value = { ...source };
    soloId.value = null;
    return true;
  }

  function setMirrorMode(value) {
    mirrorMode.value = !!value;
    if (mirrorMode.value) setMirroredVideo();
  }

  function removeVideo(id) {
    videos.value = videos.value.filter((v) => v.id !== id);
    if (soloId.value === id) soloId.value = null;
  }

  function reorderVideos(newList) {
    videos.value = newList;
  }

  function setLayout(l) {
    layout.value = l;
  }

  function setScreenCount(n) {
    const count = clampScreenCount(n);
    if (count === null) return;
    screenCount.value = count;
    // Focus is a 1-big-plus-sidebar layout; it stops being usable past 4.
    if (layout.value === 'focus' && count > 4) layout.value = 'auto';
    // Re-fill from the remembered source so 12 -> 60 keeps the same stream on
    // every panel instead of leaving the new panels empty.
    if (mirrorMode.value && (mirrorSource.value || videos.value.length)) {
      setMirroredVideo();
    }
  }

  function soloAudio(id) {
    // Toggle: if already soloed, un-solo (mute all)
    if (soloId.value === id) {
      soloId.value = null;
      videos.value.forEach((v) => { v.muted = true; });
    } else {
      soloId.value = id;
      videos.value.forEach((v) => { v.muted = v.id !== id; });
    }
  }

  function clearAll() {
    videos.value = [];
    mirrorSource.value = null;
    soloId.value = null;
  }

  // ── URL State Encoding ─────────────────────────────────────────────────────

  function encodeToUrl() {
    // Mirror mode only needs one source in the URL; recipients rebuild the wall.
    const mirrorList = mirrorSource.value ? [mirrorSource.value] : videos.value.slice(0, 1);
    if (!videos.value.length && !mirrorList.length) {
      return window.location.origin + window.location.pathname;
    }
    const sourceList = mirrorMode.value ? mirrorList : videos.value;
    const parts = sourceList.map((v) => {
      const prefix = v.type === 'youtube' ? 'yt'
                   : v.type === 'twitch'  ? 'tw'
                   : v.type === 'kick'    ? 'ki'
                   : v.type;
      const sub = v.subtype ? `:${v.subtype}` : '';
      return `${prefix}${sub}:${v.sourceId}`;
    });
    const url = new URL(window.location.href);
    url.searchParams.set('v', parts.join(','));
    url.searchParams.set('layout', layout.value);
    url.searchParams.set('screens', String(screenCount.value ?? videos.value.length));
    if (mirrorMode.value) url.searchParams.set('mirror', '1');
    return url.toString();
  }

  function loadFromUrl() {
    try {
      const url = new URL(window.location.href);
      const vParam = url.searchParams.get('v');
      if (!vParam) return false;

      const typeMap = { yt: 'youtube', tw: 'twitch', ki: 'kick' };
      const colorMap = { youtube: '#ff0000', twitch: '#9146ff', kick: '#53fc18' };
      const labelMap = { youtube: 'YouTube', twitch: 'Twitch', kick: 'Kick' };

      const items = vParam.split(',').slice(0, MAX_SCREENS).map((part) => {
        // format: yt:ID  or  tw:channel:ID  or  tw:vod:ID
        const segments = part.split(':');
        const prefix   = segments[0];
        const type     = typeMap[prefix] ?? prefix;

        let sourceId, subtype;
        if (type === 'twitch' && segments.length === 3) {
          subtype  = segments[1];
          sourceId = segments[2];
        } else {
          sourceId = segments[1];
          subtype  = null;
        }

        const source = normalizeSource({
          type,
          sourceId,
          subtype,
          rawUrl: '',
          label:  labelMap[type] ?? type,
          color:  colorMap[type] ?? '#7c5cfc',
        });
        return source ? makeVideo(source) : null;
      }).filter(Boolean);

      if (!items.length) return false;

      const layoutParam = url.searchParams.get('layout');
      const screensParam = url.searchParams.get('screens');
      const mirrorParam = url.searchParams.get('mirror') === '1';
      const screens = clampScreenCount(screensParam);

      // A mirror-mode link contains one source; rebuild the full wall locally.
      let finalItems = items;
      if (mirrorParam) {
        const count = screens ?? items.length;
        finalItems = Array.from({ length: count }, () => makeVideo(items[0]));
      }

      const nextLayout = LAYOUTS.includes(layoutParam) ? layoutParam : 'auto';
      videos.value  = finalItems;
      layout.value  = nextLayout === 'focus' && finalItems.length > 4 ? 'auto' : nextLayout;
      screenCount.value = screens ?? finalItems.length;
      mirrorMode.value = mirrorParam;
      mirrorSource.value = mirrorParam
        ? {
            type:     items[0].type,
            sourceId: items[0].sourceId,
            subtype:  items[0].subtype,
            rawUrl:   '',
            label:    items[0].label,
            color:    items[0].color,
          }
        : null;
      soloId.value  = null;

      // Clean URL (remove params from address bar without reload)
      const clean = new URL(window.location.href);
      clean.searchParams.delete('v');
      clean.searchParams.delete('layout');
      clean.searchParams.delete('screens');
      clean.searchParams.delete('mirror');
      window.history.replaceState({}, '', clean.toString());

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Apply a state fetched from the sync server. Used on load so a wall shared
   * from another device (or from before a reboot) comes back automatically.
   */
  function applyRemoteState(remote) {
    const source = normalizeSource(remote?.source);
    if (!source) return false;

    const count = clampScreenCount(remote.screenCount);
    const nextLayout = LAYOUTS.includes(remote.layout) ? remote.layout : 'auto';
    const isMirror = remote.mirrorMode !== false;

    mirrorMode.value = isMirror;
    layout.value = nextLayout;
    if (count !== null) screenCount.value = count;

    if (isMirror) {
      setMirroredVideo(source);
    } else {
      // A non-mirror wall can only be represented by one source on the server.
      // Build it directly instead of going through addVideo() so adopting a
      // remote wall does not double-count the run.
      videos.value = [makeVideo(source)];
      mirrorSource.value = null;
    }

    if (layout.value === 'focus' && videos.value.length > 4) layout.value = 'auto';
    return true;
  }

  /**
   * Force every panel to be re-created from the remembered source. Used as a
   * manual recovery when a stalled stream never resumes on its own.
   */
  function rebroadcast() {
    if (!mirrorMode.value || !mirrorSource.value) return false;
    setMirroredVideo();
    return true;
  }

  return {
    videos, layout, screenCount, mirrorMode, soloId, mirrorSource,
    runStats, totalRuns, currentRunCount,
    addVideo, removeVideo, reorderVideos,
    setLayout, setScreenCount, setMirrorMode, setMirroredVideo, soloAudio, clearAll,
    applyRemoteState,
    recordRun, runCountFor, recordCurrentRun, resetRunStats,
    rebroadcast, encodeToUrl, loadFromUrl,
  };
});
