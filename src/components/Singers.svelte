<script lang="ts">
  import { store, newSinger, saveSinger, deleteSinger } from '../lib/store.svelte';
  import { undoable } from '../lib/toast.svelte';
  import type { Singer } from '../lib/types';

  const used = (id: string) => store.songs.filter((s) => [s.hv, s.hv2, s.k1, s.k2].includes(id)).length;

  let timer: ReturnType<typeof setTimeout> | undefined;
  function touch(s: Singer) {
    clearTimeout(timer);
    timer = setTimeout(() => saveSinger(s), 300);
  }
</script>

<div class="page">
  <div class="bar">
    <h1>Vokalister</h1>
    <span style="flex:1"></span>
    <button class="primary" onclick={() => newSinger()}>+ Vokalist</button>
  </div>
  <p class="hint">
    Fargen brukes på teksten på scenen. Navnene kan også skrives rett i teksten, f.eks. <code>[Refreng | Siri & Leif]</code>.
  </p>
  {#each store.singers as s (s.id)}
    <div class="srow">
      <input type="color" bind:value={s.color} oninput={() => touch(s)} aria-label="Farge" />
      <input type="text" bind:value={s.name} oninput={() => touch(s)} placeholder="Navn" />
      <span class="sample" style:color={s.color}>{s.name || 'Eksempel'}</span>
      <span class="hint">{used(s.id)} låter</span>
      <button class="danger" onclick={() => undoable(`Fjernet ${s.name || 'vokalist'}`, deleteSinger(s.id))}>Fjern</button>
    </div>
  {/each}
</div>

<style>
  .srow {
    display: flex;
    gap: 10px;
    align-items: center;
    background: var(--panel);
    border-radius: 12px;
    padding: 8px;
  }
  input[type='color'] {
    width: 56px;
    height: 44px;
    padding: 2px;
    flex: none;
  }
  input[type='text'] {
    flex: 1;
    max-width: 280px;
  }
  .sample {
    font-weight: 700;
    font-size: 1.2rem;
    flex: 1;
  }
</style>
