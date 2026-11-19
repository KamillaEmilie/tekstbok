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
