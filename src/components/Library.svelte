<script lang="ts">
  import { store, newSong, deleteSong } from '../lib/store.svelte';
  import { go } from '../lib/router.svelte';
  import { undoable } from '../lib/toast.svelte';
  import { keepAwake } from '../lib/wake';

  let q = $state('');
  const list = $derived.by(() => {
    const s = q.trim().toLowerCase();
    const sorted = [...store.songs].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'no'));
    if (!s) return sorted;
    return sorted.filter(
      (x) => x.title.toLowerCase().includes(s) || (x.artist ?? '').toLowerCase().includes(s) || x.text.toLowerCase().includes(s),
    );
  });
  const usage = (id: string) => store.setlists.filter((l) => l.songIds.includes(id)).length;

  function add() {
    const s = newSong();
    go('song/' + s.id);
  }
  function remove(id: string, title: string) {
    undoable(`Slettet «${title || 'uten tittel'}»`, deleteSong(id));
  }
</script>

<div class="page">
  <div class="bar">
    <h1>Låter</h1>
    <span class="hint">{store.songs.length} i biblioteket</span>
    <span style="flex:1"></span>
    <button class="primary" onclick={add}>+ Ny låt</button>
  </div>
  <input type="search" placeholder="Søk i tittel, artist eller tekst" bind:value={q} />
  {#each list as s (s.id)}
    <div class="item">
      <button class="main ghost" onclick={() => go('song/' + s.id)}>
        <span class="t">{s.title || '(uten tittel)'}</span>
        <span class="m">
          {[s.artist, s.key && 'Toneart ' + s.key, usage(s.id) && `${usage(s.id)} settliste${usage(s.id) > 1 ? 'r' : ''}`]
            .filter(Boolean)
            .join(' · ')}
          {#if !s.text.trim()}<span class="warn">· mangler tekst</span>{/if}
        </span>
      </button>
      <button
        onclick={() => {
          keepAwake();
          go('play/' + s.id);
        }}
        aria-label="Vis på scenen">▶</button
      >
      <button class="danger" onclick={() => remove(s.id, s.title)} aria-label="Slett">Slett</button>
    </div>
  {:else}
    <p class="empty">{q ? 'Ingen treff.' : 'Ingen låter ennå. Trykk «+ Ny låt» og lim inn en tekst.'}</p>
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
    min-width: 0;
  }
  .t {
    font-size: 1.1rem;
    font-weight: 700;
  }
  .m {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .warn {
    color: var(--bad);
  }
</style>
