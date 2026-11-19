<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { store, songById, saveSong, deleteSong } from '../lib/store.svelte';
  import { go } from '../lib/router.svelte';
  import { undoable } from '../lib/toast.svelte';
  import { autoSplit, clean } from '../lib/parser';
  import { keepAwake } from '../lib/wake';
  import { LAYOUT_NAMES, MODE_NAMES, MODE_ROLES, activeRoles, type Layout, type RoleCode, type VocalMode } from '../lib/types';
  import Lyrics from './Lyrics.svelte';
  import PaintView from './PaintView.svelte';
  import { lookupDuration } from '../lib/importText';
  import { flattenSectionWho } from '../lib/paint';

  let { id }: { id: string } = $props();
  const song = $derived(songById(id));

  let timer: ReturnType<typeof setTimeout> | undefined;
  function touch() {
    clearTimeout(timer);
    timer = setTimeout(() => song && saveSong(song), 350);
  }
  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
      if (song) saveSong(song);
    }
  }
  onDestroy(() => {
    flush();
    // En helt tom låt som bare ble opprettet, fjernes stille.
    if (song && !song.title.trim() && !song.text.trim()) deleteSong(song.id);
  });

  let ta = $state<HTMLTextAreaElement>();

  // Gammel merking av hele deler («[Vers | Siri]») gjøres om til maling på ordene når du maler.
  $effect(() => {
    if (tab !== 'paint' || !song) return;
    const f = flattenSectionWho(song.text, activeRoles(song), store.singers, song.mode);
    if (f !== null) {
      song.text = f;
      saveSong(song);
    }
  });

  // ---- Varighet hentes automatisk fra Apple Music-katalogen når tittelen er fylt inn ----
  let durNote = $state('');
  let durBusy = $state(false);
  let lastQuery = '';
  async function fetchDuration(force = false) {
    if (!song || (!force && song.duration?.trim())) return;
    const q = `${song.title.trim()}|${(song.artist ?? '').trim()}`;
    if (!song.title.trim() || (!force && q === lastQuery)) return;
    lastQuery = q;
    durBusy = true;
    durNote = '';
    const d = await lookupDuration(song.title, song.artist ?? '');
    durBusy = false;
    if (!song) return;
    if (d && (force || !song.duration?.trim())) {
      song.duration = d;
      saveSong(song);
      durNote = 'Hentet fra Apple Music';
    } else if (force) durNote = navigator.onLine ? 'Fant ingen treff' : 'Krever nett';
  }
  let durTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    void [song?.title, song?.artist];
    clearTimeout(durTimer);
    if (song && !song.duration?.trim() && song.title.trim().length >= 2) durTimer = setTimeout(() => fetchDuration(), 1500);
    return () => clearTimeout(durTimer);
  });
  /** «Mal» er standard når låten har tekst; «Rediger tekst» for å lime inn og rette ord. */
  // svelte-ignore state_referenced_locally
  let tab = $state<'paint' | 'text'>(songById(id)?.text.trim() ? 'paint' : 'text');

  function setMode(m: VocalMode) {
    if (!song) return;
    song.mode = m;
    touch();
  }
  function setLayout(l: Layout) {
    if (!song) return;
    song.layout = l;
    touch();
  }


  /** Delnavn kan settes inn fra tekstfeltet. Hvem som synger males under «Mal hvem som synger». */
  const buttons: [string, string][] = ['Intro', 'Vers', 'Pre-refreng', 'Refreng', 'Bro', 'Solo', 'Instrumental', 'Outro'].map((n) => [`[${n}]`, n]);

  // Husk siste markering i tekstfeltet (på iPad kan et trykk på en knapp fjerne fokus).
  let sel = { s: 0, e: 0 };
  function remember() {
    if (ta && document.activeElement === ta) sel = { s: ta.selectionStart, e: ta.selectionEnd };
  }
  $effect(() => {
    document.addEventListener('selectionchange', remember);
    return () => document.removeEventListener('selectionchange', remember);
  });

  /** Pakker markert tekst inn i «{K1: …}», linje for linje, med mellomrom utenfor klammene. */
  function wrapSelection(code: string, text: string): string {
    return text
      .split('\n')
      .map((line) => {
        const m = line.match(/^(\s*)(.*?)(\s*)$/)!;
        return m[2] ? `${m[1]}{${code}: ${m[2]}}${m[3]}` : line;
      })
      .join('\n');
  }

  async function insert(v: string) {
    if (!song || !ta) return;
    const t = song.text;
    const focused = document.activeElement === ta;
    const s = focused ? ta.selectionStart : Math.min(sel.s, t.length);
    const e = focused ? ta.selectionEnd : Math.min(sel.e, t.length);
    let next: string;
    let caret: number;
    if (v.startsWith('(') && e > s) {
      // Markerte ord: merk bare dem.
      const code = v.slice(1, v.indexOf(')'));
      const wrapped = wrapSelection(code, t.slice(s, e));
      next = t.slice(0, s) + wrapped + t.slice(e);
      caret = s + wrapped.length;
    } else if (v.startsWith('[')) {
      // Delmerke på egen linje, med tom linje foran.
      const before = t.slice(0, s);
      const pre = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
      const ins = pre + v + '\n';
      next = t.slice(0, s) + ins + t.slice(e);
      caret = s + ins.length;
    } else {
      // Linjemerke først på linjen der markøren står.
      const ls = t.lastIndexOf('\n', s - 1) + 1;
      next = t.slice(0, ls) + v + t.slice(ls);
      caret = s + v.length;
    }
    song.text = next;
    touch();
    await tick();
    ta.focus();
    ta.setSelectionRange(caret, caret);
  }

  async function onPaste(e: ClipboardEvent) {
    if (!song || !ta) return;
    const txt = e.clipboardData?.getData('text/plain');
    if (!txt) return;
    e.preventDefault();
    const c = clean(txt);
    const s = ta.selectionStart ?? song.text.length;
    const en = ta.selectionEnd ?? s;
    song.text = song.text.slice(0, s) + c + song.text.slice(en);
    touch();
    await tick();
    ta.setSelectionRange(s + c.length, s + c.length);
  }

  function auto() {
    if (!song) return;
    song.text = autoSplit(song.text);
    touch();
  }

  function remove() {
    if (!song) return;
    const title = song.title;
    flush();
    const undo = deleteSong(song.id);
    go('library');
    undoable(`Slettet «${title || 'uten tittel'}»`, () => {
      undo();
      go('song/' + id);
    });
  }
