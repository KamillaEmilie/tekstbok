<script lang="ts">
  import { store, setlistById, saveSetlist, deleteSetlist, songById } from '../lib/store.svelte';
  import { go } from '../lib/router.svelte';
  import { toast, undoable } from '../lib/toast.svelte';
  import { checkReady, type Check } from '../lib/ready';
  import { keepAwake } from '../lib/wake';
  import { bundleFilename, makeBundle, shareOrDownload } from '../lib/io';
  import BackupReminder from './BackupReminder.svelte';

  let { id }: { id: string } = $props();
  const l = $derived(setlistById(id));

  let q = $state('');
  let adding = $state(false);
  let checks = $state<Check[] | null>(null);
  let checking = $state(false);
  const allOk = $derived(!!checks && checks.every((c) => c.ok));

  const candidates = $derived.by(() => {
    const s = q.trim().toLowerCase();
    return [...store.songs]
      .sort((a, b) => a.title.localeCompare(b.title, 'no'))
      .filter((x) => !s || x.title.toLowerCase().includes(s) || (x.artist ?? '').toLowerCase().includes(s));
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  function touchMeta() {
    clearTimeout(timer);
    timer = setTimeout(() => l && saveSetlist(l), 350);
  }

  function setIds(ids: string[]) {
    if (!l) return;
    l.songIds = ids;
    checks = null;
    saveSetlist(l, true);
  }
  function addSong(sid: string) {
    if (!l || l.songIds.includes(sid)) return;
    setIds([...l.songIds, sid]);
  }
  function removeAt(i: number) {
    if (!l) return;
    const before = [...l.songIds];
    const title = songById(before[i])?.title ?? '';
    setIds(before.filter((_, j) => j !== i));
    undoable(`Fjernet «${title}» fra lista`, () => setIds(before));
  }
  function move(from: number, to: number) {
    if (!l || to < 0 || to >= l.songIds.length || from === to) return;
    const ids = [...l.songIds];
    const [x] = ids.splice(from, 1);
    ids.splice(to, 0, x);
    l.songIds = ids;
  }

  // ---- Dra for å endre rekkefølge (pekerhendelser virker med finger på iPad) ----
  let listEl = $state<HTMLElement>();
  let dragIdx = $state<number | null>(null);
  function down(e: PointerEvent, i: number) {
    e.preventDefault();
    dragIdx = i;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function moveDrag(e: PointerEvent) {
    if (dragIdx === null || !listEl) return;
    const rows = [...listEl.querySelectorAll<HTMLElement>('.srow')];
    let target = rows.length - 1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) {
        target = i;
        break;
      }
    }
    if (target !== dragIdx) {
      move(dragIdx, target);
      dragIdx = target;
    }
  }
  function up() {
    if (dragIdx === null || !l) return;
    dragIdx = null;
    checks = null;
    saveSetlist(l, true);
  }

  async function runCheck() {
    if (!l) return;
    checking = true;
    checks = null;
    try {
      checks = await checkReady($state.snapshot(l), store.songs);
      if (checks.every((c) => c.ok)) {
        l.readyAt = Date.now();
        saveSetlist(l);
      }
    } finally {
      checking = false;
    }
  }

  async function exportList() {
    if (!l) return;
    const b = makeBundle($state.snapshot(store) as never, l.id);
    const r = await shareOrDownload(b, bundleFilename(l.name));
    if (r !== 'cancelled') {
      toast(r === 'shared' ? 'Settlisten er delt.' : 'Settlisten er lastet ned.');
    }
  }

  function remove() {
    if (!l) return;
    const name = l.name;
    const undo = deleteSetlist(l.id);
    go('setlists');
    undoable(`Slettet settlisten «${name}»`, undo);
  }

  function start(i = 0) {
    keepAwake();
    go(`stage/${id}/${i}`);
  }
</script>

{#if !l}
  <div class="page"><p class="empty">Fant ikke settlisten. <button onclick={() => go('setlists')}>Til settlister</button></p></div>
{:else}
  <div class="page">
    <div class="bar">
      <button class="ghost" onclick={() => go('setlists')}>‹ Settlister</button>
      <span style="flex:1"></span>
      <button onclick={exportList}>Del / eksporter</button>
      <button class="primary" onclick={() => start(0)} disabled={!l.songIds.length}>▶ Scenemodus</button>
    </div>
    <div class="row" oninput={touchMeta}>
      <label class="f" style="flex:2">Navn<input bind:value={l.name} /></label>
      <label class="f">Dato<input type="date" bind:value={l.date} /></label>
      <label class="f" style="flex:1.5">Sted<input bind:value={l.venue} /></label>
    </div>

    <div class="card ready">
      <div class="bar">
        <button class="primary" onclick={runCheck} disabled={checking}>{checking ? 'Sjekker …' : 'Klar for spillejobb'}</button>
        {#if checks}
          {#if allOk}
            <span class="okbig">✓ Klar – fungerer uten nett</span>
          {:else}
            <span class="badbig">Ikke klar ennå</span>
          {/if}
        {:else if l.readyAt}
          <span class="hint">Sist sjekket {new Date(l.readyAt).toLocaleString('no', { dateStyle: 'short', timeStyle: 'short' })}</span>
        {/if}
      </div>
      {#if checks}
        <ul>
          {#each checks as c}
            <li class:ok={c.ok} class:bad={!c.ok}>
              {c.ok ? '✓' : '✕'}
              {c.label}
              {#if c.detail}<div class="hint">{c.detail}</div>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
    <BackupReminder />

    <div class="bar">
      <h2>Låter ({l.songIds.length})</h2>
      <span style="flex:1"></span>
      <button class:on={adding} onclick={() => (adding = !adding)}>{adding ? 'Ferdig' : '+ Legg til låter'}</button>
    </div>

    {#if adding}
      <div class="card add">
        <input type="search" placeholder="Søk i biblioteket" bind:value={q} />
        {#each candidates as s (s.id)}
          {@const inList = l.songIds.includes(s.id)}
          <div class="crow">
            <span class="t">{s.title || '(uten tittel)'} <span class="hint">{s.artist}</span></span>
            <button onclick={() => addSong(s.id)} disabled={inList}>{inList ? '✓ I lista' : '+ Legg til'}</button>
          </div>
        {:else}
          <p class="hint">Ingen låter. Legg dem inn under «Låter» først.</p>
        {/each}
      </div>
    {/if}

    <div class="list" bind:this={listEl}>
      {#each l.songIds as sid, i (sid)}
        {@const s = songById(sid)}
        <div class="srow" class:dragging={dragIdx === i}>
          <span
            class="handle"
            role="button"
            tabindex="-1"
            aria-label="Dra for å flytte"
            onpointerdown={(e) => down(e, i)}
            onpointermove={moveDrag}
            onpointerup={up}
            onpointercancel={up}>☰</span
          >
          <span class="n">{i + 1}</span>
          <button class="ghost t" onclick={() => s && go('song/' + s.id)}>
            {s?.title || '(mangler)'}
            {#if s && !s.text.trim()}<span class="warn">mangler tekst</span>{/if}
            <span class="hint">{[s?.key, s?.bpm && s.bpm + ' BPM'].filter(Boolean).join(' · ')}</span>
          </button>
          <button onclick={() => start(i)} aria-label="Start her">▶</button>
          <button onclick={() => removeAt(i)} aria-label="Fjern fra lista">✕</button>
        </div>
      {:else}
        <p class="empty">Lista er tom. Trykk «+ Legg til låter».</p>
      {/each}
    </div>

    <div class="bar">
      <span style="flex:1"></span>
      <button class="danger" onclick={remove}>Slett settliste</button>
    </div>
  </div>
{/if}

<style>
  .ready ul {
    list-style: none;
    padding: 0;
    margin: 12px 0 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  li.ok {
    color: var(--ok);
  }
  li.bad {
    color: var(--bad);
  }
  .okbig {
    color: var(--ok);
    font-weight: 700;
    font-size: 1.15rem;
  }
  .badbig {
    color: var(--bad);
    font-weight: 700;
  }
  .add {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 50vh;
    overflow: auto;
  }
  .crow {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .crow .t {
    flex: 1;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .srow {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--panel);
    border-radius: 12px;
    padding: 4px;
    border: 1px solid transparent;
  }
  .srow.dragging {
    border-color: var(--acc);
    background: var(--panel2);
  }
  .handle {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    color: var(--muted);
    touch-action: none;
    cursor: grab;
    font-size: 1.2rem;
    -webkit-user-select: none;
    user-select: none;
  }
  .n {
    color: var(--muted);
    width: 1.8em;
    text-align: right;
  }
  .srow .t {
    flex: 1;
    text-align: left;
    display: flex;
    gap: 10px;
    align-items: baseline;
    flex-wrap: wrap;
    font-size: 1.05rem;
  }
  .warn {
    color: var(--bad);
    font-size: 0.8rem;
  }
</style>
