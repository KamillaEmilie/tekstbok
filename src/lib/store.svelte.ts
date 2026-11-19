import * as db from './db';
import { DEFAULT_SINGERS, blankSong, uid, EXTRA_COLORS, type Settings, type Setlist, type Singer, type Song } from './types';

export const store = $state({
  loaded: false,
  songs: [] as Song[],
  setlists: [] as Setlist[],
  singers: [] as Singer[],
  settings: { scale: 1, light: false } as Settings,
});

export async function init() {
  const data = await db.loadAll();
  if (!data.seeded && !data.singers.length) {
    data.singers = DEFAULT_SINGERS.map((s) => ({ ...s }));
    await db.putMany({ singers: data.singers });
    await db.putMeta('seeded', true);
  }
  store.songs = data.songs.sort(byTitle);
  store.setlists = data.setlists.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.name.localeCompare(b.name));
  store.singers = data.singers.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (data.settings) store.settings = { ...store.settings, ...data.settings };
  store.loaded = true;
}

const byTitle = (a: Song, b: Song) => a.title.localeCompare(b.title, 'no');

export const songById = (id: string) => store.songs.find((s) => s.id === id);
export const setlistById = (id: string) => store.setlists.find((s) => s.id === id);

// ---------- Låter ----------
export function newSong(): Song {
  const s = blankSong();
  store.songs.push(s);
  void db.put('songs', $state.snapshot(s) as Song);
  return store.songs[store.songs.length - 1];
}

export function saveSong(song: Song) {
  song.updatedAt = Date.now();
  void db.put('songs', $state.snapshot(song) as Song);
}

/** Sletter og returnerer en funksjon som angrer. */
export function deleteSong(id: string): () => void {
  const idx = store.songs.findIndex((s) => s.id === id);
  if (idx < 0) return () => {};
  const song = $state.snapshot(store.songs[idx]) as Song;
  const memberships = store.setlists
    .map((l) => ({ id: l.id, positions: l.songIds.flatMap((x, i) => (x === id ? [i] : [])) }))
    .filter((m) => m.positions.length);
  store.songs.splice(idx, 1);
  void db.del('songs', id);
  for (const m of memberships) {
    const l = setlistById(m.id)!;
    l.songIds = l.songIds.filter((x) => x !== id);
    saveSetlist(l);
  }
  return () => {
    store.songs.splice(Math.min(idx, store.songs.length), 0, song);
    void db.put('songs', song);
    for (const m of memberships) {
      const l = setlistById(m.id);
      if (!l) continue;
      const ids = [...l.songIds];
      for (const p of m.positions) ids.splice(Math.min(p, ids.length), 0, id);
      l.songIds = ids;
      saveSetlist(l);
    }
  };
}

export function sortSongs() {
  store.songs.sort(byTitle);
}

// ---------- Settlister ----------
export function newSetlist(): Setlist {
  const l: Setlist = { id: uid(), name: 'Ny settliste', date: new Date().toISOString().slice(0, 10), songIds: [], updatedAt: Date.now() };
  store.setlists.unshift(l);
  void db.put('setlists', l);
  return store.setlists[0];
}

export function saveSetlist(l: Setlist, invalidateReady = false) {
  l.updatedAt = Date.now();
  if (invalidateReady) l.readyAt = undefined;
  void db.put('setlists', $state.snapshot(l) as Setlist);
}

export function deleteSetlist(id: string): () => void {
  const idx = store.setlists.findIndex((s) => s.id === id);
  if (idx < 0) return () => {};
  const l = $state.snapshot(store.setlists[idx]) as Setlist;
  store.setlists.splice(idx, 1);
  void db.del('setlists', id);
  return () => {
    store.setlists.splice(idx, 0, l);
    void db.put('setlists', l);
  };
}

// ---------- Vokalister ----------
export function newSinger(): Singer {
  const used = new Set(store.singers.map((s) => s.color));
  const color = EXTRA_COLORS.find((c) => !used.has(c)) ?? '#5fb7ff';
  const s: Singer = { id: uid(), name: '', color, order: Date.now(), updatedAt: Date.now() };
  store.singers.push(s);
  void db.put('singers', s);
  return store.singers[store.singers.length - 1];
}

export function saveSinger(s: Singer) {
  s.updatedAt = Date.now();
  void db.put('singers', $state.snapshot(s) as Singer);
}

export function deleteSinger(id: string): () => void {
  const idx = store.singers.findIndex((s) => s.id === id);
  if (idx < 0) return () => {};
  const s = $state.snapshot(store.singers[idx]) as Singer;
  store.singers.splice(idx, 1);
  void db.del('singers', id);
  return () => {
    store.singers.splice(idx, 0, s);
    void db.put('singers', s);
  };
}

// ---------- Innstillinger ----------
export function saveSettings() {
  void db.putMeta('settings', $state.snapshot(store.settings));
}

/** Etter import: les alt inn på nytt fra databasen. */
export async function reload() {
  await init();
}
