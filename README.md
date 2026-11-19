# Tekstbok

Tekstbok er en scene-app for bandet, laget for iPad. Den viser sangtekster i settlisterekkefølge og fungerer helt uten nett når den er lagt på Hjem-skjermen.

- Laget med Vite, Svelte 5 og TypeScript. Det finnes ingen backend.
- Alle data lagres i IndexedDB på iPaden.
- En service worker (Workbox) lagrer alle filene, også fonten og ikonene, så appen virker i flymodus.
- Støtter **iPadOS 16.6 og nyere** (Safari 16). På iPadOS før 18.4 holdes skjermen våken med en dempet, skjult video, fordi Screen Wake Lock ikke virker i Hjem-skjerm-apper på disse versjonene.

## Kjøre lokalt

Du trenger Node 20 eller nyere.

```bash
npm install
npm run dev        # utviklingsserver (service worker er av i dev)
npm test           # enhetstester for parser og import/eksport
npm run check      # typesjekk
npm run build      # produksjonsbygg i dist/
npm run preview    # serverer dist/ med service worker, for å teste offline
```

Vil du teste offline-støtten, kjører du `npm run build` og deretter `npm run preview`. Åpne siden, slå av nettet i nettleserens utviklerverktøy og last siden inn på nytt.

Ikonene lages med `npm run icons` (Python 3, uten ekstra pakker).

## Deploy

Bygget bruker relative stier (`base: './'`). Derfor virker samme bygg både på rotdomenet og i en undermappe.

### Netlify
- Build command: `npm run build`
- Publish directory: `dist`

### GitHub Pages
1. Legg til `.github/workflows/deploy.yml` (se under), og push til `main`.
2. Velg Settings → Pages → Source: **GitHub Actions**.

```yaml
name: Deploy
on: { push: { branches: [main] } }
permissions: { contents: read, pages: write, id-token: write }
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: { name: github-pages }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci && npm test && npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
      - uses: actions/deploy-pages@v4
```

Appen må serveres over **https**, ellers virker ikke service worker.

## Installere på iPad

1. Åpne adressen i **Safari** (ikke Chrome).
2. Trykk **Del** → **Legg til på Hjem-skjerm**.
3. Åpne appen fra Hjem-skjermen én gang mens du har nett, og vent noen sekunder.
4. Gå til en settliste og trykk **Klar for spillejobb**. Grønn status betyr at alt virker uten nett.

Data lagret i Hjem-skjerm-appen er adskilt fra Safari. Hvis du først har lagt inn låter i Safari, må du eksportere dem derfra og importere dem i appen.

## Oppdateringer

En ny versjon lastes ned i bakgrunnen, men tas i bruk først neste gang appen startes. Den byttes aldri ut midt i scenemodus. Når en oppdatering er klar, vises en diskret melding med knappen «Start på nytt nå».

## Deling i bandet

- **Deling → Eksporter** lager en `.tekstbok.json`-fil. På iPad åpnes delingsarket, så filen kan sendes med AirDrop.
- **Importer** slår sammen etter `id`. Hvis samme låt finnes begge steder, beholdes den som sist ble endret.
- **Lim inn fra prototypen:** lim inn resultatet av «Kopier alt» fra den gamle prototypen.

Ta en eksport som sikkerhetskopi før hver spillejobb.

## Tekstformat

| Skriv | Betyr |
|---|---|
| tom linje | ny del |
| `[Vers 1]` | delmerke |
| `[Refreng]` | uthevet refreng |
| `[Vers 2 \| HV2]` | hvem som synger delen (`HV`, `HV2`, `K1`, `K2`, `Alle`, `Begge` eller navn) |
| `[Refreng \| HV+K1]` | flere sangere, med fargeovergang |
| `(K1) tekst` | hvem som synger denne linjen |

Appen henter aldri tekster fra nettet. Alt legges inn manuelt.

## Struktur

```
src/
  lib/parser.ts        tekstformatet (testet i parser.test.ts)
  lib/io.ts            eksport, import, sammenslåing og prototype-import (io.test.ts)
  lib/db.ts            IndexedDB via idb
  lib/store.svelte.ts  app-tilstand og lagring
  lib/ready.ts         «Klar for spillejobb»-sjekken
  lib/wake.ts          holder skjermen våken
  sw.ts                service worker (precache, og svarer på sjekken)
  components/          skjermene
```
