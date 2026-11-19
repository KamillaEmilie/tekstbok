<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { store, setlistById, songById, saveSong, saveSettings } from '../lib/store.svelte';
  import { go, replace } from '../lib/router.svelte';
  import { keepAwake, rearm, releaseAwake } from '../lib/wake';
  import { personColor } from '../lib/parser';
  import { LAYOUTS, LAYOUT_NAMES, MARKER_NAMES, MODE_NAMES, MODE_ROLES, describeSet, isMarker, setSummaries, type Marker, type Song } from '../lib/types';
  import Lyrics from './Lyrics.svelte';

  let { setlistId, songId, index }: { setlistId: string | null; songId: string | null; index: number } = $props();

  const setlist = $derived(setlistId ? setlistById(setlistId) : undefined);
  /** Det som vises én side om gangen: låter og skiller (pause/prat). no = låtnummer. */
  type Item = { id: string; song?: Song; marker?: Marker; no?: number };
  const items = $derived.by((): Item[] => {
    if (setlist) {
      let n = 0;
      return setlist.songIds.flatMap((id): Item[] => {
        if (isMarker(id)) {
          const m = setlist.markers?.[id];
          return m ? [{ id, marker: m }] : [];
        }
        const s = songById(id);
        return s ? [{ id, song: s, no: ++n }] : [];
      });
    }
    const s = songId ? songById(songId) : undefined;
    return s ? [{ id: s.id, song: s, no: 1 }] : [];
  });
  const songCount = $derived(items.filter((i) => i.song).length);
  // svelte-ignore state_referenced_locally
  let cur = $state(index);
  const item = $derived(items[Math.min(cur, items.length - 1)]);
  const song = $derived(item?.song);
  const marker = $derived(item?.marker);
  const nextSong = $derived(items.slice(cur + 1).find((i) => i.song)?.song);
  const light = $derived(store.settings.light);
  let showList = $state(false);

  let box = $state<HTMLDivElement>();
  let el = $state<HTMLDivElement>();

  const singerOf = (id?: string) => store.singers.find((s) => s.id === id);
  const roles = $derived(
    song
      ? MODE_ROLES[song.mode]
          .map((r) => ({ label: r.label, singer: singerOf(song[r.code]) }))
          .filter((r) => r.singer)
      : [],
  );
  const meta = $derived(
    song
      ? [song.key && 'Toneart ' + song.key, song.bpm && song.bpm + ' BPM', song.capo && 'Capo ' + song.capo, song.duration].filter(Boolean).join(' · ')
      : '',
  );

  function goTo(n: number) {
    if (n < 0 || n >= items.length || n === cur) return;
    cur = n;
    if (setlistId) replace(`stage/${setlistId}/${n}`);
    if (box) box.scrollTop = 0;
  }
  const next = () => goTo(cur + 1);
  const prev = () => goTo(cur - 1);

  function close() {
    releaseAwake();
    if (setlistId) go('setlist/' + setlistId);
    else if (songId) go('song/' + songId);
    else go('library');
  }

  // ---- Skriftstørrelse og oppsett ----
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  function fit() {
    if (!box || !el || !song) return;
    const lay = song.layout ?? 'scroll';
    const scale = store.settings.scale;
    el.style.columnCount = '';
    if (lay === 'scroll') {
      el.style.fontSize = Math.round(clamp(box.clientWidth / 26, 22, 44) * scale) + 'px';
      return;
    }
    if (lay === 'cols2') {
      el.style.columnCount = '2';
      el.style.fontSize = Math.round(clamp(box.clientWidth / 44, 18, 38) * scale) + 'px';
      return;
    }
    // fit: største skrift der hele låten får plass, med 1–3 spalter
    const cs = getComputedStyle(box);
    const H = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const W = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    let best = { size: 12, cols: 3 };
    for (const cols of [1, 2, 3]) {
      el.style.columnCount = String(cols);
      let lo = 10;
      let hi = 90;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        el.style.fontSize = mid + 'px';
        if (el.scrollWidth <= W + 2 && el.scrollHeight <= H + 2) lo = mid;
        else hi = mid;
      }
      if (lo > best.size) best = { size: lo, cols };
    }
    el.style.columnCount = String(best.cols);
    el.style.fontSize = Math.max(10, Math.round(best.size * Math.min(1, scale))) + 'px';
  }

  $effect(() => {
    // Avhengigheter som skal gi ny tilpasning:
    void [song?.id, song?.text, song?.layout, store.settings.scale, light, store.singers.length];
    void tick().then(fit);
  });

  function bigger() {
    store.settings.scale = Math.min(2, Math.round((store.settings.scale + 0.1) * 10) / 10);
    saveSettings();
  }
  function smaller() {
    store.settings.scale = Math.max(0.6, Math.round((store.settings.scale - 0.1) * 10) / 10);
    saveSettings();
  }
  function toggleLight() {
    store.settings.light = !store.settings.light;
    saveSettings();
  }
  function cycleLayout() {
    if (!song) return;
    song.layout = LAYOUTS[(LAYOUTS.indexOf(song.layout) + 1) % LAYOUTS.length];
    saveSong(song);
    if (box) box.scrollTop = 0;
  }

  // ---- Tastatur / Bluetooth-pedal ----
  function onKey(e: KeyboardEvent) {
    if (showList) {
      if (e.key === 'Escape') showList = false;
      return;
    }
    // En knapp med fokus skal ikke «trykkes» av mellomrom/pedal.
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) {
      e.preventDefault();
      next();
    } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
      e.preventDefault();
      prev();
    } else if (e.key === 'Escape') close();
  }

  // ---- Sveip ----
  let sx: number | null = null;
  let sy = 0;
  function tStart(e: TouchEvent) {
    if (e.touches.length !== 1) return (sx = null);
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }
  function tEnd(e: TouchEvent) {
    if (sx === null || showList) return;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    sx = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? next : prev)();
  }

  let ro: ResizeObserver | undefined;
  onMount(() => {
    keepAwake();
    window.addEventListener('keydown', onKey);
    ro = new ResizeObserver(() => fit());
    if (box) ro.observe(box);
    void document.fonts?.ready.then(fit);
  });
  onDestroy(() => {
    window.removeEventListener('keydown', onKey);
    ro?.disconnect();
    releaseAwake();
  });
