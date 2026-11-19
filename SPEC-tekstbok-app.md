# Tekstbok – scene-app for bandet (iPad, offline)

## Mål
Bygg en installerbar nettapp (PWA) for iPad som bandet bruker på scenen for å lese sangtekster.
Den skal kunne legges på hjemskjermen fra Safari og fungere **helt uten nett** når låtene er lagt inn og en settliste er gjort klar.

Vedlagt ligger `tekstbok-prototype.html`, en fungerende prototype (én fil). Bruk den som fasit for funksjoner og utseende, men bygg appen ordentlig opp med komponenter, lagring og offline-støtte som beskrevet her.

## Teknologi
- **Vite + TypeScript**, gjerne med Svelte eller React (velg det som gir minst kode). Ingen backend.
- **vite-plugin-pwa** (Workbox) for service worker og manifest. Alle filer skal precaches, også fonter og ikoner.
- **IndexedDB** (via `idb` eller Dexie) for lagring. Ikke localStorage.
- Kall `navigator.storage.persist()` ved oppstart, så Safari ikke sletter dataene.
- Ingen eksterne ressurser når appen kjører: fonten (Atkinson Hyperlegible) bundles lokalt, ingen CDN.
- Hosting: GitHub Pages eller Netlify (statisk). Legg ved en kort README for deploy.

## Viktig avgrensning
Appen skal **ikke** hente sangtekster fra nettet automatisk (ingen skraping av tekstsider eller API-er). Tekster legges inn manuelt av brukeren, ved å lime inn eller skrive.

## Datamodell
```ts
type Singer = { id: string; name: string; color: string };           // f.eks. Siri #ff7eb6, Kamilla #ffd23f, Leif #5ee07a
type VocalMode = 'solo' | 'duett' | 'koring';
type Layout = 'scroll' | 'cols2' | 'fit';

type Song = {
  id: string; title: string; artist?: string;
  key?: string; bpm?: string; capo?: string; notes?: string;
  mode: VocalMode;
  hv?: string;  hv2?: string;  k1?: string;  k2?: string;              // Singer.id
  layout: Layout;
  text: string;                                                        // råtekst med merking, se under
  updatedAt: number;
};

type Setlist = {
  id: string; name: string; date?: string; venue?: string;
  songIds: string[];                                                   // rekkefølge
  readyAt?: number;                                                    // satt når "Klar for spillejobb" er kjørt
};
```
Standard vokalister ved første oppstart: **Siri (rosa), Kamilla (gul), Leif (grønn)**. De kan redigeres, og man kan legge til flere.

## Skjermer

### 1. Bibliotek (alle låter)
- Liste med søk. Ny låt, rediger og slett (med angre i stedet for bekreftelsesdialog).
- En låt kan brukes i flere settlister.

### 2. Rediger låt
- Felter: tittel, artist, toneart, tempo, capo og notater.
- **Vokal:** velg Solo, Duett eller Med koring.
  - Solo: ett valg for hovedvokal.
  - Duett: Hovedvokal 1 og Hovedvokal 2.
  - Med koring: hovedvokal, Koring 1 og Koring 2.
  - Vokalistene velges fra nedtrekkslister med vokalistlisten.
- **Oppsett på scenen:** Nedover (scroll), To spalter eller Hele låten på én skjerm.
- Stort tekstfelt for tekst, med:
  - Automatisk fjerning av linjer som starter med `Source:`, `Songwriters:` eller inneholder `lyrics ©`, `LyricFind` eller `Musixmatch`.
  - Knappen **«Del opp automatisk»**: hvis teksten mangler tomme linjer, settes det inn skillelinjer der en serie gjentatte linjer starter eller slutter (se prototypen).
  - Hurtigknapper som setter inn merking ved markøren og som tilpasser seg vokalvalget.
- **Forhåndsvisning** av hvordan låten ser ut på scenen.

### 3. Settlister
- Opprett en settliste, legg til låter fra biblioteket og endre rekkefølgen ved å dra.
- Knappen **«Klar for spillejobb»**: sjekker at service worker er aktiv og alle filer er cachet, at alle låtene i lista har tekst, og at lagringen er persistent. Viser en grønn status («Klar – fungerer uten nett») eller en liste over hva som mangler.

### 4. Scenemodus
- Én låt om gangen, i settlisterekkefølge. Topplinjen viser tittel, toneart, tempo og capo, låtnummer (f.eks. 3 / 12) og vokalistene med farger.
- Navigasjon: sveip sidelengs, knapper nederst, og tastatur/Bluetooth-pedal (`ArrowRight`, `PageDown` og `Space` = neste, `ArrowLeft` og `PageUp` = forrige). Ved bytte av låt starter visningen øverst.
- Oppsett per låt:
  - `scroll`: én spalte og vertikal scrolling. Skriften skaleres etter skjermbredden, og det er ekstra plass nederst.
  - `cols2`: to spalter med scrolling.
  - `fit`: største skriftstørrelse der hele låten får plass uten scrolling, med 1–3 spalter.
