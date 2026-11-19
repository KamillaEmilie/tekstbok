<script lang="ts">
  // Fire regler: alene = vokalistens farge · sammen = hvit + farget strek til venstre ·
  // 2. stemme = farget strek under · bare kor = til høyre i korist-fargen.
  import { parseSong, personColor, vocalKind, type Part, type Person, type Who } from '../lib/parser';
  import { barStyle, colorsOf, defaultTogether, korStyle, singerInitials, underlineStyle } from '../lib/vocal';
  import { activeRoles, type Singer, type Song } from '../lib/types';

  let {
    song,
    singers,
    light = false,
    el = $bindable(),
  }: { song: Song; singers: Singer[]; light?: boolean; el?: HTMLDivElement } = $props();

  const roles = $derived(activeRoles(song));
  const parsed = $derived(parseSong(song.text ?? '', roles, singers, song.mode));
  const together0 = $derived(defaultTogether(song.mode, roles, singers));
  const kind = (who: Who | null) => vocalKind(who, song.mode, roles);

  type Seg = { text: string; style: string };
  /** solo = hvem som synger hele linjen alene (for forbokstaven), ellers null. */
  type View = { color: string | null; bar: string | null; right: boolean; main: Seg[]; side: Seg[]; solo: Person | null };
  const initials = $derived(singerInitials(singers));

  /** Regner ut hvordan én linje skal se ut. */
  function lineView(parts: Part[], lineWho: Who | null, secWho: Who | null): View {
    const base = lineWho ?? secWho ?? together0;
    const bk = kind(base);
    const color = bk === 'solo' ? (colorsOf(base!.people, light)[0] ?? null) : null;
    const bars = new Set<string>();
    // Standarden (f.eks. «sammen» i duett) gjelder bare ord som ikke er malt.
    const hasPlain = parts.some((p) => !p.who && p.text.trim());
    if (bk === 'together' && hasPlain) colorsOf(base!.people, light).forEach((c) => bars.add(c));
    const baseUl = base?.harmony?.length ? underlineStyle(base.harmony, light) : '';
    const main: Seg[] = [];
    const side: Seg[] = [];
    // Synger én person alene hele linjen? (malt solo på alle ord, eller hele linjen/delen er solo)
    const soloIds = new Set<string>();
    let notSolo = false;
    for (const p of parts) {
      if (!p.text.trim()) continue;
      const who = p.who ?? base;
      const k = kind(who);
      if (k === 'solo' && who!.people[0].id) soloIds.add(who!.people[0].id);
      else notSolo = true;
    }
    const soloPerson = !notSolo && soloIds.size === 1 ? (singers.find((s) => soloIds.has(s.id)) ?? null) : null;
    for (const p of parts) {
      const k = kind(p.who);
      const ul = k !== 'harm' && p.who?.harmony?.length ? ';' + underlineStyle(p.who.harmony, light) : '';
      if (k === 'harm') main.push({ text: p.text, style: underlineStyle(p.who!.harmony, light) });
      else if (k === 'solo') main.push({ text: p.text, style: `color:${colorsOf(p.who!.people, light)[0] ?? 'var(--fg)'}${ul}` });
      else if (k === 'together') {
        colorsOf(p.who!.people, light).forEach((c) => bars.add(c));
        main.push({ text: p.text, style: `color:var(--fg)${ul}` });
      } else if (k === 'kor') (p.margin ? side : main).push({ text: p.margin ? p.text.trim() : p.text, style: korStyle(p.who!.people, light) + ';font-style:italic;font-weight:700' });
      else main.push({ text: p.text, style: p.text.trim() ? baseUl : '' });
    }
    // Hele linjen er kor (f.eks. «(K1+K2) Shoot me»): flytt til høyre.
    if (bk === 'kor') {
      const st = korStyle(base!.people, light) + ';font-style:italic;font-weight:700';
      return { color: null, bar: null, right: true, main: [], side: [...main.map((m) => ({ text: m.text, style: m.style || st })), ...side], solo: null };
    }
    return {
      color,
      bar: barStyle([...bars]),
      right: !main.some((m) => m.text.trim()) && side.length > 0,
      main,
      side,
      solo: soloPerson ? { id: soloPerson.id, name: soloPerson.name, color: soloPerson.color } : null,
    };
  }

  const names = (people: Person[]) => people;
