<template>
  <div class="app" :data-theme="theme">
    <AppHeader
      ref="headerEl"
      @share="handleShare"
      @clearAll="handleClearAll"
      @openScreens="screensOpen = true"
      @openSettings="settingsOpen = true"
    />
    <VideoGrid @focus-add="focusUrlInput" />
    <ScreenSetup
      :open="screensOpen"
      :first-run="firstRun"
      @close="screensOpen = false"
    />
    <AppSettings :open="settingsOpen" @close="settingsOpen = false" />
    <ToastNotification />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import AppHeader from './components/AppHeader.vue';
import VideoGrid from './components/VideoGrid.vue';
import ScreenSetup from './components/ScreenSetup.vue';
import AppSettings from './components/AppSettings.vue';
import ToastNotification from './components/ToastNotification.vue';
import { useTheme } from './composables/useTheme.js';
import { useToast } from './composables/useToast.js';
import { useKeepAwake } from './composables/useKeepAwake.js';
import { useRotation } from './composables/useRotation.js';
import { useResume } from './composables/useResume.js';
import { useCloudSync } from './composables/useCloudSync.js';
import { useVideosStore } from './stores/videos.js';

const { theme } = useTheme();
const { success, info } = useToast();
const store = useVideosStore();

const { init: initKeepAwake } = useKeepAwake();
const { init: initRotation } = useRotation();
const { init: initResume } = useResume();
const { init: initCloudSync, clearRemote } = useCloudSync();

const headerEl = ref(null);
const screensOpen = ref(false);
const settingsOpen = ref(false);

const firstRun = computed(
  () => store.screenCount === null && store.videos.length === 0
);

onMounted(async () => {
  initKeepAwake();
  initRotation();
  initResume();

  // Remember the run total before anything loads, so a restored wall (saved
  // session, share link, or cloud state) is counted exactly once instead of
  // once per load path. addVideo() counts an explicit paste itself.
  const runsAtStart = store.totalRuns;

  // Prefer URL params over localStorage
  const loadedFromUrl = store.loadFromUrl();
  if (loadedFromUrl) {
    info(`Loaded ${store.videos.length} video${store.videos.length === 1 ? '' : 's'} from shared link.`);
  }

  // Existing sessions from before screen counts existed: assume one slot per video.
  if (store.screenCount === null && store.videos.length) {
    store.setScreenCount(Math.max(1, store.videos.length));
  }

  // Mirror mode with a remembered source but an older screen count: make sure
  // the whole wall is filled on load. Skip the rebuild (and the iframe
  // remount) when the saved wall already matches the configured count.
  if (store.mirrorMode && store.mirrorSource) {
    const target = store.screenCount ?? 12;
    if (store.videos.length !== target || store.screenCount === null) {
      store.setScreenCount(target);
    }
  }

  // Share/follow the wall through the server. A share link is an explicit
  // one-off view, so it must not adopt - or overwrite - the server's state.
  const adopted = await initCloudSync(store, {
    adopt: !loadedFromUrl,
    push: !loadedFromUrl,
  });

  // Count this wall start once. If something was added during load (which
  // already counted its own run), the total would have changed — don't add a
  // second count for the same start. Changing screens or rotating never counts.
  if ((store.mirrorSource || store.videos.length) && store.totalRuns === runsAtStart) {
    store.recordCurrentRun();
  }

  // First visit with nothing saved and nothing adopted: ask for a screen count.
  if (!loadedFromUrl && !adopted && store.screenCount === null && !store.videos.length) {
    screensOpen.value = true;
  }
});

function focusUrlInput() {
  headerEl.value?.focusInput();
}

async function handleShare() {
  if (!store.videos.length) {
    info('Add some videos first before sharing.');
    return;
  }
  const url = store.encodeToUrl();
  try {
    await navigator.clipboard.writeText(url);
    success('Shareable link copied to clipboard!');
  } catch {
    // Fallback for browsers that deny clipboard access
    prompt('Copy this shareable link:', url);
  }
}

async function handleClearAll() {
  if (!store.videos.length) return;
  const count = store.videos.length;
  store.clearAll();
  await clearRemote();
  info(`Removed ${count} video${count === 1 ? '' : 's'}.`);
}
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}
</style>
