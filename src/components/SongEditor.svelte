<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { store, songById, saveSong, deleteSong } from '../lib/store.svelte';
  import { go } from '../lib/router.svelte';
  import { undoable } from '../lib/toast.svelte';
  import { autoSplit, clean } from '../lib/parser';
  import { keepAwake } from '../lib/wake';
  import { LAYOUT_NAMES, MODE_NAMES, MODE_ROLES, activeRoles, type Layout, type VocalMode } from '../lib/types';
  import PaintView from './PaintView.svelte';
  import { lookupDuration } from '../lib/importText';
  import { flattenSectionWho, reconcile, toPlain } from '../lib/paint';

  let { id }: { id: string } = $props();
  const song = $derived(songById(id));

  let timer: ReturnType<typeof setTimeout> | undefined;
  function touch() {
    clearTimeout(timer);
    timer = setTimeout(() => song && saveSong(song), 350);
  }
  function flush() {
    applyPlain();
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

  // ---- Tekstfeltet viser ren tekst (uten koder); malingen ligger i song.text og bevares ----
  const plainOf = () => (song ? toPlain(song.text, activeRoles(song), store.singers, song.mode) : '');
  // svelte-ignore state_referenced_locally
  let plain = $state(plainOf());
  let plainDirty = false;
  let plainTimer: ReturnType<typeof setTimeout> | undefined;
  function onPlainInput() {
    plainDirty = true;
    clearTimeout(plainTimer);
    plainTimer = setTimeout(applyPlain, 250);
  }
  /** Skriver det som står i tekstfeltet inn i låten, og flytter malingen over til ordene. */
  function applyPlain() {
    clearTimeout(plainTimer);
    if (!song || !plainDirty) return;
    plainDirty = false;
    const next = reconcile(song.text, plain, activeRoles(song), store.singers, song.mode);
    if (next !== song.text) {
      song.text = next;
      touch();
    }
  }
  /** Etter maling (f.eks. nytt delnavn): oppdater tekstfeltet. */
  function afterPaint() {
    plain = plainOf();
    touch();
  }

  // Gammel merking av hele deler («[Vers | Siri]») gjøres om til maling på ordene.
  $effect(() => {
    if (!song) return;
    const f = flattenSectionWho(song.text, activeRoles(song), store.singers, song.mode);
    if (f !== null) {
      song.text = f;
      saveSong(song);
      plain = plainOf();
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


  /** Delnavn kan settes inn fra tekstfeltet. Hvem som synger males i teksten ved siden av. */
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

  async function insert(v: string) {
    if (!song || !ta) return;
    const t = plain;
    const focused = document.activeElement === ta;
    const s = focused ? ta.selectionStart : Math.min(sel.s, t.length);
    const e = focused ? ta.selectionEnd : Math.min(sel.e, t.length);
    // Delnavn på egen linje, med tom linje foran.
    const before = t.slice(0, s);
    const pre = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
    const ins = pre + v + '\n';
    plain = t.slice(0, s) + ins + t.slice(e);
    const caret = s + ins.length;
    onPlainInput();
    applyPlain();
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
    const s = ta.selectionStart ?? plain.length;
    const en = ta.selectionEnd ?? s;
    plain = plain.slice(0, s) + c + plain.slice(en);
    onPlainInput();
    applyPlain();
    await tick();
    ta.setSelectionRange(s + c.length, s + c.length);
  }

  function auto() {
    if (!song) return;
    plain = autoSplit(plain);
    onPlainInput();
    applyPlain();
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

      <details class="whole" open={!song.text.trim()}>
        <summary>📋 Lim inn eller rediger hele teksten</summary>
      <label class="f"
        >Hele teksten (uten merking)
        <textarea
          bind:this={ta}
          bind:value={plain}
          oninput={onPlainInput}
          onpaste={onPaste}
          onselect={remember}
          onkeyup={remember}
          onpointerup={remember}
          onblur={() => {
            if (ta) sel = { s: ta.selectionStart, e: ta.selectionEnd };
            applyPlain();
          }}
          placeholder="Lim inn eller skriv teksten her"
          spellcheck="false"
        ></textarea>
      </label>
      <div class="bar">
        <span class="hint">Sett inn delnavn ved markøren:</span>
        {#each buttons as [v, label]}
          <button type="button" onpointerdown={(e) => e.preventDefault()} onclick={() => insert(v)}>{label}</button>
        {/each}
      </div>
      <div class="bar">
        <button type="button" onclick={auto}>Del opp automatisk</button>
      </div>
      </details>
      <div class="bar">
        <span style="flex:1"></span>
        <button type="button" class="danger" onclick={remove}>Slett låt</button>
      </div>
      <details class="hint">
        <summary>Om teksten</summary>
        <p>
          Tom linje gir ny del. Delnavn som <code>[Vers 1]</code>, <code>[Refreng]</code> eller <code>[Instrumental]</code> står på egen
          linje. <code>[Refreng]</code> blir uthevet. Med «Skriv» retter du rett i teksten; med penslene maler du hvem som synger.
        </p>
        <p>
          Linjer som starter med «Source:» eller «Songwriters:», og linjer med «lyrics ©», «LyricFind» eller «Musixmatch», fjernes automatisk.
          Har låten ingen merking, blir linjer som gjentas uthevet, så det er lett å finne refrenget.
        </p>
      </details>
    </form>
    <aside class="preview">
      <div class="phead">
        <b>Tekst</b>
        <span class="hint">Skriv, rett og mal hvem som synger, rett i teksten</span>
      </div>
      <PaintView {song} singers={store.singers} onbefore={applyPlain} onchange={afterPaint} />
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
    min-height: 35vh;
    resize: vertical;
    line-height: 1.45;
    font-size: 1.02rem;
  }
  .whole {
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--panel);
    border-radius: 12px;
    padding: 4px 12px 12px;
  }
  .whole[open] > summary {
    margin-bottom: 8px;
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
</style>