</script>

<div
  class="stage l-{song ? song.layout : 'marker'}"
  class:light
  ontouchstart={tStart}
  ontouchend={tEnd}
  onpointerdown={rearm}
  role="application"
>
  {#if !item}
    <div class="nothing">
      <p>Ingen låter å vise.</p>
      <button onclick={close}>Lukk</button>
    </div>
  {:else if marker}
    <header>
      <div class="top">
        <span class="title">{MARKER_NAMES[marker.kind]}</span>
        <span class="meta"></span>
      </div>
    </header>
    <div class="body" bind:this={box}>
      <div class="marker {marker.kind}" style:font-size="{Math.round(34 * store.settings.scale)}px">
        {#if marker.kind === 'pause'}<div class="big">Pause</div>{/if}
        {#if marker.text.trim()}<div class="mtext">{marker.text}</div>{/if}
        {#if nextSong}<div class="next">Neste låt: <b>{nextSong.title || '(uten tittel)'}</b></div>{/if}
      </div>
    </div>
  {:else if song}
    <header>
      <div class="top">
        <span class="title">{song.title || '(uten tittel)'}</span>
        <span class="meta">{meta}</span>
        <span class="pos">{item.no} / {songCount}</span>
      </div>
      {#if roles.length || song.notes}
        <div class="legend">
          {#if roles.length}<span><b>{MODE_NAMES[song.mode]}</b></span>{/if}
          {#each roles as r}
            <span
              >{r.label}:
              <b style:color={personColor(r.singer!.color, light)}>{r.singer!.name}</b></span
            >
          {/each}
          {#if song.notes}<span class="notes">{song.notes}</span>{/if}
        </div>
      {/if}
    </header>
    <div class="body" bind:this={box}>
      {#key song.id}
        <Lyrics {song} singers={store.singers} {light} bind:el />
      {/key}
    </div>
  {/if}
  {#if item}
    <footer>
      <button class="nav" onclick={prev} disabled={cur === 0}>◀ Forrige</button>
      <button class="nav" onclick={next} disabled={cur >= items.length - 1}>Neste ▶</button>
      <span class="sp"></span>
      {#if song}<button onclick={cycleLayout}>{LAYOUT_NAMES[song.layout]}</button>{/if}
      <button onclick={smaller} aria-label="Mindre skrift">A−</button>
      <button onclick={bigger} aria-label="Større skrift">A+</button>
      <button onclick={toggleLight}>{light ? 'Mørk' : 'Lys'}</button>
      {#if items.length > 1}<button onclick={() => (showList = true)}>Liste</button>{/if}
      <button onclick={close}>Lukk</button>
    </footer>
    {#if items.length > 1}
      <button class="tap left" aria-label="Forrige låt" onclick={prev}></button>
      <button class="tap right" aria-label="Neste låt" onclick={next}></button>
    {/if}
  {/if}

  {#if showList}
    <div class="overlay" onclick={(e) => e.target === e.currentTarget && (showList = false)} role="presentation">
      <div class="box">
        <h2>{setlist?.name ?? 'Låter'}</h2>
        {#if setlist}
          {@const sets = setSummaries(setlist, (sid) => songById(sid)?.duration)}
          {#if sets.length > 1 || sets[0]?.sec}
            <div class="setsum">
              {#each sets as st, n}<span>{sets.length > 1 ? `Sett ${n + 1}: ` : ''}{describeSet(st)}</span>{/each}
            </div>
          {/if}
        {/if}
        {#each items as it, i (it.id)}
          <button
            class="ghost li"
            class:cur={i === cur}
            class:mk={!!it.marker}
            onclick={() => {
              goTo(i);
              showList = false;
            }}
            >{#if it.song}{it.no}. {it.song.title || '(uten tittel)'}{:else if it.marker}{it.marker.kind === 'pause' ? '⏸ Pause' : '💬 Prat'}{#if it.marker.text.trim()}<span
                  class="mprev">– {it.marker.text.trim().split('\n')[0]}</span
                >{/if}{/if}</button
          >
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .stage {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    color: var(--fg);
    padding: var(--safe-t) var(--safe-r) var(--safe-b) var(--safe-l);
  }
  .stage.light {
    --bg: #fff;
    --fg: #111;
    --muted: #666;
    --line: #ddd;
    --panel2: #eee;
    --acc: #b5470b;
    color-scheme: light;
  }
  .stage.light button {
    border-color: #ccc;
  }
  header {
    border-bottom: 1px solid var(--line);
    padding: 10px 22px 6px;
  }
  .top {
    display: flex;
    align-items: baseline;
    gap: 16px;
  }
  .title {
    font-size: 2rem;
    font-weight: 700;
    line-height: 1.1;
  }
  .meta {
    color: var(--muted);
    font-size: 1.15rem;
    flex: 1;
  }
  .pos {
    color: var(--muted);
    font-size: 1.15rem;
    white-space: nowrap;
  }
  .legend {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    color: var(--muted);
    font-size: 1.05rem;
    padding-top: 4px;
  }
  .notes {
    font-style: italic;
  }
  .body {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 16px 8% 40vh;
    min-height: 0;
  }
  .l-scroll .body :global(.lyr) {
    max-width: 34em;
  }
  .l-cols2 .body {
    padding: 16px 32px 30vh;
  }
  .l-cols2 .body :global(.lyr) {
    column-gap: 56px;
  }
  .l-fit .body {
    overflow: hidden;
    padding: 14px 22px;
  }
  .l-fit .body :global(.lyr) {
    height: 100%;
    column-gap: 44px;
    column-fill: auto;
  }
  footer {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 8px 14px;
    border-top: 1px solid var(--line);
    flex-wrap: wrap;
  }
  .stage button {
    color: var(--fg);
  }
  .stage.light footer button {
    background: #f1f1f1;
  }
  .nav {
    min-width: 120px;
    font-weight: 700;
  }
  .sp {
    flex: 1;
  }
  .tap {
    position: absolute;
    top: 90px;
    bottom: 80px;
    width: 6%;
    background: transparent !important;
    border: 0;
    border-radius: 0;
    z-index: 2;
  }
  .tap:active {
    transform: none;
    background: rgba(128, 128, 128, 0.12) !important;
  }
  .tap.left {
    left: var(--safe-l);
  }
  .tap.right {
    right: var(--safe-r);
  }
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.82);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
  }
  .box {
    background: #1c1c1c;
    color: #f4f1ea;
    border-radius: 14px;
    padding: 18px;
    width: min(560px, 92vw);
    max-height: 85vh;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .box h2 {
    margin-bottom: 8px;
  }
  .li {
    text-align: left;
    font-size: 1.3rem;
    border-bottom: 1px solid #333 !important;
    border-radius: 0;
    color: #f4f1ea !important;
  }
  .li.cur {
    color: #ffc94a !important;
    font-weight: 700;
  }
  .marker {
    display: flex;
    flex-direction: column;
    gap: 0.6em;
    max-width: 30em;
    line-height: 1.35;
  }
  .marker .big {
    font-size: 2.6em;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .marker .mtext {
    white-space: pre-wrap;
    border-left: 5px solid var(--muted);
    padding-left: 0.6em;
  }
  .marker .next {
    color: var(--muted);
    font-size: 0.75em;
  }
  .marker .next b {
    color: var(--fg);
  }
  .l-marker .body {
    padding-bottom: 20vh;
  }
  .setsum {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    color: #9a958c;
    margin-bottom: 8px;
  }
  .li.mk {
    color: #9a958c !important;
    font-size: 1.05rem;
  }
  .mprev {
    margin-left: 0.4em;
  }
  .nothing {
    margin: auto;
    text-align: center;
  }
</style>
