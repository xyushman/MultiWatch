<template>
  <main
    class="video-grid"
    :class="`video-grid--${effectiveLayout}`"
    role="main"
    aria-label="Video grid"
  >
    <!-- Empty state (only when no screens are configured) -->
    <Transition name="fade">
      <EmptyState v-if="showEmptyState" />
    </Transition>

    <!-- Draggable video list + empty screen slots -->
    <draggable
      v-if="slotCount > 0"
      v-model="videosList"
      item-key="id"
      class="video-grid__draggable"
      :class="[
        `video-grid__draggable--${effectiveLayout}`,
        { 'video-grid__draggable--sized': screenCount !== null },
      ]"
      :style="gridStyle"
      handle=".video-panel__drag-handle"
      animation="200"
      ghost-class="video-panel--ghost"
      chosen-class="video-panel--chosen"
      drag-class="video-panel--dragging"
      @end="onDragEnd"
    >
      <template #item="{ element }">
        <VideoPanel
          :video="element"
          :is-soloed="soloId === element.id"
          :has-solo="soloId !== null"
          :run-count="store.runCountFor(element)"
          @remove="store.removeVideo"
          @solo="store.soloAudio"
        />
      </template>

      <template v-if="emptySlots > 0" #footer>
        <EmptySlot
          v-for="n in emptySlots"
          :key="`empty-${n}`"
          :index="videos.length + n"
          @add="$emit('focus-add')"
        />
      </template>
    </draggable>

    <!-- Mobile swipe hint -->
    <Transition name="fade">
      <div v-if="videos.length && isMobile" class="swipe-hint" aria-hidden="true">
        Scroll to see all videos
      </div>
    </Transition>
  </main>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import draggable from 'vuedraggable';
import { storeToRefs } from 'pinia';
import { useVideosStore } from '../stores/videos.js';
import VideoPanel from './VideoPanel.vue';
import EmptySlot from './EmptySlot.vue';
import EmptyState from './EmptyState.vue';

defineEmits(['focus-add']);

const store = useVideosStore();
const { videos, layout, soloId, screenCount } = storeToRefs(store);

// Two-way computed for draggable v-model
const videosList = computed({
  get:  () => videos.value,
  set:  (val) => store.reorderVideos(val),
});

function onDragEnd() {
  // reorderVideos already called via v-model set
}

// Always show at least the configured number of screens. If more videos exist
// than screens, keep showing every video rather than hiding any.
const slotCount = computed(() =>
  Math.max(screenCount.value ?? 0, videos.value.length)
);

const emptySlots = computed(() =>
  Math.max(0, slotCount.value - videos.value.length)
);

const showEmptyState = computed(() => !videos.value.length && slotCount.value === 0);

function columnsFor(count) {
  if (count <= 1) return 1;
  if (count <= 3) return count;
  return Math.ceil(Math.sqrt(count));
}

// Focus is a 1-big-plus-sidebar layout. With more than 4 slots the sidebar
// becomes a 280px column of dozens of players, so fall back to the auto grid.
const effectiveLayout = computed(() => (
  layout.value === 'focus' && slotCount.value > 4 ? 'auto' : layout.value
));

const gridStyle = computed(() => (
  slotCount.value
    ? { '--grid-cols': columnsFor(slotCount.value) }
    : {}
));

const isMobile = ref(false);

function updateIsMobile() {
  if (typeof window !== 'undefined') isMobile.value = window.innerWidth < 768;
}

onMounted(() => {
  updateIsMobile();
  window.addEventListener('resize', updateIsMobile);
});

onUnmounted(() => {
  window.removeEventListener('resize', updateIsMobile);
});
</script>

<style scoped>
.video-grid {
  flex: 1;
  min-height: 0;
  padding: 12px;
  overflow-y: auto;
}

/* ── Draggable container base ──────────────────────────────────────────── */
.video-grid__draggable {
  display: grid;
  gap: 12px;
  width: 100%;
}

/* ── Layout: AUTO (default) ─────────────────────────────────────────────── */
.video-grid__draggable--auto {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 480px), 1fr));
}

/* When a screen count is chosen, follow it exactly. */
.video-grid__draggable--sized.video-grid__draggable--auto {
  grid-template-columns: repeat(var(--grid-cols, 2), minmax(0, 1fr));
}

/* ── Layout: FOCUS (1 big + sidebar) ───────────────────────────────────── */
.video-grid__draggable--focus {
  grid-template-columns: 1fr 280px;
  grid-template-rows: auto;
}
.video-grid__draggable--focus > :first-child {
  grid-row: 1 / span 3;
}

/* ── Layout: ROWS (stacked full width) ─────────────────────────────────── */
.video-grid__draggable--rows {
  grid-template-columns: 1fr;
  max-width: 900px;
  margin: 0 auto;
}

/* ── Layout: COLS (side-by-side columns) ───────────────────────────────── */
.video-grid__draggable--cols {
  grid-template-columns: repeat(3, 1fr);
}
.video-grid__draggable--sized.video-grid__draggable--cols {
  grid-template-columns: repeat(var(--grid-cols, 3), minmax(0, 1fr));
}

/* ── Drag states ────────────────────────────────────────────────────────── */
:deep(.video-panel--ghost) {
  opacity: 0.4;
  border: 2px dashed var(--accent) !important;
  background: var(--accent-dim) !important;
}
:deep(.video-panel--chosen) {
  box-shadow: var(--shadow-lg), 0 0 0 2px var(--accent) !important;
}
:deep(.video-panel--dragging) {
  cursor: grabbing !important;
  box-shadow: var(--shadow-lg) !important;
  transform: rotate(1.5deg) scale(1.02);
  z-index: 99;
}

/* ── Mobile ─────────────────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .video-grid {
    padding: 8px;
  }
  .video-grid__draggable--auto,
  .video-grid__draggable--focus,
  .video-grid__draggable--cols,
  .video-grid__draggable--sized.video-grid__draggable--auto,
  .video-grid__draggable--sized.video-grid__draggable--cols {
    grid-template-columns: 1fr;
  }
  .video-grid__draggable--focus > :first-child {
    grid-row: auto;
  }
}

/* ── Swipe hint ─────────────────────────────────────────────────────────── */
.swipe-hint {
  text-align: center;
  padding: 8px;
  font-size: 0.75rem;
  color: var(--text-muted);
  display: none;
}
@media (max-width: 768px) {
  .swipe-hint { display: block; }
}
</style>
