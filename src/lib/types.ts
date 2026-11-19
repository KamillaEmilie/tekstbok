export type Singer = { id: string; name: string; color: string; order?: number; updatedAt?: number };
export type VocalMode = 'solo' | 'duett' | 'koring';
export type Layout = 'scroll' | 'cols2' | 'fit';
export type RoleCode = 'hv' | 'hv2' | 'k1' | 'k2';

export type Song = {
  id: string;
  title: string;
  artist?: string;
  key?: string;
  bpm?: string;
  capo?: string;
  /** Omtrentlig lengde, f.eks. «3:45». */
  duration?: string;
  notes?: string;
  mode: VocalMode;
  hv?: string;
  hv2?: string;
  k1?: string;
  k2?: string;
  layout: Layout;
  text: string;
  updatedAt: number;
};

/** Skille i settlisten: pause, eller notat om hva vi skal si mellom låtene. */
export type MarkerKind = 'pause' | 'prat';
export type Marker = { kind: MarkerKind; text: string };

export type Setlist = {
  id: string;
  name: string;
  date?: string;
  venue?: string;
  /** Rekkefølgen. Inneholder låt-id-er og skille-id-er (som starter med «m:»). */
  songIds: string[];
  /** Innholdet i skillene, slått opp på id. */
  markers?: Record<string, Marker>;
  readyAt?: number;
  updatedAt?: number;
};

export type Settings = {
  scale: number;
  light: boolean;
  lastExportAt?: number;
};

/** Hvilke roller som gjelder for hver vokalmodus, i visningsrekkefølge. */
export const MODE_ROLES: Record<VocalMode, { code: RoleCode; label: string }[]> = {
  solo: [{ code: 'hv', label: 'Hovedvokal' }],
  duett: [
    { code: 'hv', label: 'Hovedvokal 1' },
    { code: 'hv2', label: 'Hovedvokal 2' },
  ],
  koring: [
    { code: 'hv', label: 'Hovedvokal' },
    { code: 'k1', label: 'Koring 1' },
    { code: 'k2', label: 'Koring 2' },
  ],
};

export const MODE_NAMES: Record<VocalMode, string> = { solo: 'Solo', duett: 'Duett', koring: 'Med koring' };
export const LAYOUT_NAMES: Record<Layout, string> = { scroll: 'Nedover', cols2: 'To spalter', fit: 'Én skjerm' };
export const LAYOUTS: Layout[] = ['scroll', 'cols2', 'fit'];

/** Rollene (kode → singer-id) som er aktive for låtens vokalmodus. */
export function activeRoles(song: Pick<Song, 'mode' | RoleCode>): Partial<Record<RoleCode, string>> {
  const out: Partial<Record<RoleCode, string>> = {};
  for (const r of MODE_ROLES[song.mode] ?? MODE_ROLES.solo) {
    const v = song[r.code];
    if (v) out[r.code] = v;
  }
  return out;
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function blankSong(): Song {
  return { id: uid(), title: '', artist: '', mode: 'solo', layout: 'scroll', text: '', updatedAt: Date.now() };
}

export const DEFAULT_SINGERS: Singer[] = [
  { id: 'siri', name: 'Siri', color: '#ff7eb6', order: 0 },
  { id: 'kamilla', name: 'Kamilla', color: '#ffd23f', order: 1 },
  { id: 'leif', name: 'Leif', color: '#5ee07a', order: 2 },
];

export const EXTRA_COLORS = ['#5fb7ff', '#c3a6ff', '#ff9f5a', '#4fe0d2', '#ff6b6b'];

/** «3:45» → 225 sekunder. Tåler også «3.45» og «225». Ugyldig → null. */
export function durationSec(d?: string): number | null {
  const t = (d ?? '').trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,3})[:.](\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  if (/^\d+$/.test(t)) return Number(t);
  return null;
}

/** 3125 sekunder → «52 min», 4000 → «1 t 7 min». */
export function formatTotal(sec: number): string {
  const min = Math.round(sec / 60);
  return min >= 60 ? `${Math.floor(min / 60)} t ${min % 60} min` : `${min} min`;
}

export const MARKER_PREFIX = 'm:';
export const isMarker = (id: string) => id.startsWith(MARKER_PREFIX);
export const newMarkerId = () => MARKER_PREFIX + uid();
export const MARKER_NAMES: Record<MarkerKind, string> = { pause: 'Pause', prat: 'Prat' };

/** Bare låtene i settlisten, uten skiller. */
export const songIdsOnly = (l: Pick<Setlist, 'songIds'>) => l.songIds.filter((id) => !isMarker(id));

export type SetSummary = { songs: number; sec: number; missing: number };

/** Deler settlisten i sett ved hver pause, og summerer antall låter og tid per sett. Prat deler ikke. */
export function setSummaries(
  l: Pick<Setlist, 'songIds' | 'markers'>,
  durationOf: (songId: string) => string | undefined,
): SetSummary[] {
  const sets: SetSummary[] = [{ songs: 0, sec: 0, missing: 0 }];
  for (const id of l.songIds) {
    if (isMarker(id)) {
      if (l.markers?.[id]?.kind === 'pause') sets.push({ songs: 0, sec: 0, missing: 0 });
      continue;
    }
    const cur = sets[sets.length - 1];
    cur.songs++;
    const d = durationSec(durationOf(id));
    if (d === null) cur.missing++;
    else cur.sec += d;
  }
  return sets.filter((s) => s.songs > 0);
}

/** «6 låter · ca. 22 min» (+ hvor mange som mangler tid). */
export function describeSet(s: SetSummary): string {
  const parts = [`${s.songs} ${s.songs === 1 ? 'låt' : 'låter'}`];
  if (s.sec) parts.push(`ca. ${formatTotal(s.sec)}`);
  if (s.missing) parts.push(`${s.missing} uten tid`);
  return parts.join(' · ');
}
