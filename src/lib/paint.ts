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

/** «Siri alene» + «Kamilla 2. stemme» → «Siri med Kamilla på 2. stemme» ({HV2/HV: …}). */
const combine = (base: Paint, harm: Paint): Paint => ({ code: `${base.code}/${harm.code}`, harm: false });
const splitCombined = (p: Paint) => (p.harm || !p.code.includes('/') ? null : p.code.split('/').map((x) => x.trim()));

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
  const cur = toks[index].paint;
  const parts = cur && splitCombined(cur);
  let next: Paint | null;
  if (pen?.harm && parts && parts[1] === pen.code) next = { code: parts[0], harm: false }; // fjern 2. stemmen igjen
  else if (pen?.harm && cur && !cur.harm && cur.code && !parts) next = combine(cur, pen); // legg 2. stemme på en solo
  else next = pen && !samePaint(cur, pen) ? pen : null;
  toks[index] = { ...toks[index], paint: next };
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

/**
 * Gjør gammel merking av hele deler («[Vers 3 | Siri]») om til maling på ordene, så alt kan
 * endres med penslene. Delnavnet beholdes. Returnerer null hvis ingenting ble endret.
 */
export function flattenSectionWho(text: string, roles: Roles, singers: Singer[], mode?: VocalMode): string | null {
  const lines = text.split('\n');
  let changed = false;
  let paint: Paint | null | undefined; // undefined = ingen aktiv del-merking
  let afterLabel = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      if (!afterLabel) paint = undefined;
      continue;
    }
    const lab = LABEL.test(line) ? readLabel(line) : null;
    if (lab) {
      afterLabel = true;
      paint = undefined;
      if (!lab.who) continue;
      const who = resolveWho(lab.who, roles, singers);
      if (!who) continue;
      const [mel, harm] = lab.who.split('/');
      const melWho = withoutLead(resolveWho(mel, roles, singers), mode, roles);
      const together = mode === 'duett' && melWho && melWho.people.length > 1;
      const melPaint = melWho?.people.length && !together ? { code: mel.trim(), harm: false } : null;
      const harmPaint = harm?.trim() ? { code: harm.trim(), harm: true } : null;
      paint = melPaint && harmPaint ? combine(melPaint, harmPaint) : (melPaint ?? harmPaint);
      const nl = writeLabel(lab.label, '');
      if (nl === null) {
        lines.splice(i, 1);
        i--;
      } else lines[i] = nl;
      changed = true;
      continue;
    }
    afterLabel = false;
    const p = paint;
    if (!p) continue;
    const toks = lineToTokens(line, roles, singers, mode).map((t) =>
      !t.paint ? { ...t, paint: p } : t.paint.harm && !p.harm && !splitCombined(p) ? { ...t, paint: combine(p, t.paint) } : t,
    );
    lines[i] = tokensToLine(toks);
  }
  return changed ? lines.join('\n') : null;
}
