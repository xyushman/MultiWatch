<template>
  <ModalShell
    :open="open"
    title="Session settings"
    subtitle="Keep the window active, choose screens, and rotate streams."
    @close="$emit('close')"
  >
    <!-- ── Always active ─────────────────────────────────────────────────── -->
    <section class="settings-section">
      <div class="settings-row">
        <div class="settings-row__text">
          <h3 class="settings-row__title">Always active</h3>
          <p class="settings-row__desc">
            Holds a screen wake lock and plays a near-silent keep-alive loop so the
            display does not sleep and the tab is less likely to be frozen.
          </p>
        </div>
        <button
          type="button"
          class="switch"
          :class="{ 'switch--on': keepEnabled }"
          role="switch"
          :aria-checked="keepEnabled"
          aria-label="Always active mode"
          @click="toggleKeepAwake"
        >
          <span class="switch__thumb" />
        </button>
      </div>

      <p class="settings-status" :class="keepStatusClass">
        <span class="settings-status__dot" />
        <span v-if="!keepEnabled">Off — the screen may sleep and background throttling applies.</span>
        <span v-else-if="keepActive">
          On — {{ wakeLockActive ? 'screen wake lock held' : 'keep-alive audio running' }}.
          Keep the window visible for uninterrupted playback.
        </span>
        <span v-else>
          On, but waiting for a click. Click anywhere on the page to arm it.
          <template v-if="keepError"> {{ keepError }}</template>
        </span>
      </p>

      <p v-if="!wakeLockSupported" class="settings-note">
        This browser has no Screen Wake Lock API, so only the silent keep-alive audio
        is used. Browsers may still pause video in hidden tabs.
      </p>
      <p v-else class="settings-note">
        A web page cannot force itself to stay focused or on top, and cannot stop a
        hidden tab from being throttled. Keep this window visible for continuous playback.
      </p>
    </section>

    <!-- ── Screen count ──────────────────────────────────────────────────── -->
    <section class="settings-section">
      <div class="settings-row">
        <div class="settings-row__text">
          <h3 class="settings-row__title">Screens</h3>
          <p class="settings-row__desc">
            Number of video slots shown in the grid. Currently
            <strong>{{ screenCount ?? 'auto' }}</strong>
            screen{{ screenCount === 1 ? '' : 's' }} and
            <strong>{{ videos.length }}</strong> loaded.
          </p>
        </div>
      </div>

      <div class="chip-row" role="group" aria-label="Screen count">
        <button
          v-for="n in screenPresets"
          :key="n"
          type="button"
          class="chip"
          :class="{ 'chip--active': screenCount === n }"
          :aria-pressed="screenCount === n"
          @click="store.setScreenCount(n)"
        >
          {{ n }}
        </button>
      </div>

      <p v-if="screenCount !== null && screenCount > 16" class="settings-note settings-note--warning">
        {{ screenCount }} screens means {{ screenCount }} separate players. Expect heavy
        CPU, memory, and network use — 60 screens can freeze a normal PC.
      </p>

      <p v-if="screenCount !== null && videos.length > screenCount" class="settings-note settings-note--warning">
        You have more videos than slots. All videos stay visible; choose a larger
        screen count to show the full grid.
      </p>
    </section>

    <!-- ── Mirror mode ───────────────────────────────────────────────────── -->
    <section class="settings-section">
      <div class="settings-row">
        <div class="settings-row__text">
          <h3 class="settings-row__title">Mirror one URL</h3>
          <p class="settings-row__desc">
            When on, every screen plays the same video. Adding a new URL replaces
            the whole wall, so you only paste the link once.
          </p>
        </div>
        <button
          type="button"
          class="switch"
          :class="{ 'switch--on': mirrorMode }"
          role="switch"
          :aria-checked="mirrorMode"
          aria-label="Mirror one URL on every screen"
          @click="store.setMirrorMode(!mirrorMode)"
        >
          <span class="switch__thumb" />
        </button>
      </div>

      <p class="settings-status" :class="mirrorMode ? 'settings-status--ok' : 'settings-status--off'">
        <span class="settings-status__dot" />
        <template v-if="mirrorMode">
          On — {{ screenCount ?? 1 }} copies of the current URL. Paste a new link
          above to replace all of them.
        </template>
        <template v-else>
          Off — each URL you add becomes one new screen.
        </template>
      </p>
    </section>

    <!-- ── Playback counter ──────────────────────────────────────────────── -->
    <section class="settings-section">
      <div class="settings-row">
        <div class="settings-row__text">
          <h3 class="settings-row__title">Playback counter</h3>
          <p class="settings-row__desc">
            How many times this device has started the current video. It has run
            <strong>{{ currentRunCount }}</strong>
            time{{ currentRunCount === 1 ? '' : 's' }}; across all videos,
            <strong>{{ totalRuns }}</strong> start{{ totalRuns === 1 ? '' : 's' }}.
          </p>
        </div>
      </div>

      <p class="settings-note">
        This is a local count of starts from this app on this device — not
        YouTube's official view count. Changing screens never adds a count.
      </p>

      <div>
        <button
          type="button"
          class="btn btn-ghost"
          :disabled="!totalRuns"
          @click="resetCounter"
        >
          Reset counter
        </button>
      </div>
    </section>

    <!-- ── Stream rotation ───────────────────────────────────────────────── -->
    <section class="settings-section">
      <div class="settings-row">
        <div class="settings-row__text">
          <h3 class="settings-row__title">Stream rotation</h3>
          <p class="settings-row__desc">
            Recreates every player on a timer. If proxy gateways are configured,
            each refresh moves to the next gateway.
          </p>
        </div>
        <button
          type="button"
          class="switch"
          :class="{ 'switch--on': rotationEnabled }"
          role="switch"
          :aria-checked="rotationEnabled"
          aria-label="Stream rotation"
          @click="setRotationEnabled(!rotationEnabled)"
        >
          <span class="switch__thumb" />
        </button>
      </div>

      <div class="rotation-row">
        <label class="rotation-row__label" for="rotation-minutes">Rotate every</label>
        <select
          id="rotation-minutes"
          class="select"
          :value="rotationMinutes"
          @change="setMinutes($event.target.value)"
        >
          <option :value="15">15 minutes</option>
          <option :value="30">30 minutes</option>
          <option :value="60">1 hour</option>
          <option :value="120">2 hours</option>
        </select>
        <button type="button" class="btn btn-ghost rotate-btn" @click="rotateNow">
          Rotate now
        </button>
      </div>

      <p class="settings-status" :class="rotationEnabled ? 'settings-status--ok' : 'settings-status--off'">
        <span class="settings-status__dot" />
        <template v-if="rotationEnabled">
          On — next refresh {{ nextInLabel ? `in ${nextInLabel}` : 'scheduled' }}.
          <span v-if="lastRotatedAt">Last refresh at {{ formatTime(lastRotatedAt) }}.</span>
        </template>
        <template v-else>Off — players stay loaded until you refresh manually.</template>
      </p>
    </section>

    <!-- ── Proxy gateways ────────────────────────────────────────────────── -->
    <section class="settings-section">
      <div class="settings-row">
        <div class="settings-row__text">
          <h3 class="settings-row__title">Proxy gateways <span class="badge">Advanced</span></h3>
          <p class="settings-row__desc">
            One URL template per line, up to {{ MAX_PROXIES }}. Use
            <code>{url}</code> where the original embed URL should go. Raw proxy
            endpoints such as <code>http://1.2.3.4:8080</code> are rejected: an
            iframe cannot use them, and they would break every screen.
          </p>
        </div>
      </div>

      <textarea
        v-model="proxyText"
        class="proxy-input"
        rows="4"
        spellcheck="false"
        placeholder="https://proxy.example/embed?url={url}"
      />

      <p v-if="proxyError" class="settings-note settings-note--danger">{{ proxyError }}</p>

      <div class="proxy-actions">
        <button type="button" class="btn btn-primary" @click="saveProxies">Save gateways</button>
        <button type="button" class="btn btn-ghost" :disabled="!proxyText.trim()" @click="clearProxies">
          Clear
        </button>
        <span class="proxy-status">Active: {{ activeProxyLabel }}</span>
      </div>

      <div class="warning-box">
        <strong>A browser cannot change your IP address.</strong>
        Real rotating proxies require a server-side gateway that serves and rewrites
        the embed page. Without one, rotation only refreshes the players. Routing
        YouTube/Twitch through a proxy may violate their terms of service.
        Automatic free-proxy fetching is not included: using proxy lists to avoid
        platform spam checks is view manipulation.
      </div>
    </section>

  </ModalShell>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import ModalShell from './ModalShell.vue';
