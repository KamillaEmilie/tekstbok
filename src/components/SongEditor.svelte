<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { store, songById, saveSong, deleteSong } from '../lib/store.svelte';
  import { go } from '../lib/router.svelte';
  import { undoable } from '../lib/toast.svelte';
  import { autoSplit, clean } from '../lib/parser';
  import { keepAwake } from '../lib/wake';
  import { LAYOUT_NAMES, MODE_NAMES, MODE_ROLES, type Layout, type RoleCode, type VocalMode } from '../lib/types';
  import Lyrics from './Lyrics.svelte';

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

  const nameOf = (code: RoleCode) => {
    const sid = song?.[code];
    return store.singers.find((s) => s.id === sid)?.name ?? code.toUpperCase();
  };

  const buttons = $derived.by((): [string, string][] => {
    const base: [string, string][] = [
      ['[Vers]', '[Vers]'],
      ['[Refreng]', '[Refreng]'],
      ['[Bro]', '[Bro]'],
    ];
    if (!song) return base;
    if (song.mode === 'duett')
      return [
        ...base,
        ['[Vers | HV]', `Vers · ${nameOf('hv')}`],
        ['[Vers | HV2]', `Vers · ${nameOf('hv2')}`],
        ['[Refreng | Begge]', 'Refreng · Begge'],
        ['(HV) ', `HV · ${nameOf('hv')}`],
        ['(HV2) ', `HV2 · ${nameOf('hv2')}`],
        ['(Begge) ', 'Begge'],
      ];
    if (song.mode === 'koring')
      return [
        ...base,
        ['[Vers | HV]', `Vers · ${nameOf('hv')}`],
        ['[Refreng | HV+K1+K2]', 'Refreng · Alle'],
        ['[Bro | HV+K1]', `Bro · ${nameOf('hv')}+${nameOf('k1')}`],
        ['(K1) ', `K1 · ${nameOf('k1')}`],
        ['(K2) ', `K2 · ${nameOf('k2')}`],
        ['(K1+K2) ', `K1+K2 · ${nameOf('k1')}+${nameOf('k2')}`],
      ];
    return base;
  });

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
        <span class="hint">Sett inn ved markøren:</span>
        {#each buttons as [v, label]}
          <button type="button" onpointerdown={(e) => e.preventDefault()} onclick={() => insert(v)}>{label}</button>
        {/each}
      </div>
      {#if song.mode !== 'solo'}
        <p class="hint" style="margin:0">
          Marker ord i teksten og trykk på en vokalist for å merke bare de ordene, f.eks. <code>{'{K1: yeah, yeah}'}</code>. Uten
          markering gjelder det hele linjen.
        </p>
      {/if}
      <div class="bar">
        <button type="button" onclick={auto}>Del opp automatisk</button>
        <span style="flex:1"></span>
        <button type="button" class="danger" onclick={remove}>Slett låt</button>
      </div>
      <details class="hint">
        <summary>Slik merker du teksten</summary>
        <p>
          Tom linje gir ny del. Skriv <code>[Vers 1]</code>, <code>[Refreng]</code> eller <code>[Bro]</code> på egen linje for å merke en del.
          <code>[Refreng]</code> blir uthevet.
        </p>
        <p>
          Hvem som synger en del, skriver du etter en strek: <code>[Vers 2 | HV2]</code>, <code>[Refreng | HV+K1]</code> eller
          <code>[Outro | Alle]</code>. Du kan også bruke navn, f.eks. <code>[Bro | Siri & Leif]</code>.
        </p>
        <p>
          Enkeltlinjer merker du med f.eks. <code>(K1)</code> eller <code>(Kamilla)</code> først på linjen. Det overstyrer delen.
        </p>
        <p>
          Bare noen ord, f.eks. koring midt i en linje: <code>{"I'm still standing {K1+K2: yeah, yeah, yeah}"}</code>. Bare ordene i
          klammene får koristens farge.
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
