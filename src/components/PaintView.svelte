<script lang="ts">
  // Malerverktøy: velg pensel, trykk på ord. Delmerket velger hvem som synger hele delen.
  import { personColor, resolveWho, whoStyle, withoutLead, type Person } from '../lib/parser';
  import { lineToTokens, paintWord, readLabel, samePaint, writeLabel, type Paint, type Token } from '../lib/paint';
  import { LABEL } from '../lib/parser';
  import { activeRoles, type RoleCode, type Singer, type Song } from '../lib/types';

  let { song, singers, onchange }: { song: Song; singers: Singer[]; onchange: () => void } = $props();

  const roles = $derived(activeRoles(song));
  const singerOf = (code: RoleCode) => singers.find((s) => s.id === song[code]);
  const nameOf = (code: RoleCode) => singerOf(code)?.name || code.toUpperCase();

  type Pen = { key: string; label: string; paint: Paint | null; color?: string };
  const pens = $derived.by((): Pen[] => {
    const out: Pen[] = [];
    const add = (code: RoleCode, kinds: ('harm' | 'kor')[]) => {
      if (!song[code]) return;
      const c = singerOf(code)?.color;
      const up = code.toUpperCase();
      for (const k of kinds)
        out.push({
          key: `${up}-${k}`,
          label: `${nameOf(code)} · ${k === 'harm' ? '2. stemme' : song.mode === 'duett' ? 'alene' : 'kor'}`,
          paint: { code: up, harm: k === 'harm' },
          color: c,
        });
    };
    if (song.mode === 'koring') {
      add('k1', ['harm', 'kor']);
      add('k2', ['harm', 'kor']);
      if (song.k1 && song.k2) {
        out.push({ key: 'both-harm', label: `${nameOf('k1')} + ${nameOf('k2')} · 2. stemme`, paint: { code: 'K1+K2', harm: true } });
        out.push({ key: 'both-kor', label: `${nameOf('k1')} + ${nameOf('k2')} · kor`, paint: { code: 'K1+K2', harm: false } });
      }
    } else if (song.mode === 'duett') {
      add('hv', ['kor', 'harm']);
      add('hv2', ['kor', 'harm']);
    }
    out.push({ key: 'erase', label: 'Visk ut', paint: null });
    return out;
  });
  let penKey = $state<string | null>(null);
  const pen = $derived(pens.find((p) => p.key === penKey) ?? pens[0]);

  // ---- Farger ----
  const cols = (people: Person[]) => people.filter((p) => p.color).map((p) => personColor(p.color!, false));
  function paintStyle(p: Paint | null): string {
    if (!p) return '';
    if (p.harm) {
      const c = cols(resolveWho('/' + p.code, roles, singers)?.harmony ?? []);
      const g = c.length ? (c.length === 1 ? `${c[0]},${c[0]}` : c.join(',')) : '#9a958c,#9a958c';
      return `background-image:linear-gradient(90deg,${g});background-size:100% 0.13em;background-position:0 100%;background-repeat:no-repeat`;
    }
    const code = p.code || [song.k1 && 'K1', song.k2 && 'K2'].filter(Boolean).join('+');
    const c = cols(resolveWho(code, roles, singers)?.people ?? []);
    if (c.length === 1) return `color:${c[0]};font-weight:700`;
    if (c.length > 1)
      return `background-image:linear-gradient(90deg,${c.join(',')});-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:700`;
    return 'font-weight:700';
  }
  const penSwatch = (p: Pen) => (p.paint ? paintStyle(p.paint) : '');

  // ---- Rader ----
  type Group = { paint: Paint | null; toks: { w: string; i: number }[] };
  type Row =
    | { kind: 'head'; idx: number; virtual: boolean; label: string; who: string; desc: string; bar: string | null }
    | { kind: 'line'; idx: number; groups: Group[]; color: string | null; bar: string | null }
    | { kind: 'gap' };

  function describe(who: string): string {
    if (!who) return song.mode === 'duett' ? 'Sammen' : 'Hovedstemme';
    const w = resolveWho(who, roles, singers);
    if (!w) return who;
    const mel = w.people.map((p) => p.name).join(' + ');
    const harm = w.harmony.map((p) => p.name).join(' + ');
    return [mel || (song.mode === 'duett' ? '' : 'Hovedstemme'), harm && `2. stemme ${harm}`].filter(Boolean).join(' · ');
  }

  const rows = $derived.by((): Row[] => {
    const out: Row[] = [];
    let inSection = false;
    let color: string | null = null;
    let bar: string | null = null;
    let afterLabel = false;
    const setWho = (who: string) => {
      const w = withoutLead(who ? resolveWho(who, roles, singers) : null, song.mode, roles);
      const st = whoStyle(w, false);
      color = st.text ?? null;
      bar = st.bar ?? null;
    };
    song.text.split('\n').forEach((line, idx) => {
      if (!line.trim()) {
        if (afterLabel) return; // delmerke gjelder også etter tom linje
        if (inSection) out.push({ kind: 'gap' });
        inSection = false;
        return;
      }
      const lab = LABEL.test(line) ? readLabel(line) : null;
      if (lab) {
        setWho(lab.who);
        out.push({ kind: 'head', idx, virtual: false, label: lab.label, who: lab.who, desc: describe(lab.who), bar });
        inSection = true;
        afterLabel = true;
        return;
      }
      afterLabel = false;
      if (!inSection) {
        setWho('');
        out.push({ kind: 'head', idx, virtual: true, label: '', who: '', desc: describe(''), bar });
        inSection = true;
      }
      const toks: Token[] = lineToTokens(line, roles, singers, song.mode);
      const groups: Group[] = [];
      toks.forEach((t, i) => {
        const last = groups[groups.length - 1];
        if (last && samePaint(last.paint, t.paint)) last.toks.push({ w: t.w, i });
        else groups.push({ paint: t.paint, toks: [{ w: t.w, i }] });
      });
      out.push({ kind: 'line', idx, groups, color, bar });
    });
    return out;
  });

  function setLines(fn: (lines: string[]) => void) {
    const lines = song.text.split('\n');
    fn(lines);
    song.text = lines.join('\n');
    onchange();
  }

  function tapWord(idx: number, i: number) {
    if (!pen) return;
    setLines((lines) => (lines[idx] = paintWord(lines[idx], i, pen.paint, roles, singers, song.mode)));
  }

  // ---- Hvem synger delen ----
  let menuFor = $state<number | null>(null);
  const sectionOptions = $derived.by((): { label: string; code: string }[] => {
    if (song.mode === 'duett')
      return [
        { label: 'Sammen', code: '' },
        song.hv ? { label: `${nameOf('hv')} alene`, code: 'HV' } : null,
        song.hv2 ? { label: `${nameOf('hv2')} alene`, code: 'HV2' } : null,
        song.hv && song.hv2 ? { label: `${nameOf('hv')} + 2. stemme ${nameOf('hv2')}`, code: 'HV / HV2' } : null,
        song.hv && song.hv2 ? { label: `${nameOf('hv2')} + 2. stemme ${nameOf('hv')}`, code: 'HV2 / HV' } : null,
      ].filter((x): x is { label: string; code: string } => !!x);
    const o = [{ label: 'Hovedstemme', code: '' }];
    for (const c of ['k1', 'k2'] as const) {
      if (!song[c]) continue;
      o.push({ label: `Hovedstemme + 2. stemme ${nameOf(c)}`, code: `HV / ${c.toUpperCase()}` });
      o.push({ label: `${nameOf(c)} alene`, code: c.toUpperCase() });
    }
    if (song.k1 && song.k2) o.push({ label: `Hovedstemme + 2. stemme ${nameOf('k1')} + ${nameOf('k2')}`, code: 'HV / K1+K2' });
    if (song.mode === 'koring') o.push({ label: 'Alle sammen', code: 'Alle' });
    return o;
  });

  function setSectionWho(row: Extract<Row, { kind: 'head' }>, code: string) {
    setLines((lines) => {
      if (row.virtual) {
        if (code) lines.splice(row.idx, 0, writeLabel('', code)!);
      } else {
        const nl = writeLabel(row.label, code);
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
      <button type="button" class="pen" class:on={pen?.key === p.key} onclick={() => (penKey = p.key)}>
        {#if p.paint}<span class="sw" style={penSwatch(p)}>Aa</span>{:else}<span class="sw">⌫</span>{/if}
        {p.label}
      </button>
    {/each}
  </div>
  {#if song.mode === 'solo'}
    <p class="hint">Solo har ingen korister å male. Velg «Med koring» eller «Duett» over for å få penser.</p>
  {:else}
    <p class="hint">Velg pensel og trykk på ordene. Trykk på et malt ord igjen for å fjerne det. Trykk på overskriften til en del for å velge hvem som synger den.</p>
  {/if}

  <div class="sheet">
    {#each rows as row}
      {#if row.kind === 'gap'}
        <div class="gap"></div>
      {:else if row.kind === 'head'}
        <div class="headwrap">
          <button type="button" class="head" class:virtual={row.virtual} onclick={() => (menuFor = menuFor === row.idx ? null : row.idx)}>
            {#if row.label}<span class="lbl">{row.label}</span>{/if}
            <span class="desc">{row.desc} ▾</span>
          </button>
          {#if menuFor === row.idx}
            <div class="menu">
              {#each sectionOptions as o}
                <button type="button" class:on={o.code === row.who} onclick={() => setSectionWho(row, o.code)}>{o.label}</button>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <div class="ln" class:barred={!!row.bar} style:background-image={row.bar} style:color={row.color}>
          {#each row.groups as g, gi}{#if gi > 0}{' '}{/if}<span class="grp" style={paintStyle(g.paint)}
              >{#each g.toks as t, ti}{#if ti > 0}{' '}{/if}<span
                  class="w"
                  role="button"
                  tabindex="-1"
                  onclick={() => tapWord(row.idx, t.i)}
                  onkeydown={() => {}}>{t.w}</span
                >{/each}</span
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
    font-weight: 700;
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
    display: inline-flex;
    gap: 10px;
    align-items: baseline;
    color: var(--muted);
  }
  .head.virtual {
    border-color: #333;
  }
  .lbl {
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .desc {
    color: var(--fg);
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
    display: flex;
    flex-direction: column;
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
  }
  .ln.barred {
    padding-left: 0.55em;
  }
  .grp {
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
    padding-bottom: 0.05em;
  }
  .w {
    cursor: pointer;
    border-radius: 4px;
    -webkit-user-select: none;
    user-select: none;
    touch-action: manipulation;
  }
  .w:active {
    background: rgba(255, 201, 74, 0.25);
  }
</style>
