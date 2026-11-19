<script lang="ts">
  import { parseSong, personColor, whoStyle, type Who } from '../lib/parser';

  import { activeRoles, type Singer, type Song } from '../lib/types';

  let {
    song,
    singers,
    light = false,
    el = $bindable(),
  }: { song: Song; singers: Singer[]; light?: boolean; el?: HTMLDivElement } = $props();

  /** Farge for koringsord: én person gir personens farge, flere gir fargeovergang i teksten. */
  function partStyle(who: Who, light: boolean): string {
    const cols = who.people.filter((p) => p.color).map((p) => personColor(p.color!, light));
    if (cols.length === 1) return `color:${cols[0]}`;
    if (cols.length > 1)
      return `background-image:linear-gradient(90deg,${cols.join(',')});-webkit-background-clip:text;background-clip:text;color:transparent`;
    return '';
  }

  const parsed = $derived(parseSong(song.text ?? '', activeRoles(song), singers));
</script>

{#snippet names(who: Who)}
  {#if who.all}
    <b>Alle</b>
  {:else}
    {#each who.people as p, i}
      {#if i > 0}<span class="plus"> + </span>{/if}<b style:color={p.color ? personColor(p.color, light) : null}>{p.name}</b>
    {/each}
  {/if}
{/snippet}

<div class="lyr" bind:this={el}>
  {#each parsed.sections as sec}
    {@const ws = whoStyle(sec.who, light)}
    <section
      class="sec"
      class:chorus={sec.chorus && !sec.who}
      class:barred={!!ws.bar}
      style:background-image={ws.bar ?? null}
    >
      {#if sec.label || sec.who}
        <div class="lbl">{sec.label}{#if sec.who}<span class="who">{@render names(sec.who)}</span>{/if}</div>
      {/if}
      {#each sec.lines as ln}
        {@const lw = ln.who ? whoStyle(ln.who, light) : null}
        <div class="ln" class:rep={ln.repeated} style:color={lw ? (lw.text ?? 'var(--fg)') : (ws.text ?? null)}>
          {#if ln.who}<span class="tag">{@render names(ln.who)}</span>{/if}{#each ln.parts as part}{#if part.who}<span
                class="kor"
                style={partStyle(part.who, light)}>{part.text}</span
              >{:else}{part.text}{/if}{/each}
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
  .sec.chorus {
    padding-left: 0.55em;
  }
  .sec.chorus {
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
  .kor {
    font-weight: 700;
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
