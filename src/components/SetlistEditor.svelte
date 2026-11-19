<script lang="ts">
  import { flushSync, onDestroy } from 'svelte';
  import { store, setlistById, saveSetlist, deleteSetlist, songById } from '../lib/store.svelte';
  import { go } from '../lib/router.svelte';
  import { toast, undoable } from '../lib/toast.svelte';
  import { checkReady, type Check } from '../lib/ready';
  import { keepAwake } from '../lib/wake';
  import { bundleFilename, makeBundle, shareOrDownload } from '../lib/io';
  import BackupReminder from './BackupReminder.svelte';
  import { MARKER_NAMES, durationSec, formatTotal, isMarker, newMarkerId, songIdsOnly, type MarkerKind } from '../lib/types';

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
  /** Låtnummer per rad (skiller får ikke nummer). */
  const numbers = $derived.by(() => {
    let n = 0;
    return (l?.songIds ?? []).map((x) => (isMarker(x) ? null : ++n));
  });
  const songCount = $derived(l ? songIdsOnly(l).length : 0);
  /** Samlet spilletid for låtene, og hvor mange som mangler varighet. */
  const total = $derived.by(() => {
    let sec = 0;
    let missing = 0;
    for (const sid of l ? songIdsOnly(l) : []) {
      const d = durationSec(songById(sid)?.duration);
      if (d === null) missing++;
      else sec += d;
    }
    return { sec, missing };
  });

  let lastAdded = $state<string | null>(null);
  function addMarker(kind: MarkerKind) {
    if (!l) return;
    const mid = newMarkerId();
    l.markers = { ...(l.markers ?? {}), [mid]: { kind, text: '' } };
    lastAdded = mid;
    setIds([...l.songIds, mid]);
  }
  function setKind(mid: string, kind: MarkerKind) {
    if (!l?.markers?.[mid]) return;
    l.markers[mid].kind = kind;
    saveSetlist(l);
  }
  /** Fokuserer tekstfeltet til et nytt skille og scroller det fram. */
  function focusNew(node: HTMLTextAreaElement, mid: string) {
    if (mid === lastAdded) {
      lastAdded = null;
      setTimeout(() => {
        node.scrollIntoView({ block: 'center', behavior: 'smooth' });
        node.focus({ preventScroll: true });
      }, 50);
    }
  }

  function addSong(sid: string) {
    if (!l || l.songIds.includes(sid)) return;
    setIds([...l.songIds, sid]);
  }
  function removeAt(i: number) {
    if (!l) return;
    const before = [...l.songIds];
    const id0 = before[i];
    const title = isMarker(id0) ? MARKER_NAMES[l.markers?.[id0]?.kind ?? 'pause'].toLowerCase() : `«${songById(id0)?.title ?? ''}»`;
    setIds(before.filter((_, j) => j !== i));
    undoable(`Fjernet ${title} fra lista`, () => setIds(before));
  }
  function move(from: number, to: number) {
    if (!l || to < 0 || to >= l.songIds.length || from === to) return;
    const ids = [...l.songIds];
    const [x] = ids.splice(from, 1);
    ids.splice(to, 0, x);
    l.songIds = ids;
  }

  // ---- Dra for å endre rekkefølge ----
  // Lytter på hele vinduet (ikke på håndtaket): når radene byttes om, flyttes elementene i DOM,
  // og da mister iPad «grepet» (pointer capture) hvis lytterne sitter på selve håndtaket.
  let listEl = $state<HTMLElement>();
  let dragIdx = $state<number | null>(null);
  let pointerId: number | null = null;
  let lastY = 0;
  let startY = 0;
  let scrollTimer: ReturnType<typeof setInterval> | undefined;
  let scroller: HTMLElement | null = null;

  const mid = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.top + r.height / 2;
  };

  /** Flytter raden ett hakk om gangen så lenge fingeren er forbi midten av naboraden. */
  function reorder() {
    if (dragIdx === null || !listEl) return;
    let idx = dragIdx;
    for (let guard = 0; guard < 50; guard++) {
      const rows = listEl.querySelectorAll('.srow');
      const prev = rows[idx - 1];
      const next = rows[idx + 1];
      let to = idx;
      if (prev && lastY < mid(prev)) to = idx - 1;
      else if (next && lastY > mid(next)) to = idx + 1;
      if (to === idx) return;
      move(idx, to);
      dragIdx = idx = to;
      flushSync(); // oppdater DOM før neste måling
    }
  }

  /** Scroller lista når fingeren er nær kanten, så man kan dra forbi det som vises. */
  function autoScroll() {
    if (dragIdx === null) return;
    if (scroller) {
      const r = scroller.getBoundingClientRect();
      const zone = 70;
      let dy = 0;
      // Bare når fingeren er dratt mot kanten (ikke om man tar tak i en rad som allerede ligger ved kanten).
      if (lastY < r.top + zone && lastY < startY - 20) dy = -Math.ceil((r.top + zone - lastY) / 8);
      else if (lastY > r.bottom - zone && lastY > startY + 20) dy = Math.ceil((lastY - (r.bottom - zone)) / 8);
      if (dy) {
        scroller.scrollTop += dy;
        reorder();
      }
    }
  }

  function onMove(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    e.preventDefault();
    lastY = e.clientY;
    reorder();
  }

  function down(e: PointerEvent, i: number) {
    if (dragIdx !== null) return;
    e.preventDefault();
    dragIdx = i;
    pointerId = e.pointerId;
    lastY = startY = e.clientY;
    scroller = listEl?.closest('main') ?? null;
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    scrollTimer = setInterval(autoScroll, 16);
  }

  function endDrag(e?: PointerEvent) {
    if (e && e.pointerId !== pointerId) return;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    clearInterval(scrollTimer);
    pointerId = null;
    if (dragIdx === null || !l) return;
    dragIdx = null;
    checks = null;
    saveSetlist(l, true);
  }
  onDestroy(() => endDrag());

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
      <button class="primary" onclick={() => start(0)} disabled={!songCount}>▶ Scenemodus</button>
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
      <h2>Låter ({songCount})</h2>
      {#if total.sec}
        <span class="hint">ca. {formatTotal(total.sec)}{total.missing ? ` + ${total.missing} uten tid` : ''}</span>
      {/if}
      <span style="flex:1"></span>
      <button onclick={() => addMarker('pause')}>+ Pause</button>
      <button onclick={() => addMarker('prat')}>+ Prat</button>
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
        {@const s = isMarker(sid) ? undefined : songById(sid)}
        {@const mk = isMarker(sid) ? l.markers?.[sid] : undefined}
        <div class="srow" class:dragging={dragIdx === i} class:marker={!!mk} class:pause={mk?.kind === 'pause'}>
          <span
            class="handle"
            role="button"
            tabindex="-1"
            aria-label="Dra for å flytte"
            onpointerdown={(e) => down(e, i)}>☰</span
          >
          {#if mk}
            <div class="mbody">
              <div class="bar">
                {#each ['pause', 'prat'] as const as k}
                  <button class="kind" class:on={mk.kind === k} onclick={() => setKind(sid, k)}
                    >{k === 'pause' ? '⏸ Pause' : '💬 Prat'}</button
                  >
                {/each}
              </div>
              <textarea
                rows="2"
                bind:value={mk.text}
                oninput={touchMeta}
                use:focusNew={sid}
                placeholder={mk.kind === 'pause' ? 'Notat til pausen (valgfritt), f.eks. «15 min – tilbake 21:30»' : 'Hva skal vi si? F.eks. «Takk til arrangøren, presenter bandet»'}
              ></textarea>
            </div>
          {:else}
            <span class="n">{numbers[i]}</span>
            <button class="ghost t" onclick={() => s && go('song/' + s.id)}>
              {s?.title || '(mangler)'}
              {#if s && !s.text.trim()}<span class="warn">mangler tekst</span>{/if}
              <span class="hint">{[s?.key, s?.bpm && s.bpm + ' BPM', s?.duration].filter(Boolean).join(' · ')}</span>
            </button>
          {/if}
          <button onclick={() => start(i)} aria-label="Start her">▶</button>
          <button onclick={() => removeAt(i)} aria-label="Fjern fra lista">✕</button>
        </div>
      {:else}
        <p class="empty">Lista er tom. Trykk «+ Legg til låter».</p>
      {/each}
    </div>
    {#if l.songIds.length}
      <p class="hint" style="margin:0">
        «+ Pause» og «+ Prat» legges nederst. Dra dem med ☰ dit de skal stå. I scenemodus får de en egen side mellom låtene.
      </p>
    {/if}

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
  .srow.marker {
    background: transparent;
    border: 1px dashed #555;
    align-items: flex-start;
  }
  .srow.marker.pause {
    border: 2px solid var(--muted);
    background: #181818;
  }
  .srow.marker.dragging {
    border-color: var(--acc);
  }
  .mbody {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 4px 0;
    min-width: 0;
  }
  .mbody textarea {
    min-height: 44px;
    resize: vertical;
    line-height: 1.4;
  }
  .kind {
    min-height: 36px;
    padding: 0.3em 0.8em;
  }
  .warn {
    color: var(--bad);
    font-size: 0.8rem;
  }
</style>
