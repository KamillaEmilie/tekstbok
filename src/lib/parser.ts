import type { RoleCode, Singer } from './types';

/** Linjer som kommer med når man limer inn fra tekstsider. */
const JUNK = /^\s*(source:|songwriters?:|written by:)|lyrics\s*©|\blyricfind\b|\bmusixmatch\b/i;

export function clean(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((l) => !JUNK.test(l))
    .join('\n')
    .trim();
}

const norm = (l: string) =>
  l
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, '');

/**
 * Hvis teksten mangler tomme linjer: sett inn skillelinjer der en serie
 * gjentatte linjer starter eller slutter (sannsynlig refreng).
 */
export function autoSplit(text: string): string {
  const t = clean(text);
  if (/\n\s*\n/.test(t)) return t;
  const lines = t.split('\n');
  const cnt = new Map<string, number>();
  for (const l of lines) cnt.set(norm(l), (cnt.get(norm(l)) ?? 0) + 1);
  const isRep = (l: string) => (cnt.get(norm(l)) ?? 0) > 1;
  const out: string[] = [];
  lines.forEach((l, i) => {
    if (i > 0 && isRep(l) !== isRep(lines[i - 1])) out.push('');
    out.push(l);
  });
  return out.join('\n');
}

export type Person = { id?: string; name: string; color?: string };
export type Who = { people: Person[]; all: boolean };
export type ParsedLine = { text: string; who: Who | null; repeated: boolean };
export type ParsedSection = { label: string; who: Who | null; chorus: boolean; lines: ParsedLine[] };
export type ParsedSong = { sections: ParsedSection[]; marked: boolean };

const ALL_WORDS = ['alle', 'all', 'tutti', 'begge'];
const CODES: Record<string, RoleCode> = { hv: 'hv', hv1: 'hv', hv2: 'hv2', k1: 'k1', k2: 'k2' };

/**
 * Oversetter «HV+K1», «Alle», «Siri & Leif» osv. til personer.
 * strict = true: returner null hvis noen del er ukjent (brukes for «(…)» først på linjen,
 * så ad-lib som «(Ooh) baby» ikke tolkes som et navn).
 */
export function resolveWho(
  str: string,
  roles: Partial<Record<RoleCode, string>>,
  singers: Singer[],
  strict = false,
): Who | null {
  const parts = str
    .split(/\s*[+,&]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const people: Person[] = [];
  let all = false;
  const byId = (id: string) => singers.find((s) => s.id === id);
  const byName = (n: string) => singers.find((s) => s.name.trim().toLowerCase() === n.toLowerCase());
  const add = (p: Person) => {
    if (!people.some((q) => (p.id ? q.id === p.id : q.name.toLowerCase() === p.name.toLowerCase()))) people.push(p);
  };
  const fromSinger = (s: Singer): Person => ({ id: s.id, name: s.name, color: s.color });

  for (const part of parts) {
    const k = part.toLowerCase();
    if (ALL_WORDS.includes(k)) {
      all = true;
      for (const id of Object.values(roles)) {
        const s = id && byId(id);
        if (s) add(fromSinger(s));
      }
      continue;
    }
    if (k in CODES) {
      const id = roles[CODES[k]];
      const s = id && byId(id);
      if (s) add(fromSinger(s));
      else if (strict) {
        // Kjent kode, men ingen valgt person: godta som merking uten farge.
        add({ name: part.toUpperCase() });
      } else add({ name: part.toUpperCase() });
      continue;
    }
    const s = byName(part);
    if (s) add(fromSinger(s));
    else if (strict) return null;
    else add({ name: part });
  }
  return { people, all };
}

const LABEL = /^\s*\[(.+)\]\s*$/;
const LINE_WHO = /^\s*\(([^)]+)\)\s*(.*)$/;
const CHORUS = /refreng|chorus|^\s*ref\b|^\s*kor\b/i;

export function parseSong(
  text: string,
  roles: Partial<Record<RoleCode, string>>,
  singers: Singer[],
): ParsedSong {
  type Raw = { label: string; whoStr: string; lines: { text: string; who: Who | null }[] };
  const raws: Raw[] = [];
  let cur: Raw | null = null;
  let marked = false;

  for (const raw of clean(text).split('\n')) {
    if (!raw.trim()) {
      cur = null;
      continue;
    }
    const m = raw.match(LABEL);
    if (m) {
      const [label, whoStr = ''] = m[1].split('|');
      cur = { label: label.trim(), whoStr: whoStr.trim(), lines: [] };
      raws.push(cur);
      marked = true;
      continue;
    }
    if (!cur) {
      cur = { label: '', whoStr: '', lines: [] };
      raws.push(cur);
    }
    const lm = raw.match(LINE_WHO);
    const lw = lm ? resolveWho(lm[1], roles, singers, true) : null;
    if (lm && lw) {
      marked = true;
      cur.lines.push({ text: lm[2], who: lw });
    } else {
      cur.lines.push({ text: raw.trim(), who: null });
    }
  }

  const cnt = new Map<string, number>();
  for (const r of raws) for (const l of r.lines) cnt.set(norm(l.text), (cnt.get(norm(l.text)) ?? 0) + 1);

  const sections = raws.map<ParsedSection>((r) => {
    const who = r.whoStr ? resolveWho(r.whoStr, roles, singers) : null;
    return {
      label: r.label,
      who,
      chorus: CHORUS.test(r.label),
      lines: r.lines.map((l) => ({
        text: l.text,
        who: l.who,
        repeated: !marked && norm(l.text) !== '' && (cnt.get(norm(l.text)) ?? 0) > 1,
      })),
    };
  });
  return { sections, marked };
}

/** Personfarge, gjort mørkere i lys visning så den er lesbar på hvitt. */
export function personColor(color: string, light: boolean): string {
  return light ? `color-mix(in srgb, ${color} 62%, black)` : color;
}

/**
 * Farger for en «hvem»: én person → tekst og strek i personens farge.
 * Flere → nøytral tekst og strek med fargeovergang.
 */
export function whoStyle(who: Who | null, light: boolean): { text?: string; bar?: string } {
  if (!who) return {};
  const cols = who.people.filter((p) => p.color).map((p) => personColor(p.color!, light));
  if (who.people.length === 1 && cols.length === 1) {
    return { text: cols[0], bar: `linear-gradient(${cols[0]},${cols[0]})` };
  }
  if (cols.length === 1) return { bar: `linear-gradient(${cols[0]},${cols[0]})` };
  if (cols.length > 1) return { bar: `linear-gradient(${cols.join(',')})` };
  return {};
}
