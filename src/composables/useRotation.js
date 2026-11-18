import { computed, ref, watch } from 'vue';

/**
 * Stream rotation.
 *
 * IMPORTANT: a static browser app cannot change your IP address. Real proxy
 * rotation has to happen on a server. This composable supports two modes:
 *
 *   - no proxies configured: every interval (default 30 min) the players are
 *     re-mounted with a cache-busting parameter (useful for stale streams);
 *   - proxy templates configured: each rotation also moves to the next
 *     gateway in the list, e.g. `https://proxy.example/embed?url={url}`.
 *
 * The proxy gateway itself must serve/rewrite the platform page. Routing
 * YouTube/Twitch through a proxy may violate their terms of service.
 */

const STORAGE_KEY = 'multiwatch_rotation';
const ALLOWED_MINUTES = [15, 30, 60, 120];
const MAX_PROXIES = 8;

const defaultConfig = { enabled: false, minutes: 30, proxies: [] };

// A bare `http://1.2.3.4:8080` is an HTTP proxy, not a rewriting gateway: it
// cannot serve an embeddable player, and prefixing an iframe with one breaks
// every screen. Only keep entries that either contain a {url} placeholder or
// point at a named host that could actually be a gateway.
function isUsableGateway(value) {
  const text = String(value || '').trim();
  if (!/^https?:\/\//i.test(text)) return false;
  if (text.includes('{url}')) return true;
  try {
    const host = new URL(text).hostname;
    return !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) && host !== 'localhost';
  } catch {
    return false;
  }
}

function sanitizeProxies(list) {
  return (Array.isArray(list) ? list : [])
    .map((p) => String(p).trim())
    .filter((p) => isUsableGateway(p))
    .slice(0, MAX_PROXIES);
}

function loadConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return { ...defaultConfig };
    return {
      enabled: !!raw.enabled,
      minutes: ALLOWED_MINUTES.includes(Number(raw.minutes)) ? Number(raw.minutes) : 30,
      proxies: sanitizeProxies(raw.proxies),
    };
  } catch {
    return { ...defaultConfig };
  }
}

const config = ref(loadConfig());
const epoch = ref(0);
const lastRotatedAt = ref(null);
const nextAt = ref(null);

let timer = null;
let initialized = false;

const enabled = computed(() => config.value.enabled);
const minutes = computed(() => config.value.minutes);
const proxies = computed(() => config.value.proxies);
const proxyList = computed(() => config.value.proxies.filter(Boolean));
const intervalMs = computed(() => Math.max(1, Number(config.value.minutes) || 30) * 60 * 1000);

const activeProxy = computed(() => {
  const list = proxyList.value;
  if (!list.length) return '';
  return list[epoch.value % list.length];
});

const activeProxyIndex = computed(() => {
  const list = proxyList.value;
  return list.length ? (epoch.value % list.length) : -1;
});

const activeProxyLabel = computed(() => {
  const list = proxyList.value;
  if (!list.length) return 'Direct (no proxy)';
  return `Gateway ${(epoch.value % list.length) + 1} of ${list.length}`;
});

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config.value));
  } catch { /* storage unavailable */ }
}

function clearTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

function schedule() {
  clearTimer();
  if (!config.value.enabled) {
    nextAt.value = null;
    return;
  }
  nextAt.value = Date.now() + intervalMs.value;
  timer = setTimeout(() => rotate('auto'), intervalMs.value);
}

function rotate(reason = 'manual') {
  epoch.value += 1;
  lastRotatedAt.value = Date.now();
  if (config.value.enabled) schedule();
  else nextAt.value = null;

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('multiwatch:rotate', { detail: { reason, epoch: epoch.value } }));
  }
}

function setEnabled(value) {
  config.value.enabled = !!value;
}

function setMinutes(value) {
  const n = Number(value);
  config.value.minutes = ALLOWED_MINUTES.includes(n) ? n : 30;
}

function setProxies(list) {
  const cleaned = sanitizeProxies(list);
  const changed = JSON.stringify(cleaned) !== JSON.stringify(config.value.proxies);
  config.value.proxies = cleaned;
  if (changed) {
    // Re-mount players so the new gateway takes effect right away.
    epoch.value += 1;
  }
}

function applyProxy(proxy, target) {
  if (!proxy) return target;
  if (!/^https?:\/\//i.test(proxy)) return target;
  if (proxy.includes('{url}')) {
    return proxy.replaceAll('{url}', encodeURIComponent(target));
  }
  const joiner = proxy.includes('?') ? '&' : '?';
  return `${proxy}${joiner}url=${encodeURIComponent(target)}`;
}

/**
 * Returns the iframe URL after applying the active proxy (if any) and a
 * cache-busting rotation marker.
 */
function rotateUrl(rawUrl) {
  if (!rawUrl) return rawUrl;
  let out = applyProxy(activeProxy.value, rawUrl);
  try {
    const url = new URL(out, window.location.href);
    url.searchParams.set('_r', String(epoch.value));
    out = url.toString();
  } catch { /* keep the URL as-is */ }
  return out;
}

function init() {
  if (initialized) return;
  initialized = true;
  if (config.value.enabled) schedule();
}

watch(
  config,
  () => {
    persist();
    if (config.value.enabled) schedule();
    else {
      clearTimer();
      nextAt.value = null;
    }
  },
  { deep: true }
);

// Remove stale raw proxy endpoints saved by an older build. Without this the
// bad values would stay in localStorage even though they are ignored at
// runtime, and would come back the next time the list is edited.
persist();

export function useRotation() {
  return {
    config,
    epoch,
    enabled,
    minutes,
    proxies,
    activeProxy,
    activeProxyIndex,
    activeProxyLabel,
    lastRotatedAt,
    nextAt,
    init,
    rotate,
    rotateNow: () => rotate('manual'),
    setEnabled,
    setMinutes,
    setProxies,
    rotateUrl,
  };
}
