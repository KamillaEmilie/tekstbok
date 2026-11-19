<script lang="ts">
  import { store, newSetlist, deleteSetlist } from '../lib/store.svelte';
  import { go } from '../lib/router.svelte';
  import { undoable } from '../lib/toast.svelte';
  import BackupReminder from './BackupReminder.svelte';
  import { describeSet, durationSec, formatTotal, setSummaries, songIdsOnly } from '../lib/types';
  import { songById } from '../lib/store.svelte';
  const totalSec = (ids: string[]) => ids.reduce((a, id) => a + (durationSec(songById(id)?.duration) ?? 0), 0);

  function add() {
    const l = newSetlist();
    go('setlist/' + l.id);
  }
  const fmt = (d?: string) => (d ? new Date(d + 'T12:00').toLocaleDateString('no', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
</script>

<div class="page">
  <div class="bar">
    <h1>Settlister</h1>
    <span style="flex:1"></span>
    <button class="primary" onclick={add}>+ Ny settliste</button>
  </div>
  <BackupReminder />
  {#each store.setlists as l (l.id)}
    <div class="item">
      <button class="main ghost" onclick={() => go('setlist/' + l.id)}>
        <span class="t">{l.name || '(uten navn)'}</span>
        <span class="m">
          {[fmt(l.date), l.venue, `${songIdsOnly(l).length} låter`, totalSec(songIdsOnly(l)) ? 'ca. ' + formatTotal(totalSec(songIdsOnly(l))) : ''].filter(Boolean).join(' · ')}
          {#if l.readyAt}<span class="ok"> · ✓ klar</span>{/if}
        </span>
        {#if setSummaries(l, (sid) => songById(sid)?.duration).length > 1}
          <span class="m sets">
            {#each setSummaries(l, (sid) => songById(sid)?.duration) as st, n}
              <span>Sett {n + 1}: {describeSet(st)}</span>
            {/each}
          </span>
        {/if}
      </button>
      <button
        class="danger"
        onclick={() => undoable(`Slettet settlisten «${l.name}»`, deleteSetlist(l.id))}>Slett</button
      >
    </div>
  {:else}
    <p class="empty">Ingen settlister ennå.</p>
  {/each}
</div>

<style>
  .item {
    display: flex;
    gap: 6px;
    align-items: center;
    background: var(--panel);
    border-radius: 12px;
    padding: 4px;
  }
  .main {
    flex: 1;
    text-align: left;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }
  .t {
    font-size: 1.1rem;
    font-weight: 700;
  }
  .m {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .sets {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
  }
  .ok {
    color: var(--ok);
  }
</style>
