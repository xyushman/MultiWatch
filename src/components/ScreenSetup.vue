<template>
  <ModalShell
    :open="open"
    :title="firstRun ? 'How many screens?' : 'Screen setup'"
    :subtitle="firstRun
      ? 'Choose how many videos you want to watch at once. We will create that many slots.'
      : 'Change how many video slots are shown in the grid.'"
    @close="$emit('close')"
  >
    <p class="setup-lede">
      Pick a preset or enter a custom number (1–60). Paste a
      <strong>YouTube</strong>, <strong>Twitch</strong>, or <strong>Kick</strong>
      link in the bar above to fill each slot.
    </p>

    <div class="screen-options">
      <button
        v-for="option in options"
        :key="option.n"
        type="button"
        class="screen-option"
        :class="{ 'screen-option--active': screenCount === option.n }"
        :aria-pressed="screenCount === option.n"
        @click="choose(option.n)"
      >
        <span class="screen-option__top">
          <span class="screen-option__num">{{ option.n }}</span>
          <span class="screen-option__label">{{ option.label }}</span>
        </span>
        <span class="screen-option__mini" :style="miniStyle(option.cols, option.n)" aria-hidden="true">
          <i v-for="cell in option.n" :key="cell" />
        </span>
        <span class="screen-option__hint">{{ option.hint }}</span>
      </button>
    </div>

    <div class="custom-row">
      <label class="custom-row__label" for="custom-screens">Custom screens</label>
      <div class="custom-row__controls">
        <input
          id="custom-screens"
          v-model.number="custom"
          class="custom-input"
          type="number"
          min="1"
          max="60"
          inputmode="numeric"
        />
        <button type="button" class="btn btn-primary" :disabled="!validCustom" @click="choose(custom)">
          Set {{ validCustom ? custom : '' }} {{ validCustom && custom === 1 ? 'screen' : 'screens' }}
        </button>
      </div>
      <p v-if="!validCustom" class="custom-row__error">Enter a whole number from 1 to 60.</p>
    </div>

    <label class="mirror-option">
      <input
        type="checkbox"
        class="mirror-option__check"
        :checked="mirrorMode"
        @change="store.setMirrorMode($event.target.checked)"
      />
      <span class="mirror-option__text">
        <strong>Mirror one URL on every screen</strong>
        <span>Paste one link and it fills all screens. Pasting a new link replaces the wall.</span>
      </span>
    </label>

    <p class="setup-note setup-note--warning">
      <strong>Heads up:</strong> every screen is a separate embedded player. 12
      screens is already heavy; 60 can freeze a normal PC and use a lot of data.
    </p>

    <p class="setup-note">
      <strong>Tip:</strong> the layout buttons in the header still work — “Auto”
      follows the screen count, while Focus / Rows / Columns override the arrangement.
      Turn on <strong>Mirror</strong> in settings to send one URL to every screen.
    </p>
  </ModalShell>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import ModalShell from './ModalShell.vue';
import { useVideosStore } from '../stores/videos.js';
import { useToast } from '../composables/useToast.js';

const props = defineProps({
  open:     { type: Boolean, default: false },
  firstRun: { type: Boolean, default: false },
});

const emit = defineEmits(['close']);

const store = useVideosStore();
const { screenCount, mirrorMode } = storeToRefs(store);
const { info } = useToast();

const options = [
  { n: 1,  label: 'Single',        hint: '1 × 1', cols: 1 },
  { n: 2,  label: 'Side by side',  hint: '2 × 1', cols: 2 },
  { n: 3,  label: 'Three across',  hint: '3 × 1', cols: 3 },
  { n: 4,  label: 'Quad',          hint: '2 × 2', cols: 2 },
  { n: 6,  label: 'Six up',        hint: '3 × 2', cols: 3 },
  { n: 8,  label: 'Eight up',      hint: '3 × 3', cols: 3 },
  { n: 9,  label: 'Nine up',       hint: '3 × 3', cols: 3 },
  { n: 12, label: 'Twelve up',     hint: '4 × 3', cols: 4 },
  { n: 16, label: 'Sixteen up',    hint: '4 × 4', cols: 4 },
  { n: 24, label: 'Twenty-four',   hint: '5 × 5', cols: 5 },
  { n: 36, label: 'Thirty-six',    hint: '6 × 6', cols: 6 },
  { n: 60, label: 'Sixty',         hint: '8 × 8', cols: 8 },
];

const custom = ref(screenCount.value ?? 12);

const validCustom = computed(() =>
  Number.isInteger(custom.value) && custom.value >= 1 && custom.value <= 60
);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) custom.value = screenCount.value ?? 12;
  }
);

function miniStyle(cols, count) {
  return {
    gridTemplateColumns: `repeat(${Math.max(1, cols)}, 1fr)`,
    gridTemplateRows: `repeat(${Math.max(1, Math.ceil(count / Math.max(1, cols)))}, 1fr)`,
  };
}

function choose(count) {
  store.setScreenCount(count);
  info(`${store.screenCount} screen${store.screenCount === 1 ? '' : 's'} ready.`);
  emit('close');
}
</script>

<style scoped>
.setup-lede {
  font-size: 0.9rem;
  line-height: 1.6;
  color: var(--text-muted);
}
.setup-lede strong { color: var(--text-primary); font-weight: 600; }

.screen-options {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.screen-option {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  text-align: left;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  cursor: pointer;
  transition: border-color var(--transition), background-color var(--transition), transform var(--transition);
}
.screen-option:hover {
  border-color: var(--border-focus);
  transform: translateY(-1px);
}
.screen-option--active {
  border-color: var(--accent);
  background: var(--accent-dim);
  box-shadow: 0 0 0 1px var(--accent) inset;
}

.screen-option__top {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.screen-option__num {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--accent);
}
.screen-option--active .screen-option__num { color: var(--accent-hover); }
.screen-option__label {
  font-size: 0.8rem;
  font-weight: 550;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.screen-option__mini {
  display: grid;
  gap: 3px;
  height: 46px;
  padding: 3px;
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid var(--border);
}
.screen-option__mini i {
  display: block;
  border-radius: 1.5px;
  background: var(--text-muted);
  opacity: 0.45;
}
.screen-option--active .screen-option__mini i {
  background: var(--accent);
  opacity: 0.85;
}

.screen-option__hint {
  font-size: 0.7rem;
  color: var(--text-muted);
  letter-spacing: 0.03em;
}

.custom-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}
.custom-row__label { font-size: 0.8rem; font-weight: 600; }
.custom-row__controls { display: flex; gap: 8px; }
.custom-input {
  width: 84px;
  padding: 8px 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.9rem;
}
.custom-input:focus { outline: none; border-color: var(--border-focus); }
.custom-row__error { font-size: 0.75rem; color: var(--danger); }

.mirror-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
}
.mirror-option__check {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin-top: 2px;
  accent-color: var(--accent);
  cursor: pointer;
}
.mirror-option__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--text-muted);
}
.mirror-option__text strong { color: var(--text-primary); font-weight: 600; }

.setup-note {
  padding: 12px 14px;
  font-size: 0.78rem;
  line-height: 1.55;
  color: var(--text-muted);
  background: var(--accent-dim);
  border: 1px solid rgba(124, 92, 252, 0.25);
  border-radius: var(--radius-md);
}
.setup-note strong { color: var(--text-primary); }

.setup-note--warning {
  color: var(--warning);
  background: rgba(255, 179, 71, 0.08);
  border-color: rgba(255, 179, 71, 0.28);
}
.setup-note--warning strong { color: var(--warning); }

@media (max-width: 480px) {
  .screen-options { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
