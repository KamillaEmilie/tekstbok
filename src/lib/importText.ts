// Ny låt fra innlimt tekst, og oppslag av varighet i Apple Music-katalogen (bare tid, aldri tekst).
import { autoSplit } from './parser';

export type Pasted = { title: string; artist: string; text: string };

/**
 * Rydder innlimt tekst og gjetter tittel/artist når første linje tydelig er en overskrift:
 * «Tittel Lyrics», «Tittel by Artist» eller «Artist – Tittel lyrics». Ellers står feltene tomme.
 */
export function fromPastedText(raw: string): Pasted {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  let title = '';
  let artist = '';
  const first = (lines[0] ?? '').trim();
  // Genius: «54 ContributorsTranslationsEnglishTittel Lyrics»
  const LANGS =
    'English|Español|Português|Deutsch|Français|Italiano|Русский|Polski|Türkçe|Nederlands|Svenska|Norsk|Dansk|Suomi|Română|Čeština|Magyar|Українська|Ελληνικά|עברית|العربية|فارسی|日本語|한국어|中文|Tiếng Việt|हिन्दी|Bahasa Indonesia';
  const head = first.replace(new RegExp(`^\\d+\\s*Contributors?(Translations?((${LANGS})\\s*)*)?`, 'i'), '').trim();
  let m: RegExpMatchArray | null;
  if (head.length <= 80 && (m = head.match(/^(.+?)\s+(?:lyrics|songtekst|tekst)$/i))) {
    const t = m[1].trim();
    const dash = t.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (dash) [artist, title] = [dash[1].trim(), dash[2].trim()];
    else title = t;
    lines.shift();
  } else if (head.length <= 80 && (m = head.match(/^(.+?)\s+by\s+(.+)$/i)) && lines.length > 2) {
    [title, artist] = [m[1].trim(), m[2].trim()];
    lines.shift();
  }
  return { title, artist, text: autoSplit(lines.join('\n')) };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

type ITunesTrack = { trackName: string; artistName: string; trackTimeMillis?: number };

/** Velger beste treff: tittel må stemme; artist gir ekstra poeng. */
export function pickTrack(results: ITunesTrack[], title: string, artist: string): ITunesTrack | null {
  const t = norm(title);
  const a = norm(artist);
  let best: { r: ITunesTrack; score: number } | null = null;
  for (const r of results) {
    if (!r.trackTimeMillis) continue;
    const rt = norm(r.trackName);
    let score = rt === t ? 3 : rt.startsWith(t) || t.startsWith(rt) ? 2 : 0;
    if (!score) continue;
    if (a && (norm(r.artistName).includes(a.split(' ')[0]) || a.includes(norm(r.artistName)))) score += 2;
    if (!best || score > best.score) best = { r, score };
  }
  return best?.r ?? null;
}

export const formatMs = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Slår opp omtrentlig varighet («3:45»). null hvis ikke funnet eller ingen nett. */
export async function lookupDuration(title: string, artist = ''): Promise<string | null> {
  if (!title.trim() || (typeof navigator !== 'undefined' && !navigator.onLine)) return null;
  const term = `${title} ${artist.split(',')[0]}`.trim();
  const url = `https://itunes.apple.com/search?${new URLSearchParams({ term, entity: 'song', limit: '10', country: 'NO' })}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { results: ITunesTrack[] };
    const hit = pickTrack(data.results ?? [], title, artist);
    return hit?.trackTimeMillis ? formatMs(hit.trackTimeMillis) : null;
  } catch {
    return null;
  }
}
