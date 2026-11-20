<script lang="ts">
  // Malerverktøy: velg pensel og trykk på ord. Delnavn (vers, refreng …) velges over hver del,
  // uavhengig av hvem som synger.
  import { tick } from 'svelte';
  import { LABEL, clean, resolveWho, vocalKind, type Who } from '../lib/parser';
  import { lineToTokens, mergeWithAbove, paintWord, readLabel, reconcile, setWordPen, wordHasPen, writeLabel, type Paint } from '../lib/paint';
  import { barStyle, colorsOf, defaultTogether, korStyle, underlineStyle } from '../lib/vocal';
  import { activeRoles, type RoleCode, type Singer, type Song } from '../lib/types';

  let {
    song,
    singers,
    onchange,
    onbefore,
  }: { song: Song; singers: Singer[]; onchange: () => void; onbefore?: () => void } = $props();

  const roles = $derived(activeRoles(song));
  const nameOf = (code: RoleCode) => singers.find((s) => s.id === song[code])?.name || code.toUpperCase();
  const together0 = $derived(defaultTogether(song.mode, roles, singers));
  const koringCode = $derived([song.k1 && 'K1', song.k2 && 'K2'].filter(Boolean).join('+'));

  // ---- Penser ----
  type Pen = { key: string; label: string; paint: Paint | null; write?: boolean };
  const pens = $derived.by((): Pen[] => {
    const out: Pen[] = [{ key: 'write', label: 'Skriv', paint: null, write: true }];
    if (song.mode === 'duett') {
      for (const c of ['hv', 'hv2'] as const) if (song[c]) out.push({ key: `${c}-solo`, label: `${nameOf(c)} alene`, paint: { code: c.toUpperCase(), harm: false } });
      for (const c of ['hv', 'hv2'] as const) if (song[c]) out.push({ key: `${c}-harm`, label: `${nameOf(c)} · 2. stemme`, paint: { code: c.toUpperCase(), harm: true } });
      out.push({ key: 'erase', label: 'Sammen (visk ut)', paint: null });
    } else if (song.mode === 'koring') {
      for (const c of ['k1', 'k2'] as const) if (song[c]) out.push({ key: `${c}-kor`, label: `${nameOf(c)} · kor`, paint: { code: c.toUpperCase(), harm: false } });
      if (song.k1 && song.k2) out.push({ key: 'both-kor', label: `${nameOf('k1')} + ${nameOf('k2')} · kor`, paint: { code: 'K1+K2', harm: false } });
      for (const c of ['k1', 'k2'] as const) if (song[c]) out.push({ key: `${c}-harm`, label: `${nameOf(c)} · 2. stemme`, paint: { code: c.toUpperCase(), harm: true } });
      if (song.k1 && song.k2) out.push({ key: 'both-harm', label: `${nameOf('k1')} + ${nameOf('k2')} · 2. stemme`, paint: { code: 'K1+K2', harm: true } });
      out.push({ key: 'all', label: 'Alle sammen', paint: { code: 'Alle', harm: false } });
      out.push({ key: 'erase', label: 'Hovedstemme (visk ut)', paint: null });
    }
    return out;
  });
  // svelte-ignore state_referenced_locally
  let penKey = $state<string | null>(song.text.trim() ? null : 'write');
  const pen = $derived(pens.find((p) => p.key === penKey) ?? pens.find((p) => !p.write) ?? pens[0]);
  const writing = $derived(!!pen?.write);

  // ---- Utseende (samme regler som på scenen) ----
  const whoOf = (p: Paint | null): Who | null =>
    !p ? null : p.harm ? resolveWho('/' + p.code, roles, singers) : resolveWho(p.code || koringCode, roles, singers);

  function wordStyle(p: Paint | null, baseUl: string): { style: string; together: string[] } {
    const who = whoOf(p);
    const k = vocalKind(who, song.mode, roles);
    const ul = k !== 'harm' && who?.harmony?.length ? ';' + underlineStyle(who.harmony, false) : '';
    if (k === 'harm') return { style: underlineStyle(who!.harmony, false), together: [] };
    if (k === 'solo') return { style: `color:${colorsOf(who!.people, false)[0] ?? 'var(--fg)'}${ul}`, together: [] };
    if (k === 'together') return { style: `color:var(--fg)${ul}`, together: colorsOf(who!.people, false) };
    if (k === 'kor') return { style: korStyle(who!.people, false) + ';font-style:italic;font-weight:700', together: [] };
    return { style: baseUl, together: [] };
  }
  const penPreview = (p: Pen) => (p.paint ? wordStyle(p.paint, '').style : '');

  // ---- Rader ----
  type Word = { w: string; i: number; style: string };
  type Row =
    | { kind: 'head'; idx: number; virtual: boolean; label: string; who: string }
    | { kind: 'line'; idx: number; words: Word[]; color: string | null; bar: string | null; right: boolean }
    | { kind: 'gap'; idx: number };

  const rows = $derived.by((): Row[] => {
    const out: Row[] = [];
    let inSection = false;
    let afterLabel = false;
    let secWho: Who | null = null;
    song.text.split('\n').forEach((line, idx) => {
      if (!line.trim()) {
        if (afterLabel) return;
        if (inSection) out.push({ kind: 'gap', idx });
        inSection = false;
        return;
      }
      const lab = LABEL.test(line) ? readLabel(line) : null;
      if (lab) {
        secWho = lab.who ? resolveWho(lab.who, roles, singers) : null;
        out.push({ kind: 'head', idx, virtual: false, label: lab.label, who: lab.who });
        inSection = afterLabel = true;
        return;
      }
      afterLabel = false;
      if (!inSection) {
        secWho = null;
        out.push({ kind: 'head', idx, virtual: true, label: '', who: '' });
        inSection = true;
      }
      const base = secWho ?? together0;
      const bk = vocalKind(base, song.mode, roles);
      const baseUl = base?.harmony?.length ? underlineStyle(base.harmony, false) : '';
      const toks = lineToTokens(line, roles, singers, song.mode);
      // Standarden (f.eks. «sammen» i duett) gjelder bare ord som ikke er malt.
      const bars = new Set<string>(bk === 'together' && toks.some((t) => !t.paint) ? colorsOf(base!.people, false) : []);
      const words = toks.map((t, i) => {
        const ws = wordStyle(t.paint, baseUl);
        ws.together.forEach((c) => bars.add(c));
        return { w: t.w, i, style: ws.style };
      });
      const allKor = toks.length > 0 && toks.every((t) => vocalKind(whoOf(t.paint), song.mode, roles) === 'kor');
      out.push({
        kind: 'line',
        idx,
        words,
        color: bk === 'solo' ? (colorsOf(base!.people, false)[0] ?? null) : null,
        bar: allKor ? null : barStyle([...bars]),
        right: false,
      });
    });
    return out;
  });

  function setLines(fn: (lines: string[]) => void) {
    onbefore?.(); // ta med det som er skrevet i tekstfeltet først
    const lines = song.text.split('\n');
    fn(lines);
    song.text = lines.join('\n');
    onchange();
  }
  // ---- Dra over flere ord ----
  // Start sidelengs på et ord og dra: alle ordene du drar over males (eller viskes ut hvis det første
  // ordet allerede hadde pensen). Starter du rett opp/ned, scroller siden som vanlig (touch-action: pan-y).
  type Drag = { id: number; x: number; y: number; idx: number; i: number; active: boolean; on: boolean; seen: Set<string> };
  let drag: Drag | null = null;
  let suppressClick = false;

  function applyDrag(idx: number, i: number) {
    if (!drag || !pen) return;
    const key = `${idx}:${i}`;
    if (drag.seen.has(key)) return;
    drag.seen.add(key);
    const on = drag.on;
    setLines((lines) => (lines[idx] = setWordPen(lines[idx], i, pen.paint, on, roles, singers, song.mode)));
  }
  function wordDown(e: PointerEvent, idx: number, i: number) {
    if (!pen || drag || writing) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, idx, i, active: false, on: true, seen: new Set() };
    window.addEventListener('pointermove', dragMove);
    window.addEventListener('pointerup', dragEnd);
    window.addEventListener('pointercancel', dragEnd);
  }
  function dragMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id || !pen) return;
    if (!drag.active) {
      const dx = Math.abs(e.clientX - drag.x);
      const dy = Math.abs(e.clientY - drag.y);
      if (dx < 10) {
        if (dy > 12) dragEnd(); // vertikal bevegelse = scrolling
        return;
      }
      drag.active = true;
      const line = song.text.split('\n')[drag.idx] ?? '';
      drag.on = pen.paint ? !wordHasPen(line, drag.i, pen.paint, roles, singers, song.mode) : true;
      applyDrag(drag.idx, drag.i);
    }
    e.preventDefault();
    const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-w]');
    if (el) applyDrag(Number(el.dataset.idx), Number(el.dataset.i));
  }
  function dragEnd() {
    window.removeEventListener('pointermove', dragMove);
    window.removeEventListener('pointerup', dragEnd);
    window.removeEventListener('pointercancel', dragEnd);
    if (drag?.active) suppressClick = true;
    drag = null;
  }

  // ---- Skriv rett i teksten ----
  // editing.insert = ny linje som legges inn etter linje idx (idx = -1: helt først).
  let editing = $state<{ idx: number; insert: boolean } | null>(null);
  let editValue = $state('');
  let editEl = $state<HTMLTextAreaElement>();
  const plainLine = (line: string) =>
    lineToTokens(line, roles, singers, song.mode)
      .map((t) => t.w)
      .join(' ');

  async function focusEdit(caret: number | 'end' = 'end') {
    await tick();
    if (!editEl) return;
    editEl.focus();
    const c = caret === 'end' ? editValue.length : caret;
    editEl.setSelectionRange(c, c);
    grow();
  }
  function grow() {
    if (!editEl) return;
    editEl.style.height = 'auto';
    editEl.style.height = editEl.scrollHeight + 'px';
  }
  let session = 0;
  function startEdit(idx: number, insert = false, value?: string, caret: number | 'end' = 'end') {
    commit();
    onbefore?.();
    session++;
    editing = { idx, insert };
    editValue = value ?? (insert ? '' : plainLine(song.text.split('\n')[idx] ?? ''));
    void focusEdit(caret);
  }
  /** Lagrer linjen som redigeres. Malingen flyttes over til ordene som fortsatt finnes. */
  function commit() {
    if (!editing) return;
    const { idx, insert } = editing;
    const v = editValue.replace(/\r/g, '');
    editing = null;
    setLines((lines) => {
      if (insert) {
        if (v.trim()) lines.splice(idx + 1, 0, ...v.split('\n'));
      } else if (!v.trim()) lines.splice(idx, 1);
      else if (v !== plainLine(lines[idx])) lines.splice(idx, 1, ...reconcile(lines[idx], v, roles, singers, song.mode).split('\n'));
    });
  }
  function onEditKey(e: KeyboardEvent) {
    if (!editing || !editEl) return;
    const { idx, insert } = editing;
    const caret = editEl.selectionStart;
    if (e.key === 'Escape') {
      editing = null;
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const left = editValue.slice(0, caret);
      const right = editValue.slice(caret);
      if (insert && !left.trim()) {
        // Enter på en tom ny linje: skille mellom deler
        editing = null;
        setLines((lines) => lines.splice(idx + 1, 0, ''));
        startEdit(idx + 1, true, right, 0);
        return;
      }
      if (!insert && !left.trim()) {
        // Markøren først på linjen: ny linje over
        editValue = right;
        commit();
        startEdit(idx - 1, true, '', 0);
        return;
      }
      editValue = left;
      commit();
      startEdit(insert ? idx + 1 : idx, true, right, 0);
      return;
    }
    if (e.key === 'Backspace' && caret === 0 && editEl.selectionEnd === 0 && editValue && !insert) {
      // Først i første linje av en del: slå sammen med delen over
      const lines = song.text.split('\n');
      const head = lines[idx - 1] !== undefined && LABEL.test(lines[idx - 1]) ? idx - 1 : idx;
      const above = lines[head - 1];
      if (above !== undefined && (!above.trim() || head !== idx)) {
        e.preventDefault();
        commit();
        const r = mergeWithAbove(song.text.split('\n'), head);
        if (r) {
          setLines((l) => l.splice(0, l.length, ...r.lines));
          startEdit(r.firstLine, false, undefined, 0);
        }
        return;
      }
    }
    if (e.key === 'Backspace' && caret === 0 && editEl.selectionEnd === 0 && !editValue) {
      e.preventDefault();
      commit();
      const lines = song.text.split('\n');
      const prev = insert ? idx : idx - 1;
      if (prev >= 0 && lines[prev]?.trim() && !LABEL.test(lines[prev])) startEdit(prev);
    }
  }
  /** Når feltet mister fokus: lagre, men bare hvis det fortsatt er samme redigering (ikke en ny linje fra Enter). */
  function onEditBlur() {
    const s = session;
    setTimeout(() => {
      if (s === session && editing && document.activeElement !== editEl) commit();
    }, 0);
  }

  function onEditPaste(e: ClipboardEvent) {
    const txt = e.clipboardData?.getData('text/plain');
    if (!txt || !editEl) return;
    e.preventDefault();
    const s0 = editEl.selectionStart;
    const s1 = editEl.selectionEnd;
    const c = clean(txt);
    editValue = editValue.slice(0, s0) + c + editValue.slice(s1);
    void focusEdit(s0 + c.length);
  }

  function tapWord(idx: number, i: number) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (writing) {
      startEdit(idx);
      return;
    }
    if (!pen) return;
    setLines((lines) => (lines[idx] = paintWord(lines[idx], i, pen.paint, roles, singers, song.mode)));
  }

  // ---- Slå sammen deler ----
  function mergeUp(headIdx: number) {
    commit();
    const r = mergeWithAbove(song.text.split('\n'), headIdx);
    if (r) setLines((l) => l.splice(0, l.length, ...r.lines));
    menuFor = null;
  }

  // ---- Delnavn ----
  let menuFor = $state<number | null>(null);
  const NAMES = ['Intro', 'Vers', 'Pre-refreng', 'Refreng', 'Bro', 'Solo', 'Instrumental', 'Outro'];
  function nextVers(): string {
    const n = song.text.split('\n').filter((l) => /^\s*\[\s*vers\b/i.test(l)).length;
    return `Vers ${n + 1}`;
  }
  function setLabel(row: Extract<Row, { kind: 'head' }>, name: string | null) {
    const label = name === 'Vers' ? nextVers() : name;
    setLines((lines) => {
      if (row.virtual) {
        if (label) lines.splice(row.idx, 0, `[${label}]`);
      } else {
        const nl = writeLabel(label ?? '', row.who);
        if (nl === null) lines.splice(row.idx, 1);
        else lines[row.idx] = nl;
      }
    });
    menuFor = null;
  }
</script>

<div class="paint">
  <div class="pens">
    {#each pens as p (p.key)}
      <button
        type="button"
        class="pen"
        class:on={pen?.key === p.key}
        onpointerdown={(e) => e.preventDefault()}
        onclick={() => {
          commit();
          penKey = p.key;
        }}
      >
        {#if p.write}<span class="sw">✏️</span>{:else if p.paint}<span class="sw" style={penPreview(p)}>Aa</span>{:else}<span class="sw">⌫</span>{/if}
        {p.label}
      </button>
    {/each}
  </div>
  <p class="hint">
    {#if writing}
      Trykk på en linje for å skrive i den. Enter gir ny linje, Enter på en tom linje gir ny del. Tøm en linje for å slette den.
      ⌫ først i en del slår den sammen med delen over.
    {:else}
      Trykk på ordene, eller dra sidelengs over flere ord. Trykk på et malt ord igjen for å fjerne det.
      {song.mode === 'duett' ? 'Umalt tekst betyr at dere synger sammen.' : song.mode === 'koring' ? 'Umalt tekst er hovedstemmen.' : ''}
    {/if}
    {#if song.mode === 'solo'}Velg «Med koring» eller «Duett» for å få penser til å merke hvem som synger.{/if}
  </p>

  {#snippet editor()}
    <textarea
      class="edit"
      rows="1"
      bind:this={editEl}
      bind:value={editValue}
      oninput={grow}
      onkeydown={onEditKey}
      onpaste={onEditPaste}
      onblur={onEditBlur}
      placeholder="Skriv her …"
      spellcheck="false"
    ></textarea>
  {/snippet}

  <div class="sheet" class:writing>
    {#if editing?.insert && editing.idx === -1}{@render editor()}{/if}
    {#each rows as row, ri}
      {#if row.kind === 'gap'}
        <div class="gap"></div>
      {:else if row.kind === 'head'}
        <div class="headwrap">
          <button type="button" class="head" class:virtual={!row.label} onclick={() => (menuFor = menuFor === row.idx ? null : row.idx)}>
            {row.label || '+ delnavn'} ▾
          </button>
          {#if ri > 0}
            <button type="button" class="merge" title="Slå sammen med delen over" onclick={() => mergeUp(row.idx)}>⤒ Slå sammen med delen over</button>
          {/if}
          {#if menuFor === row.idx}
            <div class="menu">
              {#each NAMES as n}
                <button type="button" onclick={() => setLabel(row, n)}>{n}</button>
              {/each}
              {#if row.label}<button type="button" class="danger" onclick={() => setLabel(row, null)}>Fjern delnavn</button>{/if}
            </div>
          {/if}
        </div>
      {:else if editing && !editing.insert && editing.idx === row.idx}
        {@render editor()}
      {:else}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="ln"
          class:barred={!!row.bar}
          class:right={row.right}
          style:background-image={row.bar}
          style:color={row.color}
          onclick={(e) => writing && e.target === e.currentTarget && startEdit(row.idx)}
        >
          {#each row.words as t, ti}{#if ti > 0}<span class="sp" style={t.style && row.words[ti - 1].style === t.style ? t.style : ''}
                >{' '}</span
              >{/if}<span
                class="w"
                style={t.style}
                role="button"
                tabindex="-1"
                data-w
                data-idx={row.idx}
                data-i={t.i}
                onpointerdown={(e) => wordDown(e, row.idx, t.i)}
                onclick={() => tapWord(row.idx, t.i)}
                onkeydown={() => {}}
              >{t.w}</span
            >{/each}
        </div>
      {/if}
      {#if editing?.insert && editing.idx === row.idx}{@render editor()}{/if}
    {/each}
    {#if writing && !editing}
      <button type="button" class="addline" onclick={() => startEdit(song.text.split('\n').length - 1, true)}>+ Ny linje nederst</button>
    {/if}
    {#if !rows.length && !editing}
      <p class="hint">Ingen tekst ennå. Velg «Skriv» og trykk «+ Ny linje», eller lim inn hele teksten.</p>
    {/if}
  </div>
</div>

<style>
  .paint {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .pens {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--bg);
    padding: 6px 0;
  }
  .pen {
    display: inline-flex;
    gap: 8px;
    align-items: center;
  }
  .pen.on {
    background: #3a3220;
    border-color: var(--acc);
    color: var(--fg);
    font-weight: 700;
  }
  .sw {
    min-width: 1.6em;
    text-align: center;
    padding-bottom: 2px;
  }
  .hint {
    margin: 0;
  }
  .sheet {
    background: #0b0b0b;
    border-radius: 12px;
    padding: 14px 18px 30px;
    font-size: 21px;
    line-height: 1.55;
  }
  .gap {
    height: 0.7em;
  }
  .headwrap {
    position: relative;
    margin-top: 0.3em;
  }
  .head {
    background: transparent;
    border: 1px dashed #444;
    min-height: 34px;
    padding: 2px 10px;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .head.virtual {
    border-color: #333;
    text-transform: none;
    letter-spacing: 0;
  }
  .merge {
    background: transparent;
    border: 1px dashed #333;
    min-height: 34px;
    padding: 2px 10px;
    font-size: 13px;
    color: var(--muted);
    margin-left: 6px;
  }
  .menu {
    position: absolute;
    z-index: 3;
    top: 100%;
    left: 0;
    margin-top: 4px;
    background: #222;
    border: 1px solid #555;
    border-radius: 12px;
    padding: 6px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    min-width: 280px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }
  .menu button {
    text-align: left;
    font-size: 15px;
  }
  .ln {
    background-size: 5px 100%;
    background-repeat: no-repeat;
    padding-left: 0.55em;
  }
  .edit {
    display: block;
    width: 100%;
    font: inherit;
    line-height: inherit;
    background: #1d1d1d;
    border: 1px solid var(--acc);
    border-radius: 6px;
    padding: 0 0.5em;
    min-height: 0;
    resize: none;
    overflow: hidden;
    color: var(--fg);
  }
  .sheet.writing .ln,
  .sheet.writing .w {
    cursor: text;
  }
  .addline {
    margin-top: 10px;
    font-size: 15px;
    background: transparent;
    border-style: dashed;
  }
  .ln.right {
    text-align: right;
  }
  .w,
  .sp {
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }
  .w {
    cursor: pointer;
    touch-action: pan-y;
    -webkit-user-select: none;
    user-select: none;
  }
  .w:active {
    outline: 2px solid rgba(255, 201, 74, 0.5);
  }
</style>
