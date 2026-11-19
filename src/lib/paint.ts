// Malerverktøyet: gjør en tekstlinje om til ord med «maling» (kor eller 2. stemme), og tilbake.
// Brukeren ser aldri kodene; de skrives som {K1: …} og {/K1: …} i teksten i bakgrunnen.
import { INLINE, LABEL, LINE_WHO, resolveWho, withoutLead } from './parser';
import type { RoleCode, Singer, VocalMode } from './types';

/** code = hvem (f.eks. «K1», «K1+K2», «HV2»; '' = standard koring). harm = 2. stemme (strek under). */
export type Paint = { code: string; harm: boolean };
/** fromTag = malingen kommer fra et linjemerke som «(K1)» foran hele linjen. */
export type Token = { w: string; paint: Paint | null; fromTag?: boolean };
type Roles = Partial<Record<RoleCode, string>>;

export const samePaint = (a: Paint | null, b: Paint | null) =>
  a === b || (!!a && !!b && a.code === b.code && a.harm === b.harm);

/** «(K1)» / «(HV/K1)» / «(/K1)» først på linjen → maling for hele linjen. Hovedstemmen alene gir ingen maling. */
function tagToPaint(tag: string, roles: Roles, singers: Singer[], mode?: VocalMode): Paint | null {
  const [mel, harm] = tag.split('/');
  if (harm !== undefined && harm.trim()) return { code: harm.trim(), harm: true };
  const who = withoutLead(resolveWho(mel, roles, singers, true), mode, roles);
  return who && who.people.length ? { code: mel.trim(), harm: false } : null;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);

/** Tekstlinje → ord med maling. */
export function lineToTokens(line: string, roles: Roles, singers: Singer[], mode?: VocalMode): Token[] {
  let body = line.trim();
  let base: Paint | null = null;
  const lm = body.match(LINE_WHO);
  if (lm && resolveWho(lm[1], roles, singers, true)) {
    body = lm[2];
    base = tagToPaint(lm[1], roles, singers, mode);
  }
  const hasKoring = !!(roles.k1 || roles.k2);
  const toks: Token[] = [];
  let last = 0;
  for (const m of body.matchAll(INLINE)) {
    const code = m[1];
    const valid = code !== undefined ? !!resolveWho(code, roles, singers, true) : hasKoring;
    if (!valid || !m[2].trim()) continue;
    for (const w of words(body.slice(last, m.index))) toks.push({ w, paint: base, fromTag: !!base });
    const paint: Paint =
      code === undefined ? { code: '', harm: false } : { code: code.trim().replace(/^\//, '').trim(), harm: code.trim().startsWith('/') };
    for (const w of words(m[2])) toks.push({ w, paint });
    last = m.index! + m[0].length;
  }
  for (const w of words(body.slice(last))) toks.push({ w, paint: base, fromTag: !!base });
  return toks;
}

/** Ord med maling → tekstlinje. Ord med samme maling slås sammen til én {…}. */
export function tokensToLine(toks: Token[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < toks.length) {
    const p = toks[i].paint;
    let j = i;
    while (j < toks.length && samePaint(toks[j].paint, p)) j++;
    const text = toks
      .slice(i, j)
      .map((t) => t.w)
      .join(' ');
    if (!p) out.push(text);
    else if (!p.code && !p.harm) out.push(`{${text}}`);
    else out.push(`{${p.harm ? '/' : ''}${p.code}: ${text}}`);
    i = j;
  }
  return out.join(' ');
}

/** Maler ett ord: samme pensel en gang til (eller viskelær) fjerner malingen. */
export function paintWord(line: string, index: number, pen: Paint | null, roles: Roles, singers: Singer[], mode?: VocalMode): string {
  const toks = lineToTokens(line, roles, singers, mode);
  if (!toks[index]) return line;
  // Et gammelt linjemerke («(K1)» foran hele linjen) behandles som én enhet: 2. stemme betyr at
  // hovedstemmen synger linjen, og viskelær fjerner hele merket.
  if (toks[index].fromTag && (!pen || pen.harm)) {
    for (const t of toks) if (t.fromTag) t.paint = null;
    if (!pen) return tokensToLine(toks);
  }
  toks[index] = { ...toks[index], paint: pen && !samePaint(toks[index].paint, pen) ? pen : null };
  return tokensToLine(toks);
}

/** «[Vers 1 | Siri]» → { label, who }. */
export function readLabel(line: string): { label: string; who: string } | null {
  const m = line.match(LABEL);
  if (!m) return null;
  const [label, who = ''] = m[1].split('|');
  return { label: label.trim(), who: who.trim() };
}

/** Lager delmerke-linjen. Tom etikett og ingen «hvem» gir null (linjen kan fjernes). */
export function writeLabel(label: string, who: string): string | null {
  if (!label && !who) return null;
  return who ? `[${label} | ${who}]` : `[${label}]`;
}
