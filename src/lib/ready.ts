import type { Setlist, Song } from './types';

export type Check = { ok: boolean; label: string; detail?: string };

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

async function askServiceWorker(sw: ServiceWorker): Promise<{ total: number; missing: string[] }> {
  return new Promise((resolve, reject) => {
    const ch = new MessageChannel();
    const t = setTimeout(() => reject(new Error('timeout')), 8000);
    ch.port1.onmessage = (e) => {
      clearTimeout(t);
      resolve(e.data);
    };
    sw.postMessage({ type: 'CHECK_PRECACHE' }, [ch.port2]);
  });
}

/** Gir et sant svar på om settlisten kan brukes uten nett. */
export async function checkReady(setlist: Setlist, songs: Song[]): Promise<Check[]> {
  const checks: Check[] = [];

  // 1. Service worker
  const controller = navigator.serviceWorker?.controller ?? null;
  if (!controller) {
    checks.push({
      ok: false,
      label: 'Appen er ikke installert for bruk uten nett',
      detail: 'Lukk og åpne appen igjen mens du har nett. Hvis det ikke hjelper: last inn siden på nytt.',
    });
  } else {
    checks.push({ ok: true, label: 'Service worker er aktiv' });
    // 2. Alle filer cachet
    try {
      const r = await askServiceWorker(controller);
      checks.push(
        r.missing.length
          ? { ok: false, label: `${r.missing.length} av ${r.total} filer mangler i cachen`, detail: 'Åpne appen med nett en gang til og vent litt.' }
          : { ok: true, label: `Alle ${r.total} filer er lagret på iPaden` },
      );
    } catch {
      checks.push({ ok: false, label: 'Fikk ikke svar fra service worker', detail: 'Lukk og åpne appen på nytt.' });
    }
  }

  // 3. Låtene
  const byId = new Map(songs.map((s) => [s.id, s]));
  const listed = setlist.songIds.map((id) => byId.get(id));
  const missingSongs = listed.filter((s) => !s).length;
  const empty = listed.filter((s): s is Song => !!s && !s.text.trim());
  if (!setlist.songIds.length) checks.push({ ok: false, label: 'Settlisten er tom' });
  else if (missingSongs) checks.push({ ok: false, label: `${missingSongs} låt(er) finnes ikke lenger i biblioteket` });
  if (empty.length)
    checks.push({ ok: false, label: `${empty.length} låt(er) mangler tekst`, detail: empty.map((s) => s.title || '(uten tittel)').join(', ') });
  else if (setlist.songIds.length && !missingSongs) checks.push({ ok: true, label: setlist.songIds.length === 1 ? 'Låten har tekst' : `Alle ${setlist.songIds.length} låtene har tekst` });

  // 4. Lagring
  let persisted = false;
  try {
    persisted = (await navigator.storage?.persisted?.()) ?? false;
    if (!persisted) persisted = (await navigator.storage?.persist?.()) ?? false;
  } catch {
    /* ikke støttet */
  }
  if (persisted) checks.push({ ok: true, label: 'Lagringen er varig' });
  else if (isStandalone())
    checks.push({ ok: true, label: 'Lagringen er varig', detail: 'Appen ligger på Hjem-skjermen, og da sletter ikke Safari dataene.' });
  else
    checks.push({
      ok: false,
      label: 'Lagringen er ikke sikret',
      detail: 'Legg appen til på Hjem-skjermen (Del → Legg til på Hjem-skjerm) og åpne den derfra.',
    });

  return checks;
}
