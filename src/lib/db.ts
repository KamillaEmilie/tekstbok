import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Settings, Setlist, Singer, Song } from './types';

interface TekstbokDB extends DBSchema {
  songs: { key: string; value: Song };
  setlists: { key: string; value: Setlist };
  singers: { key: string; value: Singer };
  meta: { key: string; value: unknown };
}

export type StoreName = 'songs' | 'setlists' | 'singers';

let dbp: Promise<IDBPDatabase<TekstbokDB>> | null = null;
function db() {
  return (dbp ??= openDB<TekstbokDB>('tekstbok', 1, {
    upgrade(d) {
      d.createObjectStore('songs', { keyPath: 'id' });
      d.createObjectStore('setlists', { keyPath: 'id' });
      d.createObjectStore('singers', { keyPath: 'id' });
      d.createObjectStore('meta');
    },
  }));
}

export async function loadAll() {
  const d = await db();
  const [songs, setlists, singers, settings, seeded] = await Promise.all([
    d.getAll('songs'),
    d.getAll('setlists'),
    d.getAll('singers'),
    d.get('meta', 'settings') as Promise<Settings | undefined>,
    d.get('meta', 'seeded') as Promise<boolean | undefined>,
  ]);
  return { songs, setlists, singers, settings, seeded: !!seeded };
}

export async function put<S extends StoreName>(store: S, value: TekstbokDB[S]['value']) {
  await (await db()).put(store, value);
}

export async function del(store: StoreName, id: string) {
  await (await db()).delete(store, id);
}

export async function putMeta(key: string, value: unknown) {
  await (await db()).put('meta', value, key);
}

/** Skriver mange objekter i én transaksjon (brukes ved import). */
export async function putMany(items: { songs?: Song[]; setlists?: Setlist[]; singers?: Singer[] }) {
  const d = await db();
  const tx = d.transaction(['songs', 'setlists', 'singers'], 'readwrite');
  for (const s of items.songs ?? []) tx.objectStore('songs').put(s);
  for (const s of items.setlists ?? []) tx.objectStore('setlists').put(s);
  for (const s of items.singers ?? []) tx.objectStore('singers').put(s);
  await tx.done;
}
