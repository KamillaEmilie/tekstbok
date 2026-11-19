<script lang="ts">
  import { store, newSong, deleteSong, saveSong } from '../lib/store.svelte';
  import { fromPastedText } from '../lib/importText';
  import { go } from '../lib/router.svelte';
  import { toast, undoable } from '../lib/toast.svelte';
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
  // ---- Ny låt fra utklippstavlen ----
  let pasteOpen = $state(false);
  let pasted = $state('');
  async function fromClipboard() {
    let raw = '';
    try {
      raw = (await navigator.clipboard?.readText?.()) ?? '';
    } catch {
      /* ikke tillatt eller ikke støttet: vis innlimingsfeltet */
    }
    if (raw.trim()) createFrom(raw);
    else pasteOpen = true;
  }
  function createFrom(raw: string) {
    const p = fromPastedText(raw);
    if (!p.text.trim()) {
      toast('Fant ingen tekst å lage låt av.');
      return;
    }
    const s = newSong();
    s.title = p.title;
    s.artist = p.artist;
    s.text = p.text;
    saveSong(s);
    pasteOpen = false;
    pasted = '';
    go('song/' + s.id);
    toast(p.title ? `Laget «${p.title}». Sjekk tittel og artist.` : 'Låten er laget. Skriv inn tittel og artist.');
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
    <button onclick={fromClipboard}>📋 Ny låt fra utklippstavlen</button>
    <button class="primary" onclick={add}>+ Ny låt</button>
  </div>
  {#if pasteOpen}
    <div class="card paste">
      <b>Lim inn teksten her</b>
      <span class="hint">Hold fingeren i feltet og velg «Lim inn». Overskrifter og «Source:»-linjer fjernes automatisk.</span>
      <!-- svelte-ignore a11y_autofocus -->
      <textarea bind:value={pasted} rows="6" autofocus placeholder="Lim inn sangteksten"></textarea>
      <div class="bar">
        <button class="primary" onclick={() => createFrom(pasted)} disabled={!pasted.trim()}>Lag låt</button>
        <button onclick={() => ((pasteOpen = false), (pasted = ''))}>Avbryt</button>
      </div>
    </div>
  {/if}
  <input type="search" placeholder="Søk i tittel, artist eller tekst" bind:value={q} />
  {#each list as s (s.id)}
    <div class="item">
      <button class="main ghost" onclick={() => go('song/' + s.id)}>
        <span class="t">{s.title || '(uten tittel)'}</span>
        <span class="m">
          {[s.artist, s.key && 'Toneart ' + s.key, s.duration, usage(s.id) && `${usage(s.id)} settliste${usage(s.id) > 1 ? 'r' : ''}`]
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
  .paste {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
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
