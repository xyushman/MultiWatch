<template>
  <button
    type="button"
    class="empty-slot"
    :aria-label="`Empty screen ${index} — add a video`"
    :title="`Empty screen ${index} — add a video`"
    @click="$emit('add')"
  >
    <span class="empty-slot__icon" aria-hidden="true">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </span>
    <span class="empty-slot__text">
      <strong>Empty screen</strong>
      <span>Paste a link above to fill it</span>
    </span>
    <span class="empty-slot__num" aria-hidden="true">{{ index }}</span>
  </button>
</template>

<script setup>
defineProps({
  index: { type: Number, default: 1 },
});

defineEmits(['add']);
</script>

<style scoped>
.empty-slot {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 200px;
  width: 100%;
  padding: 20px;
  background:
    repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 10px,
      rgba(255, 255, 255, 0.012) 10px,
      rgba(255, 255, 255, 0.012) 20px
    ),
    var(--panel-bg);
  border: 1.5px dashed var(--border);
  border-radius: var(--radius-lg);
  color: var(--text-muted);
  font-family: inherit;
  cursor: pointer;
  transition: border-color var(--transition), background-color var(--transition), color var(--transition);
}

.empty-slot:hover,
.empty-slot:focus-visible {
  border-color: var(--accent);
  color: var(--text-primary);
  background-color: var(--accent-dim);
}

.empty-slot__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface-raised);
  color: var(--text-muted);
  transition: color var(--transition), border-color var(--transition), transform var(--transition);
}

.empty-slot:hover .empty-slot__icon {
  color: var(--accent);
  border-color: var(--accent);
  transform: scale(1.06);
}

.empty-slot__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: center;
  font-size: 0.82rem;
  line-height: 1.45;
}
.empty-slot__text strong {
  font-weight: 600;
  color: var(--text-primary);
}
.empty-slot__text span {
  font-size: 0.74rem;
  color: var(--text-muted);
}

.empty-slot__num {
  position: absolute;
  top: 10px;
  right: 12px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  opacity: 0.55;
}

@media (max-width: 768px) {
  .empty-slot { min-height: 150px; }
}
</style>
