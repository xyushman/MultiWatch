<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="modal-backdrop" @mousedown.self="$emit('close')">
        <div
          ref="dialogEl"
          class="modal"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          tabindex="-1"
        >
          <header class="modal__head">
            <div class="modal__heading">
              <h2 class="modal__title">{{ title }}</h2>
              <p v-if="subtitle" class="modal__subtitle">{{ subtitle }}</p>
            </div>
            <button class="btn-icon modal__close" type="button" aria-label="Close" @click="$emit('close')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </header>
          <div class="modal__body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="modal__foot">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps({
  open:     { type: Boolean, default: false },
  title:    { type: String,  required: true },
  subtitle: { type: String,  default: '' },
});

const emit = defineEmits(['close']);

const dialogEl = ref(null);
let previousOverflow = '';

function onKeydown(event) {
  if (event.key === 'Escape') {
    event.stopPropagation();
    emit('close');
  }
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', onKeydown);
      await nextTick();
      dialogEl.value?.focus();
    } else {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeydown);
    }
  }
);

onBeforeUnmount(() => {
  document.body.style.overflow = previousOverflow;
  window.removeEventListener('keydown', onKeydown);
});
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(5px);
}

.modal {
  width: min(640px, 100%);
  max-height: min(90dvh, 860px);
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  color: var(--text-primary);
  outline: none;
}

.modal__head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px 14px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.modal__heading { min-width: 0; }

.modal__title {
  font-size: 1.15rem;
  font-weight: 650;
  letter-spacing: -0.015em;
}

.modal__subtitle {
  margin-top: 4px;
  font-size: 0.82rem;
  color: var(--text-muted);
  line-height: 1.45;
}

.modal__close { flex-shrink: 0; }

.modal__body {
  padding: 18px 22px 22px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.modal__foot {
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 22px;
  background: var(--surface);
  border-top: 1px solid var(--border);
}

@media (max-width: 520px) {
  .modal-backdrop { padding: 10px; }
  .modal__head { padding: 16px 16px 12px; }
  .modal__body { padding: 16px; }
}
</style>
