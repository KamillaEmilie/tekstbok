<script lang="ts">
  // Malerverktøy: velg pensel og trykk på ord. Delnavn (vers, refreng …) velges over hver del,
  // uavhengig av hvem som synger.
  import { LABEL, resolveWho, vocalKind, type Who } from '../lib/parser';
  import { lineToTokens, paintWord, readLabel, setWordPen, wordHasPen, writeLabel, type Paint } from '../lib/paint';
  import { barStyle, colorsOf, defaultTogether, korStyle, underlineStyle } from '../lib/vocal';
  import { activeRoles, type RoleCode, type Singer, type Song } from '../lib/types';

  let { song, singers, onchange }: { song: Song; singers: Singer[]; onchange: () => void } = $props();

  const roles = $derived(activeRoles(song));
  const nameOf = (code: RoleCode) => singers.find((s) => s.id === song[code])?.name || code.toUpperCase();
  const together0 = $derived(defaultTogether(song.mode, roles, singers));
  const koringCode = $derived([song.k1 && 'K1', song.k2 && 'K2'].filter(Boolean).join('+'));

  // ---- Penser ----
  type Pen = { key: string; label: string; paint: Paint | null };
  const pens = $derived.by((): Pen[] => {
    const out: Pen[] = [];
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
  let penKey = $state<string | null>(null);
  const pen = $derived(pens.find((p) => p.key === penKey) ?? pens[0]);

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
    | { kind: 'gap' };

  const rows = $derived.by((): Row[] => {
    const out: Row[] = [];
    let inSection = false;
    let afterLabel = false;
    let secWho: Who | null = null;
    song.text.split('\n').forEach((line, idx) => {
      if (!line.trim()) {
        if (afterLabel) return;
        if (inSection) out.push({ kind: 'gap' });
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
        right: allKor,
      });
    });
    return out;
  });

  function setLines(fn: (lines: string[]) => void) {
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
    if (!pen || drag) return;
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

  function tapWord(idx: number, i: number) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (!pen) return;
    setLines((lines) => (lines[idx] = paintWord(lines[idx], i, pen.paint, roles, singers, song.mode)));
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
  {#if pens.length}
    <div class="pens">
      {#each pens as p (p.key)}
        <button type="button" class="pen" class:on={pen?.key === p.key} onclick={() => (penKey = p.key)}>
          {#if p.paint}<span class="sw" style={penPreview(p)}>Aa</span>{:else}<span class="sw">⌫</span>{/if}
          {p.label}
        </button>
      {/each}
    </div>
    <p class="hint">
      Velg pensel og trykk på ordene, eller dra sidelengs over flere ord. Trykk på et malt ord igjen for å fjerne det.
      {song.mode === 'duett' ? 'Umalt tekst betyr at dere synger sammen.' : 'Umalt tekst er hovedstemmen.'}
    </p>
  {:else}
    <p class="hint">Solo har ingen andre å male. Velg «Med koring» eller «Duett» over for å få penser.</p>
  {/if}

  <div class="sheet">
    {#each rows as row}
      {#if row.kind === 'gap'}
        <div class="gap"></div>
      {:else if row.kind === 'head'}
        <div class="headwrap">
          <button type="button" class="head" class:virtual={!row.label} onclick={() => (menuFor = menuFor === row.idx ? null : row.idx)}>
            {row.label || '+ delnavn'} ▾
          </button>
          {#if menuFor === row.idx}
            <div class="menu">
              {#each NAMES as n}
                <button type="button" onclick={() => setLabel(row, n)}>{n}</button>
              {/each}
              {#if row.label}<button type="button" class="danger" onclick={() => setLabel(row, null)}>Fjern delnavn</button>{/if}
            </div>
          {/if}
        </div>
      {:else}
        <div class="ln" class:barred={!!row.bar} class:right={row.right} style:background-image={row.bar} style:color={row.color}>
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
    {/each}
    {#if !rows.length}
      <p class="hint">Ingen tekst ennå. Trykk «Rediger tekst» og lim inn teksten først.</p>
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
