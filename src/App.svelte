<script lang="ts">
  import { store } from './lib/store.svelte';
  import { router, go } from './lib/router.svelte';
  import { pwa, applyUpdate } from './lib/pwa.svelte';
  import Library from './components/Library.svelte';
  import SongEditor from './components/SongEditor.svelte';
  import Setlists from './components/Setlists.svelte';
  import SetlistEditor from './components/SetlistEditor.svelte';
  import Stage from './components/Stage.svelte';
  import Singers from './components/Singers.svelte';
  import Share from './components/Share.svelte';
  import Toasts from './components/Toasts.svelte';

  const route = $derived(router.route);
  const tab = $derived(
    route.name === 'song' ? 'library' : route.name === 'setlist' ? 'setlists' : route.name,
  );
  const tabs = [
    ['library', 'Låter'],
    ['setlists', 'Settlister'],
    ['singers', 'Vokalister'],
    ['share', 'Deling'],
  ] as const;
</script>

{#if !store.loaded}
  <div class="loading">Laster …</div>
{:else if route.name === 'stage'}
  {#key `${route.setlistId}-${route.songId}`}
    <Stage setlistId={route.setlistId} songId={route.songId} index={route.index} />
  {/key}
{:else}
  <div class="shell">
    <nav>
      <span class="logo">Tekstbok</span>
      {#each tabs as [id, label]}
        <button class:on={tab === id} onclick={() => go(id)}>{label}</button>
      {/each}
    </nav>
    {#if pwa.updateReady}
      <div class="update">
        En ny versjon er klar og tas i bruk neste gang appen startes.
        <button onclick={applyUpdate}>Start på nytt nå</button>
        <button class="ghost" onclick={() => (pwa.updateReady = false)} aria-label="Skjul">✕</button>
      </div>
    {/if}
    <main>
      {#if route.name === 'library'}
        <Library />
      {:else if route.name === 'song'}
        {#key route.id}<SongEditor id={route.id} />{/key}
      {:else if route.name === 'setlists'}
        <Setlists />
      {:else if route.name === 'setlist'}
        {#key route.id}<SetlistEditor id={route.id} />{/key}
      {:else if route.name === 'singers'}
        <Singers />
      {:else if route.name === 'share'}
        <Share />
      {/if}
    </main>
  </div>
{/if}
<Toasts />

<style>
  .loading {
    display: grid;
    place-items: center;
    height: 100%;
    color: var(--muted);
  }
  .shell {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  nav {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
    padding: calc(8px + var(--safe-t)) calc(14px + var(--safe-r)) 8px calc(14px + var(--safe-l));
    border-bottom: 1px solid var(--line);
    background: var(--bg);
  }
  .logo {
    font-weight: 700;
    margin-right: 10px;
    font-size: 1.15rem;
  }
  nav button {
    background: transparent;
    border-color: transparent;
  }
  nav button.on {
    background: var(--acc);
  }
  main {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .update {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    padding: 6px 16px;
    background: var(--panel);
    color: var(--muted);
    font-size: 0.9rem;
  }
</style>