import { useVideosStore } from '../stores/videos.js';
import { useKeepAwake } from '../composables/useKeepAwake.js';
import { useRotation } from '../composables/useRotation.js';
import { useToast } from '../composables/useToast.js';

const props = defineProps({
  open: { type: Boolean, default: false },
});

defineEmits(['close']);

const MAX_PROXIES = 8;
const screenPresets = [1, 2, 3, 4, 6, 8, 12, 16, 24, 36, 60];

const store = useVideosStore();
const { videos, screenCount, mirrorMode, currentRunCount, totalRuns } = storeToRefs(store);
const { success } = useToast();

const {
  enabled: keepEnabled,
  active: keepActive,
  wakeLockActive,
  wakeLockSupported,
  error: keepError,
  toggle: toggleKeepAwake,
} = useKeepAwake();

const {
  enabled: rotationEnabled,
  minutes: rotationMinutes,
  proxies: rotationProxies,
  activeProxyLabel,
  lastRotatedAt,
  nextAt,
  setEnabled: setRotationEnabled,
  setMinutes,
  setProxies,
  rotateNow,
} = useRotation();

const proxyText = ref('');
const proxyError = ref('');
const now = ref(Date.now());
let ticker = null;

const keepStatusClass = computed(() => {
  if (!keepEnabled.value) return 'settings-status--off';
  return keepActive.value ? 'settings-status--ok' : 'settings-status--warning';
});

