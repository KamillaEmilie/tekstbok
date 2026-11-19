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

export type Setlist = {
  id: string;
  name: string;
  date?: string;
  venue?: string;
  songIds: string[];
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