</script>

{#if !song}
  <div class="page"><p class="empty">Fant ikke låten. <button onclick={() => go('library')}>Til biblioteket</button></p></div>
{:else}
  <div class="wrap">
    <form class="page form" oninput={touch} onchange={touch} onsubmit={(e) => e.preventDefault()}>
      <div class="bar">
        <button type="button" class="ghost" onclick={() => go('library')}>‹ Låter</button>
        <span style="flex:1"></span>
        <button
          type="button"
          onclick={() => {
            flush();
            keepAwake();
            go('play/' + song.id);
          }}>▶ Vis på scenen</button
        >
      </div>
      <div class="row">
        <label class="f" style="flex:2">Tittel<input bind:value={song.title} placeholder="Låttittel" /></label>
        <label class="f" style="flex:2">Artist<input bind:value={song.artist} /></label>
      </div>
      <div class="row">
        <label class="f">Toneart<input bind:value={song.key} placeholder="f.eks. G" /></label>
        <label class="f">Tempo<input bind:value={song.bpm} placeholder="BPM" inputmode="numeric" /></label>
        <label class="f">Capo<input bind:value={song.capo} inputmode="numeric" /></label>
        <label class="f"
          >Varighet
          <span class="durrow">
            <input bind:value={song.duration} placeholder="f.eks. 3:45" inputmode="decimal" />
            <button type="button" class="durbtn" onclick={() => fetchDuration(true)} disabled={durBusy} title="Hent varighet fra Apple Music"
              >{durBusy ? '…' : '↻'}</button
            >
          </span>
          {#if durNote}<span class="durnote">{durNote}</span>{/if}
        </label>
      </div>
      <label class="f">Notater<input bind:value={song.notes} placeholder="f.eks. «Start med trommer»" /></label>

      <div class="bar">
        <span class="hint">Vokal:</span>
        {#each Object.entries(MODE_NAMES) as [m, label]}
          <button type="button" class:on={song.mode === m} onclick={() => setMode(m as VocalMode)}>{label}</button>
        {/each}
      </div>
      <div class="row">
        {#each MODE_ROLES[song.mode] as r (r.code)}
          <label class="f"
            >{r.label} ({r.code.toUpperCase()})
            <select bind:value={song[r.code]}>
              <option value="">– velg –</option>
              {#each store.singers as s (s.id)}
                <option value={s.id}>{s.name || '(uten navn)'}</option>
              {/each}
            </select>
          </label>
        {/each}
      </div>

      <div class="bar">
        <span class="hint">Oppsett på scenen:</span>
        {#each Object.entries(LAYOUT_NAMES) as [l, label]}
          <button type="button" class:on={song.layout === l} onclick={() => setLayout(l as Layout)}>{label}</button>
        {/each}
      </div>

      <div class="bar tabs">
        <button type="button" class:on={tab === 'paint'} onclick={() => (tab = 'paint')}>🖌 Mal hvem som synger</button>
        <button type="button" class:on={tab === 'text'} onclick={() => (tab = 'text')}>✏️ Rediger tekst</button>
      </div>
      {#if tab === 'paint'}
        <PaintView {song} singers={store.singers} onchange={touch} />
      {:else}
      <label class="f"
        >Tekst
        <textarea
          bind:this={ta}
          bind:value={song.text}
          onpaste={onPaste}
          onselect={remember}
          onkeyup={remember}
          onpointerup={remember}
          onblur={() => ta && (sel = { s: ta.selectionStart, e: ta.selectionEnd })}
          placeholder="Lim inn eller skriv teksten her" spellcheck="false"
        ></textarea>
      </label>
      <div class="bar">
        <span class="hint">Sett inn delnavn ved markøren:</span>
        {#each buttons as [v, label]}
          <button type="button" onpointerdown={(e) => e.preventDefault()} onclick={() => insert(v)}>{label}</button>
        {/each}
      </div>
      {/if}
      <div class="bar">
        <button type="button" onclick={auto}>Del opp automatisk</button>
        <span style="flex:1"></span>
        <button type="button" class="danger" onclick={remove}>Slett låt</button>
      </div>
      <details class="hint">
        <summary>Om teksten</summary>
        <p>
          Tom linje gir ny del. Delnavn som <code>[Vers 1]</code>, <code>[Refreng]</code> eller <code>[Instrumental]</code> står på egen
          linje. <code>[Refreng]</code> blir uthevet. Hvem som synger hva, merker du under «Mal hvem som synger».
        </p>
        <p>
          Linjer som starter med «Source:» eller «Songwriters:», og linjer med «lyrics ©», «LyricFind» eller «Musixmatch», fjernes automatisk.
          Har låten ingen merking, blir linjer som gjentas uthevet, så det er lett å finne refrenget.
        </p>
      </details>
    </form>
    <aside class="preview">
      <div class="phead">
        <b>Forhåndsvisning</b>
        <span class="hint">{LAYOUT_NAMES[song.layout]}</span>
      </div>
      <div class="pbody" class:cols2={song.layout !== 'scroll'}>
        <Lyrics {song} singers={store.singers} />
      </div>
    </aside>
  </div>
{/if}

<style>
  .wrap {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }
  @media (min-width: 1000px) {
    .wrap {
      grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
      height: 100%;
    }
    .wrap > * {
      overflow-y: auto;
    }
  }
  .form {
    max-width: none;
    margin: 0;
    width: 100%;
  }
  .durrow {
    display: flex;
    gap: 6px;
  }
  .durbtn {
    flex: none;
    padding: 0 12px;
  }
  .durnote {
    font-size: 0.75rem;
  }
  textarea {
    min-height: 45vh;
    resize: vertical;
    line-height: 1.45;
    font-size: 1.02rem;
  }
  details summary {
    cursor: pointer;
    min-height: 44px;
    display: flex;
    align-items: center;
  }
  .preview {
    border-left: 1px solid var(--line);
    background: #0b0b0b;
    padding: 16px calc(18px + var(--safe-r)) 40px 18px;
  }
  .phead {
    display: flex;
    gap: 10px;
    align-items: baseline;
    margin-bottom: 12px;
  }
  .pbody {
    font-size: 21px;
  }
  .pbody.cols2 :global(.lyr) {
    column-count: 2;
    column-gap: 28px;
    font-size: 16px;
  }
</style>
