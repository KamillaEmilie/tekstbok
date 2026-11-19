import { EXTRA_COLORS, uid, type Layout, type Marker, type Setlist, type Singer, type Song, type VocalMode } from './types';

export type Bundle = {
  format: 'tekstbok';
  version: 1;
  exportedAt: number;
  singers: Singer[];
  songs: Song[];
  setlists: Setlist[];
};

export type Data = { songs: Song[]; setlists: Setlist[]; singers: Singer[] };

export function makeBundle(data: Data, setlistId?: string): Bundle {
  let { songs, setlists } = data;
  if (setlistId) {
    setlists = setlists.filter((l) => l.id === setlistId);
    const ids = new Set(setlists.flatMap((l) => l.songIds));
    songs = songs.filter((s) => ids.has(s.id));
  }
  return { format: 'tekstbok', version: 1, exportedAt: Date.now(), singers: data.singers, songs, setlists };
}

export function bundleFilename(name: string): string {
  const safe = name
    .toLowerCase()
    .replace(/[æ]/g, 'ae')
    .replace(/[ø]/g, 'o')
    .replace(/[å]/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${safe || 'tekstbok'}-${new Date().toISOString().slice(0, 10)}.tekstbok.json`;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

export function validateBundle(x: unknown): Bundle {
  if (!isObj(x) || x.format !== 'tekstbok') throw new Error('Filen er ikke en tekstbok-fil.');
  const arr = (k: string) => (Array.isArray(x[k]) ? (x[k] as unknown[]).filter(isObj) : []);
  const songs = arr('songs')
    .filter((s) => typeof s.id === 'string')
    .map((s) => normalizeSong(s as Partial<Song>));
  const setlists = arr('setlists')
    .filter((l) => typeof l.id === 'string')
    .map((l) => ({
      id: String(l.id),
      name: String(l.name ?? 'Settliste'),
      date: l.date ? String(l.date) : undefined,
      venue: l.venue ? String(l.venue) : undefined,
      songIds: Array.isArray(l.songIds) ? l.songIds.map(String) : [],
      markers: readMarkers(l.markers),
      updatedAt: typeof l.updatedAt === 'number' ? l.updatedAt : 0,
    }));
  const singers = arr('singers')
    .filter((s) => typeof s.id === 'string')
    .map((s) => ({
      id: String(s.id),
      name: String(s.name ?? ''),
      color: typeof s.color === 'string' ? s.color : '#5fb7ff',
      order: typeof s.order === 'number' ? s.order : 0,
      updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : 0,
    }));
  return { format: 'tekstbok', version: 1, exportedAt: Number(x.exportedAt) || 0, songs, setlists, singers };
}

function readMarkers(x: unknown): Record<string, Marker> | undefined {
  if (!isObj(x)) return undefined;
  const out: Record<string, Marker> = {};
  for (const [k, v] of Object.entries(x)) {
    if (isObj(v)) out[k] = { kind: v.kind === 'prat' ? 'prat' : 'pause', text: str(v.text) };
  }
  return out;
}

const MODES: VocalMode[] = ['solo', 'duett', 'koring'];
const LAYOUTS: Layout[] = ['scroll', 'cols2', 'fit'];
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

function normalizeSong(s: Partial<Song>): Song {
  return {
    id: str(s.id) || uid(),
    title: str(s.title),
    artist: str(s.artist),
    key: str(s.key),
    bpm: str(s.bpm),
    capo: str(s.capo),
    duration: str(s.duration),
    notes: str(s.notes),
    mode: MODES.includes(s.mode as VocalMode) ? (s.mode as VocalMode) : 'solo',
    hv: str(s.hv) || undefined,
    hv2: str(s.hv2) || undefined,
    k1: str(s.k1) || undefined,
    k2: str(s.k2) || undefined,
    layout: LAYOUTS.includes(s.layout as Layout) ? (s.layout as Layout) : 'scroll',
    text: str(s.text),
    updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : 0,
  };
}

export type Counts = { new: number; updated: number; unchanged: number };
export type MergeResult = { put: Data; counts: { songs: Counts; setlists: Counts; singers: Counts } };

function mergeList<T extends { id: string; updatedAt?: number }>(
  existing: T[],
  incoming: T[],
  fillGaps?: (cur: T, inc: T) => T | null,
) {
  const map = new Map(existing.map((x) => [x.id, x]));
  const put: T[] = [];
  const counts: Counts = { new: 0, updated: 0, unchanged: 0 };
  for (const item of incoming) {
    const cur = map.get(item.id);
    if (!cur) {
      counts.new++;
      put.push(item);
    } else if ((item.updatedAt ?? 0) > (cur.updatedAt ?? 0)) {
      counts.updated++;
      put.push(item);
    } else {
      // Vår versjon er nyest, men fyll inn felt vi mangler (f.eks. varighet).
      const filled = fillGaps?.(cur, item);
      if (filled) {
        counts.updated++;
        put.push(filled);
      } else counts.unchanged++;
    }
  }
  return { put, counts };
}

/** Felt som kan fylles inn fra en import uten å overskrive noe. Teksten røres aldri. */
const FILLABLE = ['artist', 'key', 'bpm', 'capo', 'notes', 'duration'] as const;
export function fillSongGaps(cur: Song, inc: Song): Song | null {
  let out: Song | null = null;
  for (const f of FILLABLE) {
    if (!(cur[f] ?? '').trim() && (inc[f] ?? '').trim()) (out ??= { ...cur })[f] = inc[f];
  }
  return out;
}

/** Slår sammen på id. Ved konflikt vinner nyeste updatedAt. */
export function mergeBundle(existing: Data, incoming: Bundle): MergeResult {
  const songs = mergeList(existing.songs, incoming.songs, fillSongGaps);
  const setlists = mergeList(existing.setlists, incoming.setlists);
  const singers = mergeList(existing.singers, incoming.singers);
  return {
    put: { songs: songs.put, setlists: setlists.put, singers: singers.put },
    counts: { songs: songs.counts, setlists: setlists.counts, singers: singers.counts },
  };
}

export function summarize(c: MergeResult['counts']): string {
  const part = (n: string, x: Counts) => {
    const bits = [x.new && `${x.new} nye`, x.updated && `${x.updated} oppdatert`].filter(Boolean);
    return bits.length ? `${n}: ${bits.join(', ')}` : '';
  };
  const s = [part('Låter', c.songs), part('Settlister', c.setlists), part('Vokalister', c.singers)].filter(Boolean);
  return s.length ? s.join(' · ') : 'Ingenting nytt – alt var oppdatert fra før.';
}

/**
 * Konverterer «Kopier alt» fra prototypen (liste med låter der vokalistene er lagret som navn).
 * Ukjente navn blir nye vokalister.
 */
export function convertPrototype(input: unknown, singers: Singer[]): { songs: Song[]; newSingers: Singer[] } {
  if (!Array.isArray(input)) throw new Error('Forventet en liste med låter fra prototypen.');
  const newSingers: Singer[] = [];
  const all = () => [...singers, ...newSingers];
  const idFor = (name: unknown): string | undefined => {
    const n = str(name).trim();
    if (!n) return undefined;
    const hit = all().find((s) => s.name.trim().toLowerCase() === n.toLowerCase());
    if (hit) return hit.id;
    const used = new Set(all().map((s) => s.color));
    const s: Singer = { id: uid(), name: n, color: EXTRA_COLORS.find((c) => !used.has(c)) ?? '#5fb7ff', order: Date.now() + newSingers.length, updatedAt: Date.now() };
    newSingers.push(s);
    return s.id;
  };
  const now = Date.now();
  const songs = input.filter(isObj).filter((s) => str(s.title).trim() || str(s.text).trim()).map((s) => {
    const song = normalizeSong({ ...(s as Partial<Song>), id: uid(), hv: undefined, hv2: undefined, k1: undefined, k2: undefined });
    song.hv = idFor(s.hv ?? s.voc);
    song.hv2 = idFor(s.hv2);
    song.k1 = idFor(s.k1);
    song.k2 = idFor(s.k2);
    if (!MODES.includes(s.mode as VocalMode)) song.mode = song.k1 || song.k2 ? 'koring' : 'solo';
    song.updatedAt = now;
    return song;
  });
  if (!songs.length) throw new Error('Fant ingen låter i teksten.');
  return { songs, newSingers };
}

/** Deler filen (AirDrop på iPad) eller laster den ned som reserveløsning. */
export async function shareOrDownload(bundle: Bundle, filename: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const json = JSON.stringify(bundle, null, 1);
  const file = new File([json], filename, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