const nextInLabel = computed(() => {
  if (!rotationEnabled.value || !nextAt.value) return '';
  const total = Math.max(0, Math.ceil((nextAt.value - now.value) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
});

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

watch(
  () => props.open,
  (isOpen) => {
    if (ticker) {
      clearInterval(ticker);
      ticker = null;
    }
    if (!isOpen) return;

    now.value = Date.now();
    ticker = setInterval(() => { now.value = Date.now(); }, 1000);
    proxyText.value = rotationProxies.value.join('\n');
    proxyError.value = '';
  }
);

onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker);
});

function saveProxies() {
  const lines = proxyText.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length > MAX_PROXIES) {
    proxyError.value = `Use at most ${MAX_PROXIES} gateways.`;
    return;
  }

  const invalid = lines.find((line) => !/^https?:\/\//i.test(line));
  if (invalid) {
    proxyError.value = `Not a valid http(s) URL: ${invalid}`;
    return;
  }

  proxyError.value = '';
  setProxies(lines);
  proxyText.value = rotationProxies.value.join('\n');
  if (rotationProxies.value.length !== lines.length) {
    proxyError.value =
      'Only URL-rewriting gateways are accepted (for example https://proxy.example/embed?url={url}). Raw proxy endpoints like http://1.2.3.4:8080 were ignored because an iframe cannot use them.';
    return;
  }
  success(lines.length ? 'Proxy gateways saved — players refreshed.' : 'Proxy gateways cleared.');
}

function clearProxies() {
  proxyText.value = '';
  proxyError.value = '';
  setProxies([]);
  success('Proxy gateways cleared.');
}

function resetCounter() {
  if (!window.confirm('Reset the local playback counter? This cannot be undone.')) return;
  store.resetRunStats();
  success('Playback counter reset.');
}
</script>

<style scoped>
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border);
}
.settings-section:last-of-type {
  padding-bottom: 0;
  border-bottom: none;
}

.settings-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.settings-row__text { min-width: 0; }
.settings-row__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.92rem;
  font-weight: 650;
  letter-spacing: -0.01em;
}
.settings-row__desc {
  margin-top: 4px;
  font-size: 0.79rem;
  line-height: 1.55;
  color: var(--text-muted);
}
.settings-row__desc strong { color: var(--text-primary); font-weight: 600; }

.badge {
  padding: 2px 6px;
  border-radius: 99px;
  background: var(--accent-dim);
  color: var(--accent);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

/* Switch */
.switch {
  position: relative;
  flex-shrink: 0;
  width: 42px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 99px;
  background: var(--surface-raised);
  cursor: pointer;
  transition: background-color var(--transition), border-color var(--transition);
}
.switch__thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: transform var(--transition), background-color var(--transition);
}
.switch--on {
  background: var(--accent-dim);
  border-color: var(--accent);
}
.switch--on .switch__thumb {
  transform: translateX(18px);
  background: var(--accent);
}

/* Status lines */
.settings-status {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--text-muted);
}
.settings-status__dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--text-muted);
}
.settings-status--ok .settings-status__dot    { background: var(--success); }
.settings-status--ok                          { color: var(--success); }
.settings-status--warning .settings-status__dot { background: var(--warning); }
.settings-status--warning                     { color: var(--warning); }
.settings-status--off .settings-status__dot   { background: var(--text-muted); }

.settings-note {
  font-size: 0.73rem;
  line-height: 1.55;
  color: var(--text-muted);
  padding: 9px 11px;
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  border: 1px solid var(--border);
}
.settings-note--warning { color: var(--warning); border-color: rgba(255, 179, 71, 0.28); }
.settings-note--danger  { color: var(--danger);  border-color: rgba(255, 85, 85, 0.3); }

/* Screen chips */
.chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  min-width: 36px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  color: var(--text-muted);
  font-family: inherit;
  font-size: 0.78rem;
  cursor: pointer;
  transition: color var(--transition), border-color var(--transition), background-color var(--transition);
}
.chip:hover { color: var(--text-primary); border-color: var(--border-focus); }
.chip--active {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-dim);
  font-weight: 600;
}

/* Rotation */
.rotation-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.rotation-row__label { font-size: 0.78rem; color: var(--text-muted); }
.select {
  padding: 7px 10px;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}
.select:focus { outline: none; border-color: var(--border-focus); }
.rotate-btn { font-size: 0.78rem; padding: 6px 10px; }

/* Proxy */
.proxy-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 0.75rem;
  line-height: 1.55;
  resize: vertical;
}
.proxy-input:focus { outline: none; border-color: var(--border-focus); }
.proxy-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.proxy-actions .btn { font-size: 0.76rem; padding: 6px 12px; }
.proxy-status {
  margin-left: auto;
  font-size: 0.72rem;
  color: var(--text-muted);
}
.warning-box {
  padding: 10px 12px;
  font-size: 0.72rem;
  line-height: 1.6;
  color: var(--text-muted);
  background: rgba(255, 179, 71, 0.08);
  border: 1px solid rgba(255, 179, 71, 0.28);
  border-radius: var(--radius-md);
}
.warning-box strong { color: var(--warning); }

code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--surface-raised);
  font-size: 0.72rem;
}

</style>