- A− og A+ for skriftstørrelse (lagres globalt), lys og mørk visning, og en settlisteoversikt som lar deg hoppe til en låt.
- **Screen Wake Lock API** skal holde skjermen våken i scenemodus, med reserveløsning hvis API-et ikke er støttet.
- Bruk `env(safe-area-inset-*)` og `viewport-fit=cover`. Støtt både liggende og stående iPad.

## Tekstformat og merking (parseren)
- En tom linje gir ny del.
- `[Navn på del]` på egen linje gir en delmerkelapp, f.eks. `[Vers 1]`.
- `[Del | hvem]` angir hvem som synger hele delen. `hvem` kan være koder eller navn, kombinert med `+`, `,` eller `&`:
  - Koder: `HV` (eller `HV1`), `HV2`, `K1`, `K2`, `Alle` eller `Begge`. Kodene oversettes til personene som er valgt for låten.
  - Navn: `Siri`, `Kamilla`, `Leif` (uten skille mellom store og små bokstaver).
- `(hvem)` først på en linje angir hvem som synger den linjen, og overstyrer delens valg.
- Farger:
  - Én person gir tekst og kantstrek i personens farge.
  - Flere personer gir hvit tekst og en kantstrek med fargeovergang i alle fargene.
  - Uten merking er teksten nøytral (hvit eller svart).
  - Delen `[Refreng]` uten vokalist får fet skrift og en grå kantstrek.
  - Hvis låten ikke har noen merking, får linjer som gjentas fet skrift, så refrenget er lett å finne.
- I lys visning gjøres personfargene mørkere (`color-mix(in srgb, farge 62%, black)`), så de er lesbare.
- Skriv enhetstester for parseren (Vitest) med enkle oppdiktede testtekster, ikke ekte sangtekster.

## Deling i bandet (uten server)
- **Eksporter** en settliste eller hele biblioteket som en `.tekstbok.json`-fil med låter, vokalister og settlister. Bruk Web Share API med fil der det støttes (AirDrop på iPad), og nedlasting som reserveløsning.
- **Importer** en `.tekstbok.json` via filvelger. Slå sammen på `id`, og ved konflikt beholdes nyeste `updatedAt`. Vis et sammendrag («5 nye, 2 oppdatert»).
- Påminnelse i appen: ta eksport som sikkerhetskopi før en spillejobb.

## Offline-krav (akseptansekriterier)
1. Etter første besøk og «Legg til på Hjem-skjerm» starter appen i flymodus fra hjemskjermen.
2. Alle funksjoner unntatt deling over nett virker offline: redigering, settlister, scenemodus, import og eksport av fil.
3. Data overlever at appen lukkes, at iPaden startes på nytt og flere uker uten bruk.
4. En ny versjon av appen oppdateres i bakgrunnen og tas i bruk først neste gang appen startes, aldri midt i scenemodus. Vis en diskret melding om at en oppdatering er klar.
5. «Klar for spillejobb» gir et sant svar på om alt fungerer offline.

## PWA-detaljer for iPad
- `manifest.webmanifest`: `display: standalone`, liggende og stående orientering, mørk `theme_color`, og ikoner i 180, 192 og 512 px (pluss `apple-touch-icon`).
- `<meta name="apple-mobile-web-app-capable" content="yes">` og en passende statuslinjestil.
- Test i Safari på iPadOS. Ikke bruk API-er som krever Chrome.

## Design
- Mørk scene-modus som standard: bakgrunn #111 og tekst #f4f1ea. Høy kontrast og store trykkflater (minst 44 px).
- Gul aksent (#ffc94a) brukes bare i grensesnittet (knapper og valgt låt), aldri som tekstfarge i sangteksten, fordi gul er Kamillas farge.
- Ingen `alert`, `confirm` eller `prompt`. Bruk egne dialoger og angre-meldinger.

## Leveranse
- Kildekode med README: kjøre lokalt, bygge, deploye til GitHub Pages eller Netlify, og installere på iPad (Safari → Del → Legg til på Hjem-skjerm).
- Import av data fra prototypen: prototypen eksporterer en JSON-liste med låter via «Kopier alt». Appen bør kunne lime inn den og konvertere den (feltene `title`, `artist`, `key`, `bpm`, `capo`, `mode`, `hv`, `hv2`, `k1`, `k2`, `layout` og `text`, der vokalistene er lagret som navn).
