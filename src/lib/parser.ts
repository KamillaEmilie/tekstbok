import type { RoleCode, Singer, VocalMode } from './types';

/** Linjer som kommer med når man limer inn fra tekstsider. */
const JUNK =
  /^\s*(source:|songwriters?:|written by:|lyrics provided by|lyrics licensed by|you might also like\s*$|see .+ live\s*$|get tickets|read more\s*$|translations?\s*$|\d+\s*contributors?\b)|lyrics\s*©|\blyricfind\b|\bmusixmatch\b/i;

export function clean(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((l) => !JUNK.test(l))
    .map((l) => l.replace(/\d*\s*Embed\s*$/, '')) // Genius legger «123Embed» på siste linje
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
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
/** people = melodien (samme melodi om flere), harmony = annenstemme over samme tekst. */
export type Who = { people: Person[]; all: boolean; harmony: Person[] };
/**
 * En bit av en linje. who ≠ null betyr at denne biten synges av andre (koring),
 * eller – når who.people er tom og who.harmony ikke – at noen legger annenstemme på ordene.
 * margin = koring som står til slutt i linjen og vises i margen.
 */
export type Part = { text: string; who: Who | null; margin?: boolean };
export type ParsedLine = { text: string; who: Who | null; repeated: boolean; parts: Part[] };
export type ParsedSection = { label: string; who: Who | null; chorus: boolean; lines: ParsedLine[] };
export type ParsedSong = { sections: ParsedSection[]; marked: boolean };

const ALL_WORDS = ['alle', 'all', 'tutti', 'begge'];
const CODES: Record<string, RoleCode> = { hv: 'hv', hv1: 'hv', hv2: 'hv2', k1: 'k1', k2: 'k2' };

/** «HV+K1», «Siri & Leif», «Alle» → personer. null hvis strict og noe er ukjent. */
function resolvePeople(
  str: string,
  roles: Partial<Record<RoleCode, string>>,
  singers: Singer[],
  strict: boolean,
): { people: Person[]; all: boolean } | null {
  const parts = str
    .split(/\s*[+,&]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
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
      // Kjent kode uten valgt person: godta som merking uten farge.
      add(s ? fromSinger(s) : { name: part.toUpperCase() });
      continue;
    }
    const s = byName(part);
    if (s) add(fromSinger(s));
    else if (strict) return null;
    else add({ name: part });
  }
  return { people, all };
}

/**
 * Oversetter «HV+K1», «Alle», «Siri & Leif» og «Siri / Kamilla» (melodi / annenstemme) til personer.
 * strict = true: returner null hvis noen del er ukjent (brukes for «(…)» først på linjen,
 * så ad-lib som «(Ooh) baby» ikke tolkes som et navn).
 */
export function resolveWho(
  str: string,
  roles: Partial<Record<RoleCode, string>>,
  singers: Singer[],
  strict = false,
): Who | null {
  const [mel, ...rest] = str.split('/');
  const melody = resolvePeople(mel, roles, singers, strict);
  const harm = rest.length ? resolvePeople(rest.join('+'), roles, singers, strict) : { people: [], all: false };
  if (!melody || !harm) return null;
  if (!melody.people.length && !harm.people.length) return null;
  // Den som synger annenstemme, er ikke også med på melodien.
  const harmony = harm.people;
  const people = melody.people.filter((p) => !harmony.some((h) => (p.id ? h.id === p.id : h.name === p.name)));
  return { people, all: melody.all, harmony };
}

export const LABEL = /^\s*\[(.+)\]\s*$/;
/** «{K1: ord}», «{Siri+Leif: ord}», «{/K1: ord}» (annenstemme) eller bare «{ord}» (koring = K1+K2). */
export const INLINE = /\{(?:([^{}:]+):\s*)?([^{}]*)\}/g;

/** Deler en linje i biter, der «{…}» blir egne biter. Ukjent «hvem» lar teksten stå som den er. */
export function splitInline(
  line: string,
  roles: Partial<Record<RoleCode, string>>,
  singers: Singer[],
): Part[] {
  const parts: Part[] = [];
  let last = 0;
  const koring = roles.k1 || roles.k2 ? resolveWho([roles.k1 && 'K1', roles.k2 && 'K2'].filter(Boolean).join('+'), roles, singers) : null;
  for (const m of line.matchAll(INLINE)) {
    const who = m[1] !== undefined ? resolveWho(m[1], roles, singers, true) : koring;
    if (!who || !m[2].trim()) continue;
    if (m.index! > last) parts.push({ text: line.slice(last, m.index), who: null });
    parts.push({ text: m[2], who });
    last = m.index! + m[0].length;
  }
  if (last < line.length) parts.push({ text: line.slice(last), who: null });
  if (!parts.length) return [{ text: line, who: null }];
  // Koring helt til slutt i linjen (bare tegn/mellomrom etter) vises i margen.
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (!p.who) {
      if (/^[\s.,!?…)\-–]*$/.test(p.text)) continue;
      break;
    }
    if (!p.who.people.length) break; // annenstemme hører hjemme i teksten
    // Bare korister flyttes ut; en hovedvokal som synger alene (f.eks. i duett) blir stående.
    if (p.who.people.some((x) => x.id && (x.id === roles.hv || x.id === roles.hv2))) break;
    p.margin = true;
  }
  return parts;
}
export const LINE_WHO = /^\s*\(([^)]+)\)\s*(.*)$/;
const CHORUS = /refreng|chorus|^\s*ref\b|^\s*kor\b/i;

