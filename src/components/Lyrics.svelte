<script lang="ts">
  import { parseSong, personColor, whoStyle, type Part, type Person, type Who } from '../lib/parser';
  import { activeRoles, type Singer, type Song } from '../lib/types';

  let {
    song,
    singers,
    light = false,
    el = $bindable(),
  }: { song: Song; singers: Singer[]; light?: boolean; el?: HTMLDivElement } = $props();

  const parsed = $derived(parseSong(song.text ?? '', activeRoles(song), singers, song.mode));

  const colorsOf = (people: Person[]) => people.filter((p) => p.color).map((p) => personColor(p.color!, light));

  /** Koring: én person gir personens farge, flere gir fargeovergang i teksten. */
  function korStyle(who: Who): string {
    const cols = colorsOf(who.people);
    if (cols.length === 1) return `color:${cols[0]}`;
    if (cols.length > 1)
      return `background-image:linear-gradient(90deg,${cols.join(',')});-webkit-background-clip:text;background-clip:text;color:transparent`;
    return '';
  }

  /** Annenstemme: farget strek under teksten, i fargen til den (eller de) som tar annenstemmen. */
  function underline(harmony: Person[]): string | null {
    const cols = colorsOf(harmony);
    if (!cols.length) return harmony.length ? 'text-decoration:underline;text-underline-offset:0.18em' : null;
    const g = cols.length === 1 ? `${cols[0]},${cols[0]}` : cols.join(',');
    return `background-image:linear-gradient(90deg,${g});background-size:100% 0.11em;background-position:0 100%;background-repeat:no-repeat;padding-bottom:0.06em`;
  }

  const mainParts = (parts: Part[]) => parts.filter((p) => !p.margin);
  const marginParts = (parts: Part[]) => parts.filter((p) => p.margin);
</script>

{#snippet names(people: Person[], all = false)}
  {#if all}
    <b>Alle</b>
  {:else}
    {#each people as p, i}
      {#if i > 0}<span class="plus"> + </span>{/if}<b style:color={p.color ? personColor(p.color, light) : null}>{p.name}</b>
    {/each}
  {/if}
{/snippet}

{#snippet whoLabel(who: Who)}
  {#if who.people.length}{@render names(who.people, who.all)}{/if}{#if who.harmony?.length}<span class="plus"
      >{who.people.length ? ' · ' : ''}2.st{' '}</span
    >{@render names(who.harmony)}{/if}
{/snippet}

<div class="lyr" bind:this={el}>
  {#each parsed.sections as sec}
    {@const ws = whoStyle(sec.who, light)}
    {@const showWho = !!sec.who}
    <section
      class="sec"
      class:chorus={sec.chorus}
      class:greybar={sec.chorus && !ws.bar}
      class:barred={!!ws.bar}
      style:background-image={ws.bar ?? null}
    >
      {#if sec.label || showWho}
        <div class="lbl">{sec.label}{#if showWho && sec.who}<span class="who">{@render whoLabel(sec.who)}</span>{/if}</div>
      {/if}
      {#each sec.lines as ln}
        {@const lw = ln.who ? whoStyle(ln.who, light) : null}
        {@const harmony = (ln.who ? ln.who.harmony : sec.who?.harmony) ?? []}
        {@const lineUl = underline(harmony)}
        {@const side = marginParts(ln.parts)}
        <div class="ln" class:rep={ln.repeated} class:withm={side.length > 0} style:color={lw && ln.who?.people.length ? (lw.text ?? 'var(--fg)') : (ws.text ?? null)}>
          <span class="main"
            >{#if ln.who}<span class="tag">{@render whoLabel(ln.who)}</span>{/if}{#each mainParts(ln.parts) as part}{#if part.who && !part.who.people.length}<span
                  class="ul"
                  style={underline(part.who.harmony)}>{part.text}</span
                >{:else if part.who}<span class="kor" style={korStyle(part.who)}>{part.text}</span>{:else if lineUl && part.text.trim()}<span
                  class="ul"
                  style={lineUl}>{part.text}</span
                >{:else}{part.text}{/if}{/each}</span
          >{#if side.length}<span class="side"
              >{#each side as part, i}{#if i > 0}{' '}{/if}<span class="kor" style={korStyle(part.who!)}>{part.text.trim()}</span>{/each}</span
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
    background-size: 5px 100%;
    background-repeat: no-repeat;
  }
  .sec.barred,
  .sec.greybar {
    padding-left: 0.55em;
  }
  .sec.greybar {
    background-image: linear-gradient(var(--muted), var(--muted));
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
  .side {
    font-size: 0.78em;
    font-style: italic;
    text-align: right;
    max-width: 45%;
  }
  .kor {
    font-weight: 700;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }
  .ul {
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }
  .tag {
    font-size: 0.5em;
    margin-right: 0.5em;
    vertical-align: middle;
    color: var(--muted);
  }
  .none {
    color: var(--muted);
  }
</style>
