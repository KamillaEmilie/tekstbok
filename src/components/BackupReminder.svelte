<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { go } from '../lib/router.svelte';

  const last = $derived(store.settings.lastExportAt);
  const changedSince = $derived(
    !last || store.songs.some((s) => s.updatedAt > last) || store.setlists.some((l) => (l.updatedAt ?? 0) > last),
  );
</script>

{#if changedSince && store.songs.length}
  <div class="rem">
    <span>
      💾 Husk å ta en sikkerhetskopi før spillejobben.
      {#if last}Sist eksportert {new Date(last).toLocaleDateString('no')}.{:else}Du har ikke eksportert ennå.{/if}
    </span>
    <button onclick={() => go('share')}>Eksporter</button>
  </div>
{/if}

<style>
  .rem {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    background: var(--panel);
    border: 1px solid #3a3a3a;
    border-radius: 12px;
    padding: 8px 8px 8px 14px;
    color: var(--muted);
  }
  .rem span {
    flex: 1;
  }
</style>
