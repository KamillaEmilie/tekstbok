// Felles fargeregler for scenevisning og malerverktøy:
// alene = vokalistens farge · sammen = hvit + farget strek til venstre · 2. stemme = strek under · kor = til høyre.
import { personColor, resolveWho, type Person, type Who } from './parser';
import type { RoleCode, Singer, VocalMode } from './types';

export const colorsOf = (people: Person[], light: boolean) => people.filter((p) => p.color).map((p) => personColor(p.color!, light));

const grad = (cols: string[], dir = '') => `linear-gradient(${dir}${(cols.length === 1 ? [cols[0], cols[0]] : cols).join(',')})`;

/** Farget strek under ordene (2. stemme). */
export function underlineStyle(harmony: Person[], light: boolean): string {
  const c = colorsOf(harmony, light);
  if (!c.length) return 'text-decoration:underline;text-underline-offset:0.18em';
  return `background-image:${grad(c, '90deg,')};background-size:100% 0.11em;background-position:0 100%;background-repeat:no-repeat;padding-bottom:0.06em`;
}

/** Kor: i korist-fargen (fargeovergang når flere korer sammen). */
export function korStyle(people: Person[], light: boolean): string {
  const c = colorsOf(people, light);
  if (c.length === 1) return `color:${c[0]}`;
  if (c.length > 1) return `background-image:${grad(c, '90deg,')};-webkit-background-clip:text;background-clip:text;color:transparent`;
  return '';
}

/** Strek til venstre for linjer der flere synger sammen. */
export const barStyle = (cols: string[]) => (cols.length ? grad(cols) : null);

/** I duett er umalt tekst «sammen»: begge hovedvokalene. */
export function defaultTogether(mode: VocalMode | undefined, roles: Partial<Record<RoleCode, string>>, singers: Singer[]): Who | null {
  if (mode !== 'duett' || !roles.hv || !roles.hv2) return null;
  return resolveWho('HV+HV2', roles, singers);
}

/** Korte merker for vokalistene: forbokstav, eller to bokstaver hvis flere starter likt. */
export function singerInitials(singers: Singer[]): Map<string, string> {
  const out = new Map<string, string>();
  const first = (s: Singer) => (s.name.trim()[0] ?? '?').toUpperCase();
  for (const s of singers) {
    const clash = singers.some((o) => o.id !== s.id && first(o) === first(s));
    const n = s.name.trim();
    out.set(s.id, clash ? n.slice(0, 2).charAt(0).toUpperCase() + n.slice(1, 2).toLowerCase() : first(s));
  }
  return out;
}
