<script lang="ts">
  import { toasts, dismiss } from '../lib/toast.svelte';
</script>

<div class="toasts" aria-live="polite">
  {#each toasts as t (t.id)}
    <div class="toast">
      <span>{t.text}</span>
      {#if t.action}
        <button
          class="primary"
          onclick={() => {
            t.action!.run();
            dismiss(t.id);
          }}>{t.action.label}</button
        >
      {/if}
      <button class="ghost" aria-label="Lukk" onclick={() => dismiss(t.id)}>✕</button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(16px + var(--safe-b));
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 100;
    width: min(560px, 92vw);
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #2b2b2b;
    border: 1px solid #555;
    border-radius: 12px;
    padding: 6px 6px 6px 16px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
  }
  .toast span {
    flex: 1;
  }
</style>