/**
 * Hovedstemmen er standard og vises hvit. Med solo og koring tas derfor hovedvokalen ut av melodien
 * (annenstemme og koring beholdes). I duett er hver av dere et unntak, så der beholdes alt.
 */
export function withoutLead(who: Who | null, mode: VocalMode | undefined, roles: Partial<Record<RoleCode, string>>): Who | null {
  if (!who || !mode || mode === 'duett' || !roles.hv) return who;
  // Bare når hovedvokalen synger alene; synger flere sammen, er det «sammen».
  if (who.people.length !== 1 || who.people[0].id !== roles.hv) return who;
  if (!who.harmony.length) return null;
  return { ...who, people: [], all: false };
}

/** Hvordan en «hvem» skal vises. */
export type VocalKind = 'solo' | 'together' | 'kor' | 'harm' | 'none';
export function vocalKind(who: Who | null, mode: VocalMode | undefined, roles: Partial<Record<RoleCode, string>>): VocalKind {
  if (!who) return 'none';
  if (!who.people.length) return who.harmony.length ? 'harm' : 'none';
  // Med solo/koring er hovedvokalen alene standarden og vises hvit (eventuelt med 2. stemme under).
  if (mode !== 'duett' && who.people.length === 1 && who.people[0].id && who.people[0].id === roles.hv)
    return who.harmony.length ? 'harm' : 'none';
  const lead = (p: Person) => !!p.id && (p.id === roles.hv || p.id === roles.hv2);
  if (mode === 'koring' && !who.people.some(lead)) return 'kor';
  return who.people.length > 1 ? 'together' : 'solo';
}

export function parseSong(
  text: string,
  roles: Partial<Record<RoleCode, string>>,
  singers: Singer[],
  mode?: VocalMode,
): ParsedSong {
  type Raw = { label: string; whoStr: string; lines: { text: string; who: Who | null; parts: Part[] }[] };
  const raws: Raw[] = [];
  let cur: Raw | null = null;
  let marked = false;

  for (const raw of clean(text).split('\n')) {
    if (!raw.trim()) {
      // Et delmerke uten tekst ennå gjelder også etter en tom linje.
      if (cur && cur.label && !cur.lines.length) continue;
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
    const body = lm && lw ? lm[2] : raw.trim();
    const parts = splitInline(body, roles, singers);
    if (lw || parts.some((p) => p.who)) marked = true;
    cur.lines.push({ text: parts.map((p) => p.text).join(''), who: withoutLead(lw, mode, roles), parts });
  }

  const cnt = new Map<string, number>();
  for (const r of raws) for (const l of r.lines) cnt.set(norm(l.text), (cnt.get(norm(l.text)) ?? 0) + 1);

  const sections = raws.map<ParsedSection>((r) => {
    return {
      label: r.label,
      who: withoutLead(r.whoStr ? resolveWho(r.whoStr, roles, singers) : null, mode, roles),
      chorus: CHORUS.test(r.label),
      lines: r.lines.map((l) => ({
        text: l.text,
        who: l.who,
        parts: l.parts,
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

const gradient = (cols: string[]) => `linear-gradient(${(cols.length === 1 ? [cols[0], cols[0]] : cols).join(',')})`;

/**
 * Farger for en «hvem»: én person → tekst og strek i personens farge.
 * Flere på melodien → nøytral tekst og strek med fargeovergang.
 * Annenstemme → egen, tynnere strek (bar2) ved siden av.
 */
export function whoStyle(who: Who | null, light: boolean): { text?: string; bar?: string; bar2?: string } {
  if (!who) return {};
  const cols = who.people.filter((p) => p.color).map((p) => personColor(p.color!, light));
  const hcols = (who.harmony ?? []).filter((p) => p.color).map((p) => personColor(p.color!, light));
  const out: { text?: string; bar?: string; bar2?: string } = {};
  if (who.people.length === 1 && cols.length === 1) out.text = cols[0];
  if (cols.length) out.bar = cols.length === 1 ? `linear-gradient(${cols[0]},${cols[0]})` : `linear-gradient(${cols.join(',')})`;
  if (hcols.length) out.bar2 = gradient(hcols);
  return out;
}

/** CSS-bakgrunn for strekene til venstre for en del: tykk for melodien, tynn for annenstemmen. */
export function barBackground(st: { bar?: string; bar2?: string }): string | null {
  const layers: string[] = [];
  if (st.bar) layers.push(`${st.bar} 0 0 / 5px 100% no-repeat`);
  if (st.bar2) layers.push(`${st.bar2} ${st.bar ? 8 : 0}px 0 / 3px 100% no-repeat`);
  return layers.length ? layers.join(', ') : null;
}
