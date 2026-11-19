<script lang="ts">
  import { store, saveSettings, reload } from '../lib/store.svelte';
  import * as db from '../lib/db';
  import { toast } from '../lib/toast.svelte';
  import { bundleFilename, convertPrototype, makeBundle, mergeBundle, shareOrDownload, summarize, validateBundle } from '../lib/io';
  import { isStandalone } from '../lib/ready';

  let fileInput = $state<HTMLInputElement>();
  let pasted = $state('');
  let result = $state<{ ok: boolean; text: string } | null>(null);

  async function exportAll() {
    const b = makeBundle($state.snapshot(store) as never);
    const r = await shareOrDownload(b, bundleFilename('tekstbok'));
    if (r === 'cancelled') return;
    store.settings.lastExportAt = Date.now();
    saveSettings();
    toast(r === 'shared' ? 'Biblioteket er delt.' : 'Biblioteket er lastet ned.');
  }

  async function importBundle(raw: unknown) {
    const bundle = validateBundle(raw);
    const m = mergeBundle($state.snapshot(store) as never, bundle);
    await db.putMany(m.put);
    await reload();
    result = { ok: true, text: summarize(m.counts) };
  }

  async function onFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      await importBundle(JSON.parse(await f.text()));
    } catch (err) {
      result = { ok: false, text: errText(err) };
    } finally {
      if (fileInput) fileInput.value = '';
    }
  }

  async function onPasteImport() {
    try {
      const raw = JSON.parse(pasted);
      if (Array.isArray(raw)) {
        const { songs, newSingers } = convertPrototype(raw, $state.snapshot(store.singers));
        await db.putMany({ songs, singers: newSingers });
        await reload();
        result = {
          ok: true,
          text: `${songs.length} låter importert fra prototypen` + (newSingers.length ? `, ${newSingers.length} nye vokalister` : '') + '.',
        };
      } else {
        await importBundle(raw);
      }
      pasted = '';
    } catch (err) {
      result = { ok: false, text: errText(err) };
    }
  }

  const errText = (e: unknown) => (e instanceof SyntaxError ? 'Klarte ikke å lese teksten som JSON.' : (e as Error)?.message || 'Import feilet.');

  let persisted = $state<boolean | null>(null);
  $effect(() => {
    void navigator.storage?.persisted?.().then((p) => (persisted = p));
  });
</script>

<div class="page">
  <h1>Deling og sikkerhetskopi</h1>

  <section class="card">
    <h2>Eksporter</h2>
    <p class="hint">
      Lagrer alle låter, vokalister og settlister i én <code>.tekstbok.json</code>-fil. På iPad kan du sende den med AirDrop til de andre i
      bandet, eller lagre den i Filer som sikkerhetskopi. En enkelt settliste deler du fra settlisten.
    </p>
    <div class="bar">
      <button class="primary" onclick={exportAll}>Eksporter hele biblioteket</button>
      {#if store.settings.lastExportAt}
        <span class="hint">Sist eksportert {new Date(store.settings.lastExportAt).toLocaleString('no', { dateStyle: 'medium', timeStyle: 'short' })}</span>
      {/if}
    </div>
  </section>

  <section class="card">
    <h2>Importer</h2>
    <p class="hint">
      Velg en <code>.tekstbok.json</code>-fil. Den slås sammen med det du har. Hvis samme låt finnes begge steder, beholdes den som sist ble endret.
    </p>
    <div class="bar">
      <button onclick={() => fileInput?.click()}>Velg fil …</button>
      <input bind:this={fileInput} type="file" accept=".json,application/json" onchange={onFile} hidden />
    </div>
    {#if result}
      <p class:ok={result.ok} class:bad={!result.ok}>{result.ok ? '✓ ' : '✕ '}{result.text}</p>
    {/if}
  </section>

  <section class="card">
    <h2>Lim inn fra prototypen</h2>
    <p class="hint">Trykk «Kopier alt» i den gamle prototypen, og lim inn her. Vokalistene kobles til på navn.</p>
    <textarea bind:value={pasted} placeholder="Lim inn her" rows="5"></textarea>
    <div class="bar"><button onclick={onPasteImport} disabled={!pasted.trim()}>Konverter og importer</button></div>
  </section>

  <section class="card">
    <h2>Status</h2>
    <ul class="hint">
      <li>{store.songs.length} låter, {store.setlists.length} settlister, {store.singers.length} vokalister</li>
      <li>Startet fra Hjem-skjermen: {isStandalone() ? 'ja' : 'nei – bruk Del → Legg til på Hjem-skjerm'}</li>
      <li>Varig lagring: {persisted === null ? 'ukjent' : persisted ? 'ja' : isStandalone() ? 'ja (Hjem-skjerm-app)' : 'nei'}</li>
      <li>Bruk uten nett: {navigator.serviceWorker?.controller ? 'aktiv' : 'ikke aktiv ennå'}</li>
      <li>Versjon {__APP_VERSION__}</li>
    </ul>
  </section>
</div>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .ok {
    color: var(--ok);
    margin: 0;
  }
  .bad {
    color: var(--bad);
    margin: 0;
  }
  ul {
    margin: 0;
    padding-left: 1.2em;
  }
</style>