</script>

<div class="lyr" bind:this={el}>
  {#each parsed.sections as sec}
    {@const views = sec.lines.map((ln) => lineView(ln.parts, ln.who, sec.who))}
    <section class="sec" class:chorus={sec.chorus}>
      {#if sec.label || (sec.who && kind(sec.who) !== 'none')}
        <div class="lbl">
          {sec.label}{#if sec.who}<span class="who"
              >{#each names(sec.who.people) as p, i}{#if i > 0}<span class="plus"> + </span>{/if}<b
                  style:color={p.color ? personColor(p.color, light) : null}>{p.name}</b
                >{/each}{#if sec.who.harmony?.length}<span class="plus">{sec.who.people.length ? ' · ' : ''}2.st </span
                >{#each sec.who.harmony as p, i}{#if i > 0}<span class="plus"> + </span>{/if}<b
                    style:color={p.color ? personColor(p.color, light) : null}>{p.name}</b
                  >{/each}{/if}</span
            >{/if}
        </div>
      {/if}
      {#each sec.lines as ln, li}
        {@const v = views[li]}
        {@const badge = v.solo && v.solo.id !== views[li - 1]?.solo?.id ? v.solo : null}
        <div
          class="ln"
          class:rep={ln.repeated}
          class:barred={!!v.bar}
          class:greybar={sec.chorus && !v.bar}
          class:right={v.right}
          class:withm={v.side.length > 0 && !v.right}
          style:color={v.color}
          style:background-image={v.bar}
        >
          {#if !v.right}<span class="main"
              >{#if badge}<span class="badge" style:color={badge.color ? personColor(badge.color, light) : null}
                  >{initials.get(badge.id!) ?? badge.name[0]}</span
                >{/if}{#each v.main as m}{#if m.style}<span class="seg" style={m.style}>{m.text}</span>{:else}{m.text}{/if}{/each}</span>{/if}{#if v.side.length}<span
              class="side">{#each v.side as m, i}{#if i > 0}{' '}{/if}<span class="seg" style={m.style}>{m.text}</span>{/each}</span
            >{/if}
        </div>
      {/each}
    </section>
  {:else}
    <div class="ln none">Ingen tekst lagt inn</div>
  {/each}
</div>

<style>
  .lyr {
    line-height: 1.3;
    overflow-wrap: break-word;
  }
  .sec {
    break-inside: avoid;
    -webkit-column-break-inside: avoid;
    margin: 0 0 0.7em;
  }
  .sec.chorus .ln {
    font-weight: 700;
  }
  .lbl {
    font-size: 0.55em;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin-bottom: 0.15em;
  }
  .who {
    margin-left: 0.6em;
    text-transform: none;
    letter-spacing: 0.02em;
  }
  .plus {
    color: var(--muted);
  }
  .ln {
    position: relative;
    background-size: 5px 100%;
    background-repeat: no-repeat;
    padding-left: 0.85em;
  }
  .ln.greybar {
    background-image: linear-gradient(var(--muted), var(--muted));
  }
  .ln.rep {
    font-weight: 700;
  }
  .ln.withm {
    display: flex;
    align-items: baseline;
    gap: 0.8em;
  }
  .ln.withm .main {
    flex: 1;
    min-width: 0;
  }
  .ln.right {
    text-align: right;
  }
  .side {
    font-size: 0.82em;
    text-align: right;
    max-width: 50%;
  }
  .ln.right .side {
    max-width: none;
  }
  .seg {
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }
  /* Forbokstav i venstremargen, så teksten står på linje med resten */
  .badge {
    position: absolute;
    left: 0;
    top: 0.2em;
    font-size: 0.55em;
    font-weight: 700;
    line-height: 1.6;
    font-style: normal;
  }
  .none {
    color: var(--muted);
  }
</style>
